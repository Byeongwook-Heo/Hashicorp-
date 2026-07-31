import { performance } from "node:perf_hooks";

import { AuthorizationError, ExternalServiceError } from "./errors.js";
import type { SecurityEventStore } from "./event-store.js";
import type { IdentityContext, IdentityProvider } from "./identity-client.js";
import type { OrdersDatabase } from "./database.js";
import type { VaultCredentialBroker } from "./vault-client.js";
import type {
  DynamicDatabaseCredentials,
  FailedPaymentSummary,
  FailedPaymentSummaryResult,
  OrderStatus,
  OrderStatusResult,
  SensitivePaymentDenial,
} from "./types.js";

export class ToolService {
  public constructor(
    private readonly identity: IdentityProvider,
    private readonly vault: VaultCredentialBroker,
    private readonly database: OrdersDatabase,
    private readonly events: SecurityEventStore,
    private readonly nhiName = "bob-db-reader",
  ) {}

  public async getOrderStatus(
    requestId: string,
    orderId: string,
    identityContext?: IdentityContext,
  ): Promise<OrderStatusResult> {
    return this.#runAuthorized(
      requestId,
      "get_order_status",
      identityContext,
      (credentials) => this.database.getOrderStatus(credentials, orderId),
    );
  }

  public async getFailedPaymentSummary(
    requestId: string,
    date: string,
    identityContext?: IdentityContext,
  ): Promise<FailedPaymentSummaryResult> {
    return this.#runAuthorized(
      requestId,
      "get_failed_payment_summary",
      identityContext,
      (credentials) => this.database.getFailedPaymentSummary(credentials, date),
    );
  }

  public async getSensitivePaymentData(
    requestId: string,
    customerId: string,
    identityContext?: IdentityContext,
  ): Promise<SensitivePaymentDenial> {
    void customerId;
    const accessToken =
      await this.identity.getVerifiedAccessToken(identityContext);
    this.events.record({
      stage: "identity",
      status: "allowed",
      action: identityContext
        ? "verify_obo_jwt_validated"
        : "verify_jwt_validated",
      requestId,
    });
    try {
      await this.vault.attemptDeniedDatabaseCredentials(
        accessToken,
        "database/creds/bob-payment-pii",
      );
      throw new ExternalServiceError(
        "Vault",
        "sensitive role policy did not deny access",
      );
    } catch (error) {
      if (!(error instanceof AuthorizationError)) {
        throw error;
      }
      this.events.record({
        stage: "vault",
        status: "denied",
        action: "database/creds/bob-payment-pii",
        requestId,
      });
      return {
        status: "denied",
        authentication: "successful",
        authorization: "denied",
        reason:
          "The authenticated NHI is not authorized to access sensitive payment data.",
      };
    }
  }

  async #runAuthorized<T extends OrderStatus | FailedPaymentSummary>(
    requestId: string,
    action: string,
    identityContext: IdentityContext | undefined,
    databaseOperation: (credentials: DynamicDatabaseCredentials) => Promise<T>,
  ): Promise<T & { access: OrderStatusResult["access"] }> {
    const startedAt = performance.now();
    try {
      const accessToken =
        await this.identity.getVerifiedAccessToken(identityContext);
      this.events.record({
        stage: "identity",
        status: "allowed",
        action: identityContext
          ? "verify_obo_jwt_validated"
          : "verify_jwt_validated",
        requestId,
      });

      const result = await this.vault.withDatabaseCredentials<
        T & { access: OrderStatusResult["access"] }
      >(accessToken, async (credentials) => {
        this.events.record({
          stage: "vault",
          status: "allowed",
          action: "dynamic_credentials_issued",
          requestId,
        });
        const databaseResult = await databaseOperation(credentials);
        this.events.record({
          stage: "database",
          status: "ok",
          action,
          requestId,
          latencyMs: performance.now() - startedAt,
        });
        return {
          ...databaseResult,
          access: {
            nhi: this.nhiName,
            ...(identityContext
              ? { user_subject: identityContext.subject }
              : {}),
            verify: "authenticated",
            vault: "authorized",
            credential_type: "dynamic",
            credential_ttl_seconds: credentials.leaseDurationSeconds,
          },
        };
      });
      return result;
    } catch (error) {
      this.events.record({
        stage: "transport",
        status: error instanceof AuthorizationError ? "denied" : "error",
        action,
        requestId,
        latencyMs: performance.now() - startedAt,
      });
      throw error;
    }
  }
}
