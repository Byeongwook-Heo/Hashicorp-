import { describe, expect, it, vi } from "vitest";

import type { OrdersDatabase } from "../src/database.js";
import { AuthorizationError } from "../src/errors.js";
import { SecurityEventStore } from "../src/event-store.js";
import type { IdentityProvider } from "../src/identity-client.js";
import { ToolService } from "../src/tool-service.js";
import type { VaultCredentialBroker } from "../src/vault-client.js";

function buildService() {
  const identity: IdentityProvider = {
    getVerifiedAccessToken: vi
      .fn()
      .mockResolvedValue("header.payload.signature"),
  };
  const vault: VaultCredentialBroker = {
    withDatabaseCredentials: vi.fn(async (_jwt, operation) =>
      operation({
        username: "dynamic-user",
        password: "dynamic-password",
        leaseId: "database/creds/example",
        leaseDurationSeconds: 120,
      }),
    ),
    attemptDeniedDatabaseCredentials: vi
      .fn()
      .mockRejectedValue(new AuthorizationError("Vault policy denied access")),
    close: vi.fn(),
  };
  const database: OrdersDatabase = {
    getOrderStatus: vi.fn().mockResolvedValue({
      order_id: "ORD-1001",
      payment_status: "PAID",
      delivery_status: "PREPARING",
      updated_at: "2026-07-30T00:00:00.000Z",
    }),
    getFailedPaymentSummary: vi.fn().mockResolvedValue({
      date: "2026-07-30",
      failed_count: 0,
      by_delivery_status: [],
    }),
  };
  const events = new SecurityEventStore();
  return {
    identity,
    vault,
    database,
    events,
    service: new ToolService(identity, vault, database, events),
  };
}

describe("ToolService", () => {
  it("uses the verified JWT only inside the Vault broker", async () => {
    const fixture = buildService();

    const result = await fixture.service.getOrderStatus(
      "request-123",
      "ORD-1001",
    );

    expect(result.payment_status).toBe("PAID");
    expect(result.access.credential_ttl_seconds).toBe(120);
    expect(fixture.identity.getVerifiedAccessToken).toHaveBeenCalledOnce();
    expect(fixture.vault.withDatabaseCredentials).toHaveBeenCalledOnce();
    expect(fixture.database.getOrderStatus).toHaveBeenCalledWith(
      expect.objectContaining({ username: "dynamic-user" }),
      "ORD-1001",
    );
    expect(fixture.events.list().map((event) => event.stage)).toEqual([
      "database",
      "vault",
      "identity",
    ]);
  });

  it("authenticates the NHI, then returns the expected Vault policy denial", async () => {
    const fixture = buildService();

    const result = await fixture.service.getSensitivePaymentData(
      "request-123",
      "CUS-1001",
    );

    expect(result).toMatchObject({
      authentication: "successful",
      authorization: "denied",
    });
    expect(fixture.identity.getVerifiedAccessToken).toHaveBeenCalledOnce();
    expect(fixture.vault.attemptDeniedDatabaseCredentials).toHaveBeenCalledWith(
      "header.payload.signature",
      "database/creds/bob-payment-pii",
    );
    expect(fixture.database.getOrderStatus).not.toHaveBeenCalled();
    expect(fixture.events.list()[0]).toMatchObject({
      stage: "vault",
      status: "denied",
    });
  });
});
