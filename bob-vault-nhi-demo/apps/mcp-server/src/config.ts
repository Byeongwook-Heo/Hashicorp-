import { z } from "zod";

import { ConfigurationError } from "./errors.js";

const optionalUrl = z.string().url().optional();
const optionalNonEmpty = z.string().min(1).optional();

const environmentSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("production"),
    PORT: z.coerce.number().int().min(1024).max(65535).default(8080),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
    APP_MODE: z.enum(["bootstrap", "aws"]).default("bootstrap"),
    SERVICE_VERSION: z.string().min(1).max(80).default("dev"),
    AWS_REGION: z.string().min(1).default("ap-northeast-2"),
    TRANSPORT_BEARER_TOKEN: z.string().min(32),
    ALLOWED_ORIGINS: z.string().default(""),
    TRUST_PROXY: z.enum(["true", "false"]).default("true"),
    VERIFY_TOKEN_URL: optionalUrl,
    VERIFY_JWKS_URL: optionalUrl,
    VERIFY_ISSUER: optionalUrl,
    VERIFY_AUDIENCE: optionalNonEmpty,
    VERIFY_CLIENT_ID: optionalNonEmpty,
    VERIFY_KMS_KEY_ID: optionalNonEmpty,
    VERIFY_SCOPE: optionalNonEmpty,
    VERIFY_NHI_CLAIM: z.string().min(1).default("sub"),
    VERIFY_NHI_VALUE: optionalNonEmpty,
    VAULT_ADDR: optionalUrl,
    VAULT_NAMESPACE: optionalNonEmpty,
    VAULT_JWT_AUTH_PATH: z.string().regex(/^[A-Za-z0-9_-]+$/).default("jwt"),
    VAULT_JWT_ROLE: optionalNonEmpty,
    VAULT_DB_CREDS_PATH: z
      .string()
      .regex(/^database\/creds\/[A-Za-z0-9_-]+$/)
      .default("database/creds/bob-orders-readonly"),
    VAULT_CA_PEM: optionalNonEmpty,
    VAULT_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1000).max(30_000).default(8_000),
    DB_HOST: optionalNonEmpty,
    DB_PORT: z.coerce.number().int().min(1).max(65535).default(5432),
    DB_NAME: z.string().min(1).default("shop_demo"),
    DB_CA_PEM: optionalNonEmpty,
    DB_CA_FILE: z.string().min(1).default("/app/certs/rds-ca.pem"),
    DB_CONNECT_TIMEOUT_MS: z.coerce.number().int().min(500).max(30_000).default(5_000),
    DB_QUERY_TIMEOUT_MS: z.coerce.number().int().min(500).max(30_000).default(5_000),
  })
  .superRefine((value, context) => {
    if (value.APP_MODE !== "aws") {
      return;
    }

    const required: Array<keyof typeof value> = [
      "VERIFY_TOKEN_URL",
      "VERIFY_JWKS_URL",
      "VERIFY_ISSUER",
      "VERIFY_AUDIENCE",
      "VERIFY_CLIENT_ID",
      "VERIFY_KMS_KEY_ID",
      "VERIFY_NHI_VALUE",
      "VAULT_ADDR",
      "VAULT_JWT_ROLE",
      "VAULT_CA_PEM",
      "DB_HOST",
    ];

    for (const field of required) {
      if (!value[field]) {
        context.addIssue({
          code: "custom",
          path: [field],
          message: `${field} is required when APP_MODE=aws`,
        });
      }
    }
    if (!value.DB_CA_PEM && !value.DB_CA_FILE) {
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
  serviceVersion: string;
  awsRegion: string;
  transportBearerToken: string;
  allowedOrigins: Set<string>;
  trustProxy: boolean;
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

function normalizePem(value: string | undefined): string | undefined {
  return value?.replaceAll("\\n", "\n");
}

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = environmentSchema.safeParse(environment);
  if (!parsed.success) {
    const reasons = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "environment"}: ${issue.message}`)
      .join("; ");
    throw new ConfigurationError(`Invalid environment configuration: ${reasons}`);
  }

  const value = parsed.data;
  return {
    nodeEnv: value.NODE_ENV,
    port: value.PORT,
    logLevel: value.LOG_LEVEL,
    appMode: value.APP_MODE,
    serviceVersion: value.SERVICE_VERSION,
    awsRegion: value.AWS_REGION,
    transportBearerToken: value.TRANSPORT_BEARER_TOKEN,
    allowedOrigins: new Set(
      value.ALLOWED_ORIGINS.split(",")
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),
    trustProxy: value.TRUST_PROXY === "true",
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
    },
    vault: {
      ...(value.VAULT_ADDR ? { address: value.VAULT_ADDR.replace(/\/$/, "") } : {}),
      ...(value.VAULT_NAMESPACE ? { namespace: value.VAULT_NAMESPACE } : {}),
      jwtAuthPath: value.VAULT_JWT_AUTH_PATH,
      ...(value.VAULT_JWT_ROLE ? { jwtRole: value.VAULT_JWT_ROLE } : {}),
      databaseCredentialsPath: value.VAULT_DB_CREDS_PATH,
      ...(value.VAULT_CA_PEM ? { caPem: normalizePem(value.VAULT_CA_PEM) } : {}),
      requestTimeoutMs: value.VAULT_REQUEST_TIMEOUT_MS,
    },
    database: {
      ...(value.DB_HOST ? { host: value.DB_HOST } : {}),
      port: value.DB_PORT,
      name: value.DB_NAME,
      ...(value.DB_CA_PEM ? { caPem: normalizePem(value.DB_CA_PEM) } : {}),
      caFile: value.DB_CA_FILE,
      connectTimeoutMs: value.DB_CONNECT_TIMEOUT_MS,
      queryTimeoutMs: value.DB_QUERY_TIMEOUT_MS,
    },
  };
}
