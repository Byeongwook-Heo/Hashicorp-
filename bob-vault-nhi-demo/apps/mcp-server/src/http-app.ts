import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { fileURLToPath } from "node:url";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express, {
  type ErrorRequestHandler,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { rateLimit } from "express-rate-limit";
import helmet from "helmet";
import type { Logger } from "pino";
import { z } from "zod";

import type { AppConfig } from "./config.js";
import { AppError, AuthenticationError } from "./errors.js";
import type { SecurityEventStore } from "./event-store.js";
import type { KmsClientAssertionSigner } from "./kms-signer.js";
import type { ToolService } from "./tool-service.js";

interface AppDependencies {
  config: AppConfig;
  logger: Logger;
  events: SecurityEventStore;
  tools: ToolService;
  signer?: KmsClientAssertionSigner;
}

const requestIdPattern = /^[A-Za-z0-9_.:-]{8,64}$/;
const orderIdSchema = z
  .string()
  .max(16)
  .regex(/^ORD-[0-9]{4,12}$/);
const customerIdSchema = z
  .string()
  .max(16)
  .regex(/^CUS-[0-9]{4,12}$/);
const summaryDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (value) => !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)),
    "Invalid date",
  );
const publicDirectory = fileURLToPath(new URL("../public", import.meta.url));

export function createHttpApp(dependencies: AppDependencies): express.Express {
  const { config, events, logger } = dependencies;
  const app = express();
  app.disable("x-powered-by");
  if (config.trustProxy) {
    app.set("trust proxy", 1);
  }

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
          imgSrc: ["'self'", "data:"],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          baseUri: ["'none'"],
          frameAncestors: ["'none'"],
          formAction: ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: false,
      referrerPolicy: { policy: "no-referrer" },
    }),
  );
  app.use((request, response, next) => {
    const supplied = request.header("x-request-id");
    response.locals.requestId =
      supplied && requestIdPattern.test(supplied) ? supplied : randomUUID();
    response.setHeader("x-request-id", response.locals.requestId as string);
    next();
  });

  app.get("/healthz", (_request, response) => {
    response.json({ status: "ok", version: config.serviceVersion });
  });
  app.get("/readyz", (_request, response) => {
    response.json({ status: "ready", mode: config.appMode });
  });

  app.use(
    "/api",
    rateLimit({
      windowMs: 60_000,
      limit: 120,
      standardHeaders: "draft-8",
      legacyHeaders: false,
    }),
  );
  app.get("/api/status", (_request, response) => {
    response.json({
      mode: config.appMode,
      configured: config.appMode === "aws",
      version: config.serviceVersion,
      protocol: "2025-11-25",
      controls: {
        transport: "bearer + source CIDR",
        workloadIdentity: "AWS KMS private_key_jwt",
        authorization: "IBM Verify JWT → Vault JWT role",
        credentials: "dynamic PostgreSQL, short TTL",
      },
    });
  });
  const listEvents = (
    request: Request,
    response: Response,
    next: NextFunction,
  ) => {
    try {
      const limit = z.coerce
        .number()
        .int()
        .min(1)
        .max(100)
        .default(30)
        .parse(request.query["limit"]);
      response.json({ events: events.list(limit) });
    } catch (error) {
      next(error);
    }
  };
  app.get("/api/events", listEvents);
  app.get("/api/demo/events", listEvents);
  app.get("/.well-known/jwks.json", async (_request, response, next) => {
    if (!dependencies.signer) {
      response.status(503).json({ error: "KMS signing key is not configured" });
      return;
    }
    try {
      response.setHeader("cache-control", "public, max-age=300");
      response.json({ keys: [await dependencies.signer.publicJwk()] });
    } catch (error) {
      next(error);
    }
  });

  app.get("/demo", (_request, response) => {
    response.sendFile(`${publicDirectory}/index.html`);
  });
  app.use(
    express.static(publicDirectory, { index: "index.html", maxAge: "5m" }),
  );

  const mcpRateLimiter = rateLimit({
    windowMs: 60_000,
    limit: 60,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  });
  app.use(
    "/mcp",
    mcpRateLimiter,
    enforceAllowedOrigin(config),
    authenticateTransport(config, events),
  );
  app.post(
    "/api/demo/reset",
    authenticateTransport(config, events),
    (_request, response) => {
      events.clear();
      response.status(204).end();
    },
  );
  app.post(
    "/mcp",
    requireJsonContentType,
    express.json({ limit: "64kb", strict: true }),
    enforceFixedToolContract,
    async (request, response, next) => {
      const requestId = response.locals.requestId as string;
      const server = createMcpServer(dependencies, requestId);
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });
      response.on("close", () => {
        void transport.close();
        void server.close();
      });

      try {
        await server.connect(transport);
        await transport.handleRequest(request, response, request.body);
      } catch (error) {
        next(error);
      }
    },
  );
  app.get("/mcp", methodNotAllowed);
  app.delete("/mcp", methodNotAllowed);
  app.all("/mcp", methodNotAllowed);

  app.use((_request, response) => {
    response
      .status(404)
      .json({ error: { code: "NOT_FOUND", message: "Route not found" } });
  });

  const errorHandler: ErrorRequestHandler = (
    error,
    request,
    response,
    next,
  ) => {
    void next;
    const requestId = response.locals.requestId as string | undefined;
    const appError = error instanceof AppError ? error : undefined;
    logger.error(
      {
        err: error,
        requestId,
        method: request.method,
        path: request.path,
      },
      "request failed",
    );
    if (response.headersSent) {
      return;
    }
    response.status(appError?.statusCode ?? 500).json({
      error: {
        code: appError?.code ?? "INTERNAL_ERROR",
        message: appError?.message ?? "Unexpected server error",
        requestId,
      },
    });
  };
  app.use(errorHandler);

  return app;
}

