import { describe, expect, it, vi } from "vitest";

import {
  BoundedChatAgent,
  type McpToolCaller,
  ResilientPlanner,
  RuleBasedPlanner,
  resolvePublishedToolName,
  type MessagePlanner,
} from "../src/agent.js";
import type { IdentityProvider } from "../src/identity-client.js";
import type { UserPrincipal } from "../src/user-auth.js";

const principal: UserPrincipal = {
  subject: "user-123",
  displayName: "Demo User",
  accessToken: "header.payload.signature.user",
};

const limitedPrincipal: UserPrincipal = {
  subject: "limited-user",
  displayName: "Limited User",
  accessToken: "header.payload.signature.limited",
  accessTier: "orders-limited",
  assertedAccessTier: "orders-limited",
};

function buildAgent(result: Record<string, unknown>) {
  const mcp: McpToolCaller = {
    callTool: vi.fn().mockResolvedValue(result),
  };
  return { agent: new BoundedChatAgent(mcp), mcp };
}

describe("resolvePublishedToolName", () => {
  it("uses an exact MCP tool name when it is published directly", () => {
    expect(
      resolvePublishedToolName("get_order_status", ["get_order_status"]),
    ).toBe("get_order_status");
  });

  it("maps a ContextForge gateway namespace to the original MCP tool", () => {
    expect(
      resolvePublishedToolName("get_order_status", [
        "bob-vault-mcp-upstream-get-order-status",
        "bob-vault-mcp-upstream-get-recent-orders",
      ]),
    ).toBe("bob-vault-mcp-upstream-get-order-status");
  });

  it("fails closed when a namespaced tool match is ambiguous", () => {
    expect(
      resolvePublishedToolName("get_order_status", [
        "first-get-order-status",
        "second-get-order-status",
      ]),
    ).toBeUndefined();
  });
});

