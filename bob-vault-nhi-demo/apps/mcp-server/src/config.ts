import { z } from "zod";

import { ConfigurationError } from "./errors.js";

const optionalUrl = z.url().optional();
const optionalNonEmpty = z.string().min(1).optional();

const environmentSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("production"),
    PORT: z.coerce.number().int().min(1024).max(65535).default(8080),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
    APP_MODE: z.enum(["bootstrap", "aws"]).default("bootstrap"),
    CHATBOT_ENABLED: z.enum(["true", "false"]).default("false"),
    IDENTITY_FLOW: z
      .enum(["client_credentials", "obo"])
      .default("client_credentials"),
    MCP_AUTH_MODE: z
      .enum(["static_bearer", "user_jwt"])
      .default("static_bearer"),
    SERVICE_VERSION: z.string().min(1).max(80).default("dev"),
    AWS_REGION: z.string().min(1).default("ap-northeast-2"),
    TRANSPORT_BEARER_TOKEN: z.string().min(32),
    SESSION_SECRET: z.string().min(32).optional(),
    ALLOWED_ORIGINS: z.string().default(""),
    TRUST_PROXY: z.enum(["true", "false"]).default("true"),
    PUBLIC_BASE_URL: optionalUrl,
    MCP_INTERNAL_URL: optionalUrl,
    VERIFY_TOKEN_URL: optionalUrl,
    VERIFY_JWKS_URL: optionalUrl,
    VERIFY_ISSUER: optionalUrl,
    VERIFY_AUDIENCE: optionalNonEmpty,
    VERIFY_CLIENT_ID: optionalNonEmpty,
    VERIFY_KMS_KEY_ID: optionalNonEmpty,
    VERIFY_SCOPE: optionalNonEmpty,
    VERIFY_NHI_CLAIM: z.string().min(1).default("sub"),
    VERIFY_NHI_VALUE: optionalNonEmpty,
    VERIFY_USER_AUTHORIZATION_URL: optionalUrl,
    VERIFY_USER_TOKEN_URL: optionalUrl,
    VERIFY_USER_JWKS_URL: optionalUrl,
    VERIFY_USER_ISSUER: optionalUrl,
    VERIFY_USER_AUDIENCE: optionalNonEmpty,
    VERIFY_USER_CLIENT_ID: optionalNonEmpty,
    VERIFY_USER_CLIENT_SECRET: optionalNonEmpty,
    VERIFY_USER_SCOPES: z.string().min(1).default("openid profile"),
    VERIFY_OBO_TOKEN_URL: optionalUrl,
    VERIFY_OBO_JWKS_URL: optionalUrl,
    VERIFY_OBO_ISSUER: optionalUrl,
    VERIFY_OBO_AUDIENCE: optionalNonEmpty,
    VERIFY_OBO_CLIENT_ID: optionalNonEmpty,
    VERIFY_OBO_SCOPE: optionalNonEmpty,
    VERIFY_OBO_ACTOR_CLAIM: z.string().min(1).default("client_id"),
    VERIFY_OBO_ACTOR_VALUE: optionalNonEmpty,
    VAULT_ADDR: optionalUrl,
    VAULT_NAMESPACE: optionalNonEmpty,
    VAULT_JWT_AUTH_PATH: z
      .string()
      .regex(/^[A-Za-z0-9_-]+$/)
      .default("jwt"),
    VAULT_JWT_ROLE: optionalNonEmpty,
    VAULT_DB_CREDS_PATH: z
      .string()
      .regex(/^database\/creds\/[A-Za-z0-9_-]+$/)
      .default("database/creds/bob-orders-readonly"),
    VAULT_CA_PEM: optionalNonEmpty,
    VAULT_REQUEST_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(1000)
      .max(30_000)
      .default(8_000),
    DB_HOST: optionalNonEmpty,
    DB_PORT: z.coerce.number().int().min(1).max(65535).default(5432),
    DB_NAME: z.string().min(1).default("shop_demo"),
    DB_CA_PEM: optionalNonEmpty,
    DB_CA_FILE: z.string().min(1).default("/app/certs/rds-ca.pem"),
    DB_CONNECT_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(500)
      .max(30_000)
      .default(5_000),
    DB_QUERY_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(500)
      .max(30_000)
      .default(5_000),
  })
  .superRefine((value, context) => {
    const required: (keyof typeof value)[] = [];
    if (value.APP_MODE === "aws") {
      required.push(
        "VERIFY_KMS_KEY_ID",
        "VAULT_ADDR",
        "VAULT_JWT_ROLE",
        "VAULT_CA_PEM",
        "DB_HOST",
      );
      if (value.IDENTITY_FLOW === "obo") {
        required.push(
          "VERIFY_OBO_TOKEN_URL",
          "VERIFY_OBO_JWKS_URL",
          "VERIFY_OBO_ISSUER",
          "VERIFY_OBO_AUDIENCE",
          "VERIFY_OBO_CLIENT_ID",
          "VERIFY_OBO_ACTOR_VALUE",
        );
      } else {
        required.push(
          "VERIFY_TOKEN_URL",
          "VERIFY_JWKS_URL",
          "VERIFY_ISSUER",
          "VERIFY_AUDIENCE",
          "VERIFY_CLIENT_ID",
          "VERIFY_NHI_VALUE",
        );
      }
    }
    if (value.CHATBOT_ENABLED === "true") {
      required.push(
        "SESSION_SECRET",
        "PUBLIC_BASE_URL",
        "VERIFY_USER_AUTHORIZATION_URL",
        "VERIFY_USER_TOKEN_URL",
        "VERIFY_USER_JWKS_URL",
        "VERIFY_USER_ISSUER",
        "VERIFY_USER_CLIENT_ID",
      );
      if (value.IDENTITY_FLOW !== "obo") {
        context.addIssue({
          code: "custom",
          path: ["IDENTITY_FLOW"],
          message: "IDENTITY_FLOW must be obo when CHATBOT_ENABLED=true",
        });
      }
      if (value.MCP_AUTH_MODE !== "user_jwt") {
        context.addIssue({
          code: "custom",
          path: ["MCP_AUTH_MODE"],
          message: "MCP_AUTH_MODE must be user_jwt when CHATBOT_ENABLED=true",
        });
      }
    }

    for (const field of required) {
      if (!value[field]) {
        context.addIssue({
          code: "custom",
          path: [field],
          message: `${field} is required when APP_MODE=aws`,
        });
      }
    }
    if (value.APP_MODE === "aws" && !value.DB_CA_PEM && !value.DB_CA_FILE) {
      context.addIssue({
        code: "custom",
        path: ["DB_CA_FILE"],
        message: "DB_CA_PEM or DB_CA_FILE is required when APP_MODE=aws",
      });
    }
  });

