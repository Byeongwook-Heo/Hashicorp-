import pino from "pino";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import type { ChatAgent } from "../src/agent.js";
import { loadConfig } from "../src/config.js";
import type { OrdersDatabase } from "../src/database.js";
import { SecurityEventStore } from "../src/event-store.js";
import { createHttpApp } from "../src/http-app.js";
import type { IdentityProvider } from "../src/identity-client.js";
import { ToolService } from "../src/tool-service.js";
import type { UserAuthenticator, UserSession } from "../src/user-auth.js";
import type { VaultCredentialBroker } from "../src/vault-client.js";

const bearerToken = "transport-token-".padEnd(48, "x");

const authenticatedSession: UserSession = {
  subject: "user-123",
  displayName: "Demo User",
  email: "demo@example.test",
  accessToken: "header.payload.signature.user",
  csrfToken: "csrf-token-for-tests-123456789",
  expiresAt: 1_800_000_000,
};

function buildApp(options?: {
  session?: UserSession | null;
  mcpAuthMode?: "static_bearer" | "user_jwt";
}) {
  const config = loadConfig({
    NODE_ENV: "test",
    APP_MODE: "bootstrap",
    LOG_LEVEL: "silent",
    TRANSPORT_BEARER_TOKEN: bearerToken,
    ALLOWED_ORIGINS: "https://bob.example.test",
    MCP_AUTH_MODE: options?.mcpAuthMode ?? "static_bearer",
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
  const userAuth: UserAuthenticator = {
    beginLogin: vi.fn().mockResolvedValue({
      redirectUrl: "https://verify.example.test/authorize",
      setCookie: "__Host-verify-login=transaction",
    }),
    completeLogin: vi.fn().mockResolvedValue({
      redirectUrl: "/",
      setCookies: ["__Host-chat-session=session"],
    }),
    readSession: vi.fn().mockResolvedValue(options?.session ?? null),
    verifyAccessToken: vi.fn().mockResolvedValue({
      subject: authenticatedSession.subject,
      displayName: authenticatedSession.displayName,
      accessToken: authenticatedSession.accessToken,
    }),
    clearSessionCookies: vi
      .fn()
      .mockReturnValue(["__Host-chat-session=; Max-Age=0"]),
  };
  const agent: ChatAgent = {
    respond: vi.fn().mockResolvedValue({
      reply: "주문 ORD-1001는 배송 준비 중입니다.",
      tool: "get_order_status",
      trace: [
        {
          label: "사용자 JWT",
          detail: "검증 완료",
          status: "verified",
        },
      ],
    }),
  };
  return {
    app: createHttpApp({
      config,
      events,
      tools,
      userAuth,
      agent,
      logger: pino({ level: "silent" }),
    }),
    events,
    vault,
    userAuth,
    agent,
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

  it("redirects a browser to the configured IBM Verify login", async () => {
    const { app } = buildApp();

    const response = await request(app).get("/auth/login").expect(302);

    expect(response.headers["location"]).toBe(
      "https://verify.example.test/authorize",
    );
    expect(response.headers["set-cookie"]?.[0]).toContain(
      "__Host-verify-login",
    );
  });

  it("returns only sanitized session information to the browser", async () => {
    const { app } = buildApp({ session: authenticatedSession });

    const response = await request(app).get("/api/me").expect(200);

    expect(response.body).toMatchObject({
      user: {
        displayName: "Demo User",
        email: "demo@example.test",
      },
      csrfToken: authenticatedSession.csrfToken,
    });
    expect(JSON.stringify(response.body)).not.toContain(
      authenticatedSession.accessToken,
    );
  });

  it("requires an authenticated session for the chatbot", async () => {
    const { app } = buildApp();

    await request(app)
      .post("/api/chat")
      .set("x-csrf-token", authenticatedSession.csrfToken)
      .send({ message: "주문 ORD-1001 상태" })
      .expect(401);
  });

  it("requires the session CSRF value for the chatbot", async () => {
    const { app } = buildApp({ session: authenticatedSession });

    await request(app)
      .post("/api/chat")
      .set("x-csrf-token", "incorrect-csrf")
      .send({ message: "주문 ORD-1001 상태" })
      .expect(401);
  });

  it("passes an authenticated request to the bounded agent", async () => {
    const { app, agent } = buildApp({ session: authenticatedSession });

    const response = await request(app)
      .post("/api/chat")
      .set("x-csrf-token", authenticatedSession.csrfToken)
      .send({ message: "주문 ORD-1001 상태" })
      .expect(200);

    expect(response.body).toMatchObject({
      tool: "get_order_status",
      reply: expect.stringContaining("ORD-1001"),
    });
    expect(agent.respond).toHaveBeenCalledWith(
      "주문 ORD-1001 상태",
      authenticatedSession,
    );
  });

  it("accepts a verified user JWT as MCP transport identity", async () => {
    const { app, userAuth } = buildApp({ mcpAuthMode: "user_jwt" });

    await request(app)
      .post("/mcp")
      .set("authorization", `Bearer ${authenticatedSession.accessToken}`)
      .set("accept", "application/json, text/event-stream")
      .send(toolsListRequest)
      .expect(200);

    expect(userAuth.verifyAccessToken).toHaveBeenCalledWith(
      authenticatedSession.accessToken,
    );
  });
});
