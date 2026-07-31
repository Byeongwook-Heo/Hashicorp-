import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { z } from "zod";

import { AppError, ExternalServiceError } from "./errors.js";
import type { UserPrincipal } from "./user-auth.js";

const orderResultSchema = z.object({
  order_id: z.string(),
  payment_status: z.string(),
  delivery_status: z.string(),
  updated_at: z.string(),
  access: z.object({
    nhi: z.string(),
    user_subject: z.string().optional(),
    verify: z.literal("authenticated"),
    vault: z.literal("authorized"),
    credential_type: z.literal("dynamic"),
    credential_ttl_seconds: z.number(),
  }),
});
const paymentSummarySchema = z.object({
  date: z.string(),
  failed_count: z.number(),
  by_delivery_status: z.array(
    z.object({ delivery_status: z.string(), count: z.number() }),
  ),
  access: orderResultSchema.shape.access,
});
const denialSchema = z.object({
  status: z.literal("denied"),
  authentication: z.literal("successful"),
  authorization: z.literal("denied"),
  reason: z.string(),
});

type AgentToolName =
  | "get_order_status"
  | "get_failed_payment_summary"
  | "get_sensitive_payment_data";

export interface AgentTraceStep {
  label: string;
  detail: string;
  status: "verified" | "allowed" | "issued" | "denied";
}

export interface AgentReply {
  reply: string;
  tool: AgentToolName | null;
  trace: AgentTraceStep[];
}

export interface McpToolCaller {
  callTool(
    tool: AgentToolName,
    argumentsValue: Record<string, string>,
    accessToken: string,
  ): Promise<Record<string, unknown>>;
}

export interface ChatAgent {
  respond(message: string, principal: UserPrincipal): Promise<AgentReply>;
}

export class HttpMcpToolCaller implements McpToolCaller {
  public constructor(
    private readonly endpoint: string,
    private readonly serviceVersion: string,
  ) {}

  public async callTool(
    tool: AgentToolName,
    argumentsValue: Record<string, string>,
    accessToken: string,
  ): Promise<Record<string, unknown>> {
    const client = new Client(
      {
        name: "agentic-security-chatbot",
        version: this.serviceVersion,
      },
      { capabilities: {} },
    );
    const transport = new StreamableHTTPClientTransport(
      new URL(this.endpoint),
      {
        requestInit: {
          headers: {
            authorization: `Bearer ${accessToken}`,
          },
        },
      },
    );
    try {
      await client.connect(
        transport as unknown as Parameters<Client["connect"]>[0],
      );
      const catalog = await client.listTools();
      if (!catalog.tools.some((candidate) => candidate.name === tool)) {
        throw new AppError(
          "The selected MCP tool is not published",
          502,
          "MCP_TOOL_UNAVAILABLE",
        );
      }
      const result = await client.callTool({
        name: tool,
        arguments: argumentsValue,
      });
      if (result.isError || !result.structuredContent) {
        throw new ExternalServiceError("MCP", extractMcpError(result.content));
      }
      return result.structuredContent as Record<string, unknown>;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new ExternalServiceError("MCP", "tool call failed", {
        cause: error,
      });
    } finally {
      await client.close().catch(() => undefined);
    }
  }
}

export class BoundedChatAgent implements ChatAgent {
  public constructor(private readonly mcp: McpToolCaller) {}

