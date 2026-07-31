import { describe, expect, it, vi } from "vitest";

import { BoundedChatAgent, type McpToolCaller } from "../src/agent.js";
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
    expect(reply.trace).toHaveLength(4);
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
    expect(reply.reply).toContain("세 가지 요청만");
    expect(mcp.callTool).not.toHaveBeenCalled();
  });
});