export interface AppConfig {
  nodeEnv: "development" | "test" | "production";
  port: number;
  logLevel: "fatal" | "error" | "warn" | "info" | "debug" | "trace" | "silent";
  appMode: "bootstrap" | "aws";
  chatbotEnabled: boolean;
  identityFlow: "client_credentials" | "obo";
  mcpAuthMode: "static_bearer" | "user_jwt";
  serviceVersion: string;
  awsRegion: string;
  transportBearerToken: string;
  sessionSecret?: string;
  allowedOrigins: Set<string>;
  trustProxy: boolean;
  publicBaseUrl?: string;
  mcpInternalUrl: string;
  verify: {
    tokenUrl?: string;
    jwksUrl?: string;
    issuer?: string;
    audience?: string;
    clientId?: string;
    kmsKeyId?: string;
    scope?: string;
    nhiClaim: string;
    nhiValue?: string;
    user: {
      authorizationUrl?: string;
      tokenUrl?: string;
      jwksUrl?: string;
      issuer?: string;
      audience?: string;
      clientId?: string;
      clientSecret?: string;
      scopes: string;
    };
    obo: {
      tokenUrl?: string;
      jwksUrl?: string;
      issuer?: string;
      audience?: string;
      clientId?: string;
      scope?: string;
      actorClaim: string;
      actorValue?: string;
    };
  };
  vault: {
    address?: string;
    namespace?: string;
    jwtAuthPath: string;
    jwtRole?: string;
    databaseCredentialsPath: string;
    caPem?: string;
    requestTimeoutMs: number;
  };
  database: {
    host?: string;
    port: number;
    name: string;
    caPem?: string;
    caFile: string;
    connectTimeoutMs: number;
    queryTimeoutMs: number;
  };
}