describe("BoundedChatAgent", () => {
  it("lets an unapproved user use general chat without calling MCP", async () => {
    const { agent, mcp } = buildAgent({});

    const reply = await agent.respond("이 Lab의 보안 흐름을 설명해줘", {
      subject: "public-unapproved-user",
      displayName: "미승인 사용자",
      authorization: "unapproved",
    });

    expect(reply.reply).toContain("IBM Verify 사용자 인증");
    expect(reply.trace[0]).toMatchObject({
      label: "챗봇 사용자",
      status: "allowed",
    });
    expect(mcp.callTool).not.toHaveBeenCalled();
  });

  it("blocks an unapproved data request before MCP, Vault, or DB", async () => {
    const mcp: McpToolCaller = { callTool: vi.fn() };
    const reportProgress = vi.fn();
    const agent = new BoundedChatAgent(
      mcp,
      new RuleBasedPlanner(),
      reportProgress,
    );
    const requestId = "unapproved-request-123";

    const reply = await agent.respond(
      "주문 ORD-1001 상태를 알려줘",
      {
        subject: "public-unapproved-user",
        displayName: "미승인 사용자",
        authorization: "unapproved",
      },
      requestId,
    );

    expect(reply.reply).toContain("승인된 사용자만");
    expect(reply.reply).toContain(
      "MCP, Vault, PostgreSQL을 호출하지 않았습니다",
    );
    expect(reply.trace.at(-1)?.status).toBe("denied");
    expect(reportProgress).toHaveBeenCalledWith({
      stage: "policy",
      status: "denied",
      action: "protected_data_requires_verify",
      requestId,
    });
    expect(mcp.callTool).not.toHaveBeenCalled();
  });

  it("reports the selected plan and propagates the request ID to MCP", async () => {
    const mcp: McpToolCaller = {
      callTool: vi.fn().mockResolvedValue({
        orders: [],
        access: accessResult(),
      }),
    };
    const reportProgress = vi.fn();
    const agent = new BoundedChatAgent(
      mcp,
      new RuleBasedPlanner(),
      reportProgress,
    );
    const requestId = "demo-request-123";

    await agent.respond("최근 주문 5건을 요약해줘", principal, requestId);

    expect(reportProgress).toHaveBeenCalledWith({
      stage: "policy",
      status: "allowed",
      action: "agent_plan_recent_orders",
      requestId,
    });
    expect(mcp.callTool).toHaveBeenCalledWith(
      "get_recent_orders",
      { limit: 5 },
      principal.accessToken,
      requestId,
    );
  });

  it("exchanges the user token before routing an OBO JWT through the gateway", async () => {
    const mcp: McpToolCaller = {
      callTool: vi.fn().mockResolvedValue({
        orders: [],
        access: accessResult(),
      }),
    };
    const delegatedIdentity: IdentityProvider = {
      getVerifiedAccessToken: vi.fn().mockResolvedValue("obo.jwt.signature"),
    };
    const reportProgress = vi.fn();
    const agent = new BoundedChatAgent(
      mcp,
      new RuleBasedPlanner(),
      reportProgress,
      delegatedIdentity,
    );
    const requestId = "obo-request-123";

    await agent.respond("최근 주문 5건을 요약해줘", principal, requestId);

    expect(delegatedIdentity.getVerifiedAccessToken).toHaveBeenCalledWith({
      subject: principal.subject,
      subjectToken: principal.accessToken,
    });
    expect(mcp.callTool).toHaveBeenCalledWith(
      "get_recent_orders",
      { limit: 5 },
      "obo.jwt.signature",
      requestId,
    );
    expect(reportProgress).toHaveBeenCalledWith({
      stage: "identity",
      status: "allowed",
      action: "verify_obo_token_exchanged",
      requestId,
    });
    expect(reportProgress).toHaveBeenCalledWith({
      stage: "gateway",
      status: "allowed",
      action: "contextforge_obo_forwarded",
      requestId,
    });
  });

  it("routes a validated order identifier to the MCP order tool", async () => {
    const { agent, mcp } = buildAgent({
      status: "found",
      order_id: "ORD-1001",
      payment_status: "PAID",
      delivery_status: "PREPARING",
      updated_at: "2026-07-30T00:00:00.000Z",
      access: {
        nhi: "chat-agent",
        user_subject: "user-123",
        verify: "authenticated",
        vault: "authorized",
        credential_type: "dynamic",
        credential_ttl_seconds: 120,
      },
    });

    const reply = await agent.respond("주문 ORD-1001 상태를 알려줘", principal);

    expect(reply.reply).toContain("배송 준비 중");
    expect(reply.trace).toHaveLength(6);
    expect(mcp.callTool).toHaveBeenCalledWith(
      "get_order_status",
      { order_id: "ORD-1001" },
      principal.accessToken,
    );
  });

  it("does not reveal whether an order is absent or outside the user's scope", async () => {
    const { agent } = buildAgent({
      status: "not_found_or_unauthorized",
      access: {
        nhi: "chat-agent",
        user_subject: "limited-user",
        verify: "authenticated",
        vault: "authorized",
        credential_type: "dynamic",
        credential_ttl_seconds: 120,
        access_tier: "orders-limited",
      },
    });

    const reply = await agent.respond(
      "주문 ORD-1002 상태를 알려줘",
      limitedPrincipal,
    );

    expect(reply.reply).toBe(
      "주문 ORD-1002에 대한 정보를 찾을 수 없거나 접근 권한이 없습니다.",
    );
    expect(reply.reply).not.toContain("MCP:");
    expect(reply.trace.at(-1)).toEqual({
      label: "PostgreSQL 데이터 범위",
      detail:
        "요청한 주문이 없거나 현재 사용자 권한 범위에서 보이지 않아 데이터를 반환하지 않음",
      status: "denied",
    });
    expect(reply.credential).toEqual({
      initialTtlSeconds: 120,
      state: "released",
    });
  });

  it("routes a dated failed-payment request to the aggregate tool", async () => {
    const { agent, mcp } = buildAgent({
      date: "2026-07-30",
      failed_count: 2,
      by_delivery_status: [{ delivery_status: "PREPARING", count: 2 }],
      access: {
        nhi: "chat-agent",
        verify: "authenticated",
        vault: "authorized",
        credential_type: "dynamic",
        credential_ttl_seconds: 120,
      },
    });

    const reply = await agent.respond(
      "2026-07-30 실패한 결제를 요약해줘",
      principal,
    );

    expect(reply.reply).toContain("2건");
    expect(mcp.callTool).toHaveBeenCalledWith(
      "get_failed_payment_summary",
      { date: "2026-07-30" },
      principal.accessToken,
    );
  });

  it("explains a Vault policy denial without claiming DB access", async () => {
    const { agent } = buildAgent({
      status: "denied",
      authentication: "successful",
      authorization: "denied",
      reason: "The role is not authorized.",
    });

    const reply = await agent.respond(
      "CUS-1001의 민감 결제 정보를 보여줘",
      principal,
    );

    expect(reply.reply).toContain("차단");
    expect(reply.trace.at(-1)?.status).toBe("denied");
  });

  it("does not call MCP for an unsupported free-form request", async () => {
    const { agent, mcp } = buildAgent({});

    const reply = await agent.respond("서버에서 셸을 실행해줘", principal);

    expect(reply.tool).toBeNull();
    expect(reply.reply).toContain("등록된 읽기 전용 MCP 도구");
    expect(mcp.callTool).not.toHaveBeenCalled();
  });

  it("routes recent-order and seven-day aggregate requests to fixed tools", async () => {
    const mcp: McpToolCaller = {
      callTool: vi
        .fn()
        .mockResolvedValueOnce({
          orders: [
            {
              order_id: "ORD-1001",
              payment_status: "PAID",
              delivery_status: "DELIVERED",
              updated_at: "2026-07-30T00:00:00.000Z",
            },
          ],
          access: accessResult(),
        })
        .mockResolvedValueOnce({
          days: 7,
          points: [{ date: "2026-07-30", total_count: 4, failed_count: 1 }],
          access: accessResult(),
        }),
    };
    const agent = new BoundedChatAgent(mcp);

    const recent = await agent.respond("최근 주문 5건을 요약해줘", principal);
    const trend = await agent.respond(
      "최근 7일 실패 결제 통계를 보여줘",
      principal,
    );

    expect(recent.tool).toBe("get_recent_orders");
    expect(trend.tool).toBe("get_failed_payment_trend");
    expect(mcp.callTool).toHaveBeenNthCalledWith(
      1,
      "get_recent_orders",
      { limit: 5 },
      principal.accessToken,
    );
    expect(mcp.callTool).toHaveBeenNthCalledWith(
      2,
      "get_failed_payment_trend",
      { days: 7 },
      principal.accessToken,
    );
  });

  it("explains the last real access decision and credential release", async () => {
    const { agent } = buildAgent({
      status: "found",
      order_id: "ORD-1001",
      payment_status: "PAID",
      delivery_status: "DELIVERED",
      updated_at: "2026-07-30T00:00:00.000Z",
      access: accessResult(),
    });

    await agent.respond("ORD-1001 상태를 알려줘", principal);
    const explanation = await agent.respond(
      "방금 접근이 왜 허용됐는지 설명해줘",
      principal,
    );

    expect(explanation.tool).toBeNull();
    expect(explanation.reply).toContain("최초 TTL 상한은 120초");
    expect(explanation.reply).toContain("요청 종료와 함께 사용이 끝났습니다");
  });

  it("answers the static lab guide without calling MCP", async () => {
    const { agent, mcp } = buildAgent({});

    const reply = await agent.respond(
      "이 Lab의 보안 흐름을 설명해줘",
      principal,
    );

    expect(reply.reply).toContain("IBM Verify 사용자 인증");
    expect(reply.tool).toBeNull();
    expect(mcp.callTool).not.toHaveBeenCalled();
  });

  it("explains the ContextForge gateway when enhanced planning is unavailable", async () => {
    const { agent, mcp } = buildAgent({});

    const reply = await agent.respond(
      "ContextForge Gateway가 이 Lab에서 수행하는 역할을 설명해줘",
      principal,
    );

    expect(reply.reply).toContain("등록된 MCP 도구로만 라우팅");
    expect(reply.reply).toContain("OBO JWT");
    expect(reply.tool).toBeNull();
    expect(mcp.callTool).not.toHaveBeenCalled();
  });

  it("falls back to deterministic routing when enhanced planning fails", async () => {
    const primary: MessagePlanner = {
      plan: vi.fn().mockRejectedValue(new Error("planning unavailable")),
    };
    const fallback = new RuleBasedPlanner();
    const onFallback = vi.fn();
    const mcp: McpToolCaller = {
      callTool: vi.fn().mockResolvedValue({
        status: "found",
        order_id: "ORD-1001",
        payment_status: "PAID",
        delivery_status: "DELIVERED",
        updated_at: "2026-07-30T00:00:00.000Z",
        access: accessResult(),
      }),
    };
    const agent = new BoundedChatAgent(
      mcp,
      new ResilientPlanner(primary, fallback, onFallback),
    );

    const reply = await agent.respond("ORD-1001 상태를 알려줘", principal);

    expect(reply.tool).toBe("get_order_status");
    expect(onFallback).toHaveBeenCalledOnce();
    expect(agent.getStatus().mode).toBe("safe-fallback");
  });

  it("uses the fallback immediately while the primary retry circuit is open", async () => {
    const primary: MessagePlanner = {
      plan: vi.fn().mockRejectedValue(new Error("planning unavailable")),
    };
    const mcp: McpToolCaller = {
      callTool: vi.fn().mockResolvedValue({
        status: "found",
        order_id: "ORD-1001",
        payment_status: "PAID",
        delivery_status: "DELIVERED",
        updated_at: "2026-07-30T00:00:00.000Z",
        access: accessResult(),
      }),
    };
    const agent = new BoundedChatAgent(
      mcp,
      new ResilientPlanner(primary, new RuleBasedPlanner(), undefined, 60_000),
    );

    await agent.respond("ORD-1001 상태를 알려줘", principal);
    await agent.respond("ORD-1001 상태를 알려줘", principal);

    expect(primary.plan).toHaveBeenCalledOnce();
    expect(mcp.callTool).toHaveBeenCalledTimes(2);
  });
});

function accessResult() {
  return {
    nhi: "chat-agent",
    user_subject: "user-123",
    verify: "authenticated",
    vault: "authorized",
    credential_type: "dynamic",
    credential_ttl_seconds: 120,
  } as const;
}