  public async respond(
    message: string,
    principal: UserPrincipal,
  ): Promise<AgentReply> {
    const normalized = message.trim();
    if (!normalized) {
      throw new AppError("Message is required", 400, "INVALID_CHAT_MESSAGE");
    }

    const sensitiveCustomer = /\bCUS-[0-9]{4,12}\b/i.exec(normalized);
    if (
      sensitiveCustomer &&
      /(민감|카드|원문|개인|payment data|sensitive)/i.test(normalized)
    ) {
      const customerId = sensitiveCustomer[0].toUpperCase();
      const result = denialSchema.parse(
        await this.mcp.callTool(
          "get_sensitive_payment_data",
          { customer_id: customerId },
          principal.accessToken,
        ),
      );
      return {
        reply:
          `요청은 차단되었습니다. 사용자 인증은 성공했지만 Agent의 Vault 정책에는 ` +
          `${customerId}의 민감 결제 정보 권한이 없습니다.`,
        tool: "get_sensitive_payment_data",
        trace: deniedTrace(principal, result.reason),
      };
    }

    const order = /\bORD-[0-9]{4,12}\b/i.exec(normalized);
    if (order) {
      const orderId = order[0].toUpperCase();
      const result = orderResultSchema.parse(
        await this.mcp.callTool(
          "get_order_status",
          { order_id: orderId },
          principal.accessToken,
        ),
      );
      return {
        reply: `주문 ${result.order_id}는 현재 ${translateDeliveryStatus(
          result.delivery_status,
        )} 상태이며, 결제 상태는 ${translatePaymentStatus(
          result.payment_status,
        )}입니다.`,
        tool: "get_order_status",
        trace: allowedTrace(principal, result.access.credential_ttl_seconds),
      };
    }

    if (
      /(실패|실패한|failed).*(결제|payment)|(결제|payment).*(실패|failed)/i.test(
        normalized,
      )
    ) {
      const date =
        /\b\d{4}-\d{2}-\d{2}\b/.exec(normalized)?.[0] ?? todayInSeoul();
      const result = paymentSummarySchema.parse(
        await this.mcp.callTool(
          "get_failed_payment_summary",
          { date },
          principal.accessToken,
        ),
      );
      return {
        reply:
          `${result.date} 실패 결제는 ${String(result.failed_count)}건입니다.` +
          formatDeliveryBreakdown(result.by_delivery_status),
        tool: "get_failed_payment_summary",
        trace: allowedTrace(principal, result.access.credential_ttl_seconds),
      };
    }

    return {
      reply:
        "이 데모 Agent는 안전하게 제한된 세 가지 요청만 처리합니다. " +
        "“주문 ORD-1001 상태”, “2026-07-30 실패 결제”, 또는 " +
        "“CUS-1001 민감 결제 정보” 중 하나를 요청해 보세요.",
      tool: null,
      trace: [
        {
          label: "IBM Verify 사용자",
          detail: safeIdentityLabel(principal),
          status: "verified",
        },
        {
          label: "Agent 정책",
          detail: "허용된 MCP 도구와 입력 형식만 선택",
          status: "allowed",
        },
      ],
    };
  }
}

function allowedTrace(
  principal: UserPrincipal,
  ttlSeconds: number,
): AgentTraceStep[] {
  return [
    {
      label: "사용자 JWT",
      detail: `${safeIdentityLabel(principal)} · Verify 검증 완료`,
      status: "verified",
    },
    {
      label: "OBO JWT",
      detail: "Agent 신원과 사용자 subject 결합",
      status: "verified",
    },
    {
      label: "Vault 정책",
      detail: "bob-orders 역할 허용",
      status: "allowed",
    },
    {
      label: "동적 DB 자격증명",
      detail: `TTL ${String(ttlSeconds)}초 · 사용 후 폐기`,
      status: "issued",
    },
  ];
}

function deniedTrace(
  principal: UserPrincipal,
  reason: string,
): AgentTraceStep[] {
  return [
    {
      label: "사용자 JWT",
      detail: `${safeIdentityLabel(principal)} · Verify 검증 완료`,
      status: "verified",
    },
    {
      label: "OBO JWT",
      detail: "Agent 신원과 사용자 subject 결합",
      status: "verified",
    },
    {
      label: "Vault 정책",
      detail: reason,
      status: "denied",
    },
  ];
}

function safeIdentityLabel(principal: UserPrincipal): string {
  return principal.displayName.slice(0, 80);
}

function todayInSeoul(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function formatDeliveryBreakdown(
  values: { delivery_status: string; count: number }[],
): string {
  if (values.length === 0) {
    return "";
  }
  return ` 배송 상태별로는 ${values
    .map(
      (entry) =>
        `${translateDeliveryStatus(entry.delivery_status)} ${String(entry.count)}건`,
    )
    .join(", ")}입니다.`;
}

function translateDeliveryStatus(value: string): string {
  const labels: Record<string, string> = {
    PREPARING: "배송 준비 중",
    SHIPPED: "배송 중",
    DELIVERED: "배송 완료",
    CANCELLED: "취소",
  };
  return labels[value] ?? value;
}

function translatePaymentStatus(value: string): string {
  const labels: Record<string, string> = {
    PAID: "결제 완료",
    FAILED: "결제 실패",
    PENDING: "결제 대기",
    REFUNDED: "환불 완료",
  };
  return labels[value] ?? value;
}

function extractMcpError(content: unknown): string {
  const parsedContent = z
    .array(
      z
        .object({
          type: z.string(),
          text: z.string().optional(),
        })
        .loose(),
    )
    .safeParse(content);
  if (!parsedContent.success) {
    return "tool returned an error";
  }
  const text = parsedContent.data.find(
    (item) => item.type === "text" && item.text,
  )?.text;
  if (!text) {
    return "tool returned an error";
  }
  try {
    const parsed = z
      .object({ message: z.string().min(1) })
      .loose()
      .parse(JSON.parse(text));
    return parsed.message;
  } catch {
    return "tool returned an error";
  }
}