export function loadConfig(
  environment: NodeJS.ProcessEnv = process.env,
): AppConfig {
  const parsed = environmentSchema.safeParse(environment);
  if (!parsed.success) {
    const reasons = parsed.error.issues
      .map(
        (issue) => `${issue.path.join(".") || "environment"}: ${issue.message}`,
      )
      .join("; ");
    throw new ConfigurationError(
      `Invalid environment configuration: ${reasons}`,
    );
  }

  const value = parsed.data;
  return {
    nodeEnv: value.NODE_ENV,
    port: value.PORT,
    logLevel: value.LOG_LEVEL,
    appMode: value.APP_MODE,
    chatbotEnabled: value.CHATBOT_ENABLED === "true",
    identityFlow: value.IDENTITY_FLOW,
    mcpAuthMode: value.MCP_AUTH_MODE,
    serviceVersion: value.SERVICE_VERSION,
    awsRegion: value.AWS_REGION,
    transportBearerToken: value.TRANSPORT_BEARER_TOKEN,
    ...(value.SESSION_SECRET ? { sessionSecret: value.SESSION_SECRET } : {}),
    allowedOrigins: new Set(
      value.ALLOWED_ORIGINS.split(",")
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),
    trustProxy: value.TRUST_PROXY === "true",
    ...(value.PUBLIC_BASE_URL
      ? { publicBaseUrl: value.PUBLIC_BASE_URL.replace(/\/$/, "") }
      : {}),
    mcpInternalUrl:
      value.MCP_INTERNAL_URL ?? `http://127.0.0.1:${String(value.PORT)}/mcp`,
    verify: {
      ...(value.VERIFY_TOKEN_URL ? { tokenUrl: value.VERIFY_TOKEN_URL } : {}),
      ...(value.VERIFY_JWKS_URL ? { jwksUrl: value.VERIFY_JWKS_URL } : {}),
      ...(value.VERIFY_ISSUER ? { issuer: value.VERIFY_ISSUER } : {}),
      ...(value.VERIFY_AUDIENCE ? { audience: value.VERIFY_AUDIENCE } : {}),
      ...(value.VERIFY_CLIENT_ID ? { clientId: value.VERIFY_CLIENT_ID } : {}),
      ...(value.VERIFY_KMS_KEY_ID ? { kmsKeyId: value.VERIFY_KMS_KEY_ID } : {}),
      ...(value.VERIFY_SCOPE ? { scope: value.VERIFY_SCOPE } : {}),
      nhiClaim: value.VERIFY_NHI_CLAIM,
      ...(value.VERIFY_NHI_VALUE ? { nhiValue: value.VERIFY_NHI_VALUE } : {}),
      user: {
        ...(value.VERIFY_USER_AUTHORIZATION_URL
          ? { authorizationUrl: value.VERIFY_USER_AUTHORIZATION_URL }
          : {}),
        ...(value.VERIFY_USER_TOKEN_URL
          ? { tokenUrl: value.VERIFY_USER_TOKEN_URL }
          : {}),
        ...(value.VERIFY_USER_JWKS_URL
          ? { jwksUrl: value.VERIFY_USER_JWKS_URL }
          : {}),
        ...(value.VERIFY_USER_ISSUER
          ? { issuer: value.VERIFY_USER_ISSUER }
          : {}),
        ...(value.VERIFY_USER_AUDIENCE
          ? { audience: value.VERIFY_USER_AUDIENCE }
          : {}),
        ...(value.VERIFY_USER_CLIENT_ID
          ? { clientId: value.VERIFY_USER_CLIENT_ID }
          : {}),
        ...(value.VERIFY_USER_CLIENT_SECRET
          ? { clientSecret: value.VERIFY_USER_CLIENT_SECRET }
          : {}),
        scopes: value.VERIFY_USER_SCOPES,
      },
      obo: {
        ...(value.VERIFY_OBO_TOKEN_URL
          ? { tokenUrl: value.VERIFY_OBO_TOKEN_URL }
          : {}),
        ...(value.VERIFY_OBO_JWKS_URL
          ? { jwksUrl: value.VERIFY_OBO_JWKS_URL }
          : {}),
        ...(value.VERIFY_OBO_ISSUER ? { issuer: value.VERIFY_OBO_ISSUER } : {}),
        ...(value.VERIFY_OBO_AUDIENCE
          ? { audience: value.VERIFY_OBO_AUDIENCE }
          : {}),
        ...(value.VERIFY_OBO_CLIENT_ID
          ? { clientId: value.VERIFY_OBO_CLIENT_ID }
          : {}),
        ...(value.VERIFY_OBO_SCOPE ? { scope: value.VERIFY_OBO_SCOPE } : {}),
        actorClaim: value.VERIFY_OBO_ACTOR_CLAIM,
        ...(value.VERIFY_OBO_ACTOR_VALUE
          ? { actorValue: value.VERIFY_OBO_ACTOR_VALUE }
          : {}),
      },
    },
    vault: {
      ...(value.VAULT_ADDR
        ? { address: value.VAULT_ADDR.replace(/\/$/, "") }
        : {}),
      ...(value.VAULT_NAMESPACE ? { namespace: value.VAULT_NAMESPACE } : {}),
      jwtAuthPath: value.VAULT_JWT_AUTH_PATH,
      ...(value.VAULT_JWT_ROLE ? { jwtRole: value.VAULT_JWT_ROLE } : {}),
      databaseCredentialsPath: value.VAULT_DB_CREDS_PATH,
      ...(value.VAULT_CA_PEM
        ? { caPem: value.VAULT_CA_PEM.replaceAll("\\n", "\n") }
        : {}),
      requestTimeoutMs: value.VAULT_REQUEST_TIMEOUT_MS,
    },
    database: {
      ...(value.DB_HOST ? { host: value.DB_HOST } : {}),
      port: value.DB_PORT,
      name: value.DB_NAME,
      ...(value.DB_CA_PEM
        ? { caPem: value.DB_CA_PEM.replaceAll("\\n", "\n") }
        : {}),
      caFile: value.DB_CA_FILE,
      connectTimeoutMs: value.DB_CONNECT_TIMEOUT_MS,
      queryTimeoutMs: value.DB_QUERY_TIMEOUT_MS,
    },
  };
}