function createMcpServer(
  dependencies: AppDependencies,
  requestId: string,
): McpServer {
  const server = new McpServer(
    {
      name: "bob-vault-nhi-demo",
      version: dependencies.config.serviceVersion,
    },
    { capabilities: { logging: {} } },
  );

  server.registerTool(
    "get_order_status",
    {
      title: "Get order status",
      description:
        "Return the current status for one order using short-lived Vault credentials.",
      inputSchema: {
        order_id: orderIdSchema.describe(
          "Order identifier, for example ORD-1001",
        ),
      },
      outputSchema: {
        order_id: z.string(),
        payment_status: z.string(),
        delivery_status: z.string(),
        updated_at: z.string(),
        access: z.object({
          nhi: z.string(),
          verify: z.literal("authenticated"),
          vault: z.literal("authorized"),
          credential_type: z.literal("dynamic"),
          credential_ttl_seconds: z.number(),
        }),
      },
    },
    async ({ order_id }) =>
      toolResult(() => dependencies.tools.getOrderStatus(requestId, order_id)),
  );

  server.registerTool(
    "get_failed_payment_summary",
    {
      title: "Summarize failed payments",
      description:
        "Return a bounded, non-personal aggregate of failed payments for one date.",
      inputSchema: {
        date: summaryDateSchema.describe("Calendar date in YYYY-MM-DD format"),
      },
      outputSchema: {
        date: z.string(),
        failed_count: z.number(),
        by_delivery_status: z.array(
          z.object({
            delivery_status: z.string(),
            count: z.number(),
          }),
        ),
        access: z.object({
          nhi: z.string(),
          verify: z.literal("authenticated"),
          vault: z.literal("authorized"),
          credential_type: z.literal("dynamic"),
          credential_ttl_seconds: z.number(),
        }),
      },
    },
    async ({ date }) =>
      toolResult(() =>
        dependencies.tools.getFailedPaymentSummary(requestId, date),
      ),
  );

  server.registerTool(
    "get_sensitive_payment_data",
    {
      title: "Request sensitive payment data",
      description:
        "Demonstration-only path: authenticates the NHI, then shows Vault policy denial without querying the database.",
      inputSchema: {
        customer_id: customerIdSchema.describe("Synthetic customer identifier"),
      },
      outputSchema: {
        status: z.literal("denied"),
        authentication: z.literal("successful"),
        authorization: z.literal("denied"),
        reason: z.string(),
      },
    },
    async ({ customer_id }) =>
      toolResult(() =>
        dependencies.tools.getSensitivePaymentData(requestId, customer_id),
      ),
  );

  return server;
}

