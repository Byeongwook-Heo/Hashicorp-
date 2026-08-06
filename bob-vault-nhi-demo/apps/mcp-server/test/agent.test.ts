import { describe, expect, it, vi } from "vitest";

import {
  BoundedChatAgent,
  type McpToolCaller,
  ResilientPlanner,
  RuleBasedPlanner,
  type MessagePlanner,
} from "../src/agent.js";
import type { IdentityProvider } from "../src/identity-client.js";
import type { UserPrincipal } from "../src/user-auth.js";

const principal: UserPrincipal = {
  subject: "user-123",
  displayName: "Demo User",
  accessToken: "header.payload.signature.user",
};

function buildAgent(result: Record<string, unknown>) {
  const mcp: McpToolCaller = {
    callTool: vi.fn().mockResolvedValue(result),
  };
  return { agent: new BoundedChatAgent(mcp), mcp };
}

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

  it("falls back to deterministic routing when enhanced planning fails", async () => {
    const primary: MessagePlanner = {
      plan: vi.fn().mockRejectedValue(new Error("planning unavailable")),
    };
    const fallback = new RuleBasedPlanner();
    const onFallback = vi.fn();
    const mcp: McpToolCaller = {
      callTool: vi.fn().mockResolvedValue({
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
