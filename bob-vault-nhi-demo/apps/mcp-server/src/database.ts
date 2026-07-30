import { readFileSync } from "node:fs";

import { Client } from "pg";
import { z } from "zod";

import type { AppConfig } from "./config.js";
import { ExternalServiceError, NotFoundError } from "./errors.js";
import { failedPaymentSummaryQuery, orderStatusQuery } from "./queries.js";
import type {
  DynamicDatabaseCredentials,
  FailedPaymentSummary,
  OrderStatus,
} from "./types.js";

const orderRowSchema = z.object({
  order_id: z.string().min(1).max(64),
  payment_status: z.string().min(1).max(40),
  delivery_status: z.string().min(1).max(40),
  updated_at: z.union([z.date(), z.string().datetime()]),
});

const summaryRowSchema = z.object({
  delivery_status: z.string().min(1).max(40),
  count: z.number().int().nonnegative(),
});

export interface OrdersDatabase {
  getOrderStatus(
    credentials: DynamicDatabaseCredentials,
    orderId: string,
  ): Promise<OrderStatus>;
  getFailedPaymentSummary(
    credentials: DynamicDatabaseCredentials,
    date: string,
  ): Promise<FailedPaymentSummary>;
}

export class PostgresOrdersDatabase implements OrdersDatabase {
  readonly #config: AppConfig["database"];

  public constructor(config: AppConfig["database"]) {
    this.#config = config;
  }

  public async getOrderStatus(
    credentials: DynamicDatabaseCredentials,
    orderId: string,
  ): Promise<OrderStatus> {
    return this.#withClient(credentials, async (client) => {
      const result = await client.query(orderStatusQuery, [orderId]);
      const first = result.rows[0];
      if (!first) {
        throw new NotFoundError("Order was not found");
      }
      return mapOrder(first);
    });
  }

  public async getFailedPaymentSummary(
    credentials: DynamicDatabaseCredentials,
    date: string,
  ): Promise<FailedPaymentSummary> {
    return this.#withClient(credentials, async (client) => {
      const result = await client.query(failedPaymentSummaryQuery, [date]);
      const byDeliveryStatus = result.rows.map((row) => summaryRowSchema.parse(row));
      return {
        date,
        failed_count: byDeliveryStatus.reduce((total, row) => total + row.count, 0),
        by_delivery_status: byDeliveryStatus,
      };
    });
  }

  async #withClient<T>(
    credentials: DynamicDatabaseCredentials,
    operation: (client: Client) => Promise<T>,
  ): Promise<T> {
    if (!this.#config.host) {
      throw new ExternalServiceError("PostgreSQL", "database endpoint is not configured");
    }
    const certificateAuthority =
      this.#config.caPem ?? readFileSync(this.#config.caFile, { encoding: "utf8" });

    const client = new Client({
      host: this.#config.host,
      port: this.#config.port,
      database: this.#config.name,
      user: credentials.username,
      password: credentials.password,
      ssl: {
        ca: certificateAuthority,
        rejectUnauthorized: true,
      },
      application_name: "bob-vault-nhi-demo",
      connectionTimeoutMillis: this.#config.connectTimeoutMs,
      query_timeout: this.#config.queryTimeoutMs,
      statement_timeout: this.#config.queryTimeoutMs,
    });

    try {
      await client.connect();
      return await operation(client);
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      throw new ExternalServiceError("PostgreSQL", "database operation failed", { cause: error });
    } finally {
      await client.end().catch(() => undefined);
    }
  }
}

function mapOrder(input: unknown): OrderStatus {
  const row = orderRowSchema.parse(input);
  return {
    order_id: row.order_id,
    payment_status: row.payment_status,
    delivery_status: row.delivery_status,
    updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  };
}