async function toolResult<T extends object>(operation: () => Promise<T>) {
  try {
    const result = await operation();
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result) }],
      structuredContent: result as Record<string, unknown>,
    };
  } catch (error) {
    const appError = error instanceof AppError ? error : undefined;
    return {
      isError: true,
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            error: appError?.code ?? "TOOL_EXECUTION_FAILED",
            message: appError?.message ?? "The tool could not complete safely",
          }),
        },
      ],
    };
  }
}

function authenticateTransport(
  config: AppConfig,
  events: SecurityEventStore,
): (request: Request, response: Response, next: NextFunction) => void {
  const expectedDigest = createHash("sha256")
    .update(config.transportBearerToken)
    .digest();
  return (request, response, next) => {
    const header = request.header("authorization") ?? "";
    const suppliedToken = header.startsWith("Bearer ") ? header.slice(7) : "";
    const suppliedDigest = createHash("sha256").update(suppliedToken).digest();
    if (!timingSafeEqual(expectedDigest, suppliedDigest)) {
      events.record({
        stage: "transport",
        status: "denied",
        action: "invalid_bearer_token",
        requestId: response.locals.requestId as string,
      });
      next(new AuthenticationError());
      return;
    }
    events.record({
      stage: "transport",
      status: "allowed",
      action: "mcp_request_authenticated",
      requestId: response.locals.requestId as string,
    });
    next();
  };
}

function enforceAllowedOrigin(
  config: AppConfig,
): (request: Request, response: Response, next: NextFunction) => void {
  return (request, _response, next) => {
    const origin = request.header("origin");
    if (origin && !config.allowedOrigins.has(origin)) {
      next(new AuthenticationError("Browser origin is not allowed"));
      return;
    }
    next();
  };
}

function requireJsonContentType(
  request: Request,
  _response: Response,
  next: NextFunction,
): void {
  if (!request.is("application/json")) {
    next(
      new AppError(
        "Content-Type must be application/json",
        415,
        "UNSUPPORTED_MEDIA_TYPE",
      ),
    );
    return;
  }
  next();
}

function enforceFixedToolContract(
  request: Request,
  _response: Response,
  next: NextFunction,
): void {
  const body = request.body as
    | {
        method?: unknown;
        params?: { name?: unknown; arguments?: unknown };
      }
    | undefined;
  if (body?.method !== "tools/call") {
    next();
    return;
  }

  const toolName = body.params?.name;
  const argumentsValue = body.params?.arguments;
  const allowedFields: Record<string, ReadonlySet<string>> = {
    get_order_status: new Set(["order_id"]),
    get_failed_payment_summary: new Set(["date"]),
    get_sensitive_payment_data: new Set(["customer_id"]),
  };
  if (typeof toolName !== "string") {
    next(new AppError("Tool is not allowed", 400, "TOOL_NOT_ALLOWED"));
    return;
  }
  const toolFields = allowedFields[toolName];
  if (!toolFields) {
    next(new AppError("Tool is not allowed", 400, "TOOL_NOT_ALLOWED"));
    return;
  }
  if (
    !argumentsValue ||
    typeof argumentsValue !== "object" ||
    Array.isArray(argumentsValue)
  ) {
    next(
      new AppError(
        "Tool arguments must be an object",
        400,
        "INVALID_TOOL_INPUT",
      ),
    );
    return;
  }
  const unknownField = Object.keys(argumentsValue).find(
    (field) => !toolFields.has(field),
  );
  if (unknownField) {
    next(new AppError("Unknown tool input field", 400, "INVALID_TOOL_INPUT"));
    return;
  }
  next();
}

function methodNotAllowed(_request: Request, response: Response): void {
  response
    .status(405)
    .setHeader("allow", "POST")
    .json({
      jsonrpc: "2.0",
      error: {
        code: -32_000,
        message: "Method not allowed; stateless MCP accepts POST only",
      },
      id: null,
    });
}
