import pino from "pino";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { loadConfig } from "../src/config.js";
import type { OrdersDatabase } from "../src/database.js";
import { SecurityEventStore } from "../src/event-store.js";
import { createHttpApp } from "../src/http-app.js";
import type { IdentityProvider } from "../src/identity-client.js";
import { ToolService } from "../src/tool-service.js";
import type { VaultCredentialBroker } from "../src/vault-client.js";

const bearerToken = "transport-token-".padEnd(48, "x");

function buildApp() {
  const config = loadConfig({
    NODE_ENV: "test",
    APP_MODE: "bootstrap",
    LOG_LEVEL: "silent",
    TRANSPORT_BEARER_TOKEN: bearerToken,
    ALLOWED_ORIGINS: "https://bob.example.test",
  });
  const identity: IdentityProvider = {
    getVerifiedAccessToken: vi
      .fn()
      .mockResolvedValue("header.payload.signature"),
  };
  const vault: VaultCredentialBroker = {
    withDatabaseCredentials: vi.fn(async (_token, operation) =>
      operation({
        username: "dynamic",
        password: "discarded",
        leaseId: "lease-id",
        leaseDurationSeconds: 120,
      }),
    ),
    attemptDeniedDatabaseCredentials: vi.fn(),
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
  const tools = new ToolService(identity, vault, database, events);
  return {
    app: createHttpApp({
      config,
      events,
      tools,
      logger: pino({ level: "silent" }),
    }),
    events,
    vault,
  };
}

const toolsListRequest = {
  jsonrpc: "2.0",
  id: "test-1",
  method: "tools/list",
  params: {},
};

describe("HTTP security boundary", () => {
  it("returns health without exposing configuration", async () => {
    const { app } = buildApp();
    const response = await request(app).get("/healthz").expect(200);

    expect(response.body).toEqual({ status: "ok", version: "dev" });
    expect(response.headers["x-powered-by"]).toBeUndefined();
    expect(response.headers["content-security-policy"]).toContain(
      "default-src 'self'",
    );
  });

  it("rejects MCP requests without the bearer token", async () => {
    const { app, events } = buildApp();

    await request(app)
      .post("/mcp")
      .set("accept", "application/json, text/event-stream")
      .send(toolsListRequest)
      .expect(401);

    expect(events.list()[0]).toMatchObject({
      stage: "transport",
      status: "denied",
    });
  });

  it("rejects unapproved browser origins", async () => {
    const { app } = buildApp();

    await request(app)
      .post("/mcp")
      .set("authorization", `Bearer ${bearerToken}`)
      .set("origin", "https://attacker.example")
      .set("accept", "application/json, text/event-stream")
      .send(toolsListRequest)
      .expect(401);
  });

  it("lists only the three fixed tools for an authenticated client", async () => {
    const { app } = buildApp();
    const response = await request(app)
      .post("/mcp")
      .set("authorization", `Bearer ${bearerToken}`)
      .set("origin", "https://bob.example.test")
      .set("accept", "application/json, text/event-stream")
      .send(toolsListRequest)
      .expect(200);

    expect(
      response.body.result.tools
        .map((tool: { name: string }) => tool.name)
        .sort(),
    ).toEqual([
      "get_failed_payment_summary",
      "get_order_status",
      "get_sensitive_payment_data",
    ]);
  });

  it("does not allow GET sessions for the stateless transport", async () => {
    const { app } = buildApp();

    await request(app)
      .get("/mcp")
      .set("authorization", `Bearer ${bearerToken}`)
      .expect(405)
      .expect("allow", "POST");
  });
});
