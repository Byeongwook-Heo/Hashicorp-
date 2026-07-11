import "dotenv/config";

export interface AppConfig {
  port: number;
  databaseUrl?: string;
  frontendOrigin: string;
  sessionCookieName: string;
  vaultMode: "mock" | "real";
  vaultAddr?: string;
  vaultNamespace?: string;
  vaultAuthMode: "mock" | "token" | "approle" | "aws-iam" | "oidc-pass-through";
  vaultToken?: string;
  vaultRoleId?: string;
  vaultSecretId?: string;
  vaultAppRoleAuthMount: string;
  vaultSkipVerify: boolean;
  vaultUseSystemNamespace: boolean;
  vaultRequestTimeoutMs: number;
  llmMode: "rules" | "ollama";
  ollamaBaseUrl?: string;
  ollamaModel: string;
  ollamaApiKey?: string;
  ollamaRequestTimeoutMs: number;
}

export function loadConfig(): AppConfig {
  return {
    port: Number(process.env.PORT ?? "4000"),
    databaseUrl: process.env.DATABASE_URL,
    frontendOrigin: process.env.FRONTEND_ORIGIN ?? "http://localhost:3000",
    sessionCookieName: process.env.SESSION_COOKIE_NAME ?? "sp_user",
    vaultMode: process.env.VAULT_MODE === "real" ? "real" : "mock",
    vaultAddr: process.env.VAULT_ADDR,
    vaultNamespace: process.env.VAULT_NAMESPACE,
    vaultAuthMode: parseVaultAuthMode(process.env.VAULT_AUTH_MODE),
    vaultToken: process.env.VAULT_TOKEN,
    vaultRoleId: process.env.VAULT_ROLE_ID,
    vaultSecretId: process.env.VAULT_SECRET_ID,
    vaultAppRoleAuthMount: process.env.VAULT_APPROLE_AUTH_MOUNT ?? "approle",
    vaultSkipVerify: process.env.VAULT_SKIP_VERIFY === "true",
    vaultUseSystemNamespace: process.env.VAULT_USE_SYSTEM_NAMESPACE === "true",
    vaultRequestTimeoutMs: Number(process.env.VAULT_REQUEST_TIMEOUT_MS ?? "10000"),
    llmMode: process.env.LLM_MODE === "ollama" ? "ollama" : "rules",
    ollamaBaseUrl: process.env.OLLAMA_BASE_URL,
    ollamaModel: process.env.OLLAMA_MODEL ?? "qwen3:8b",
    ollamaApiKey: process.env.OLLAMA_API_KEY,
    ollamaRequestTimeoutMs: Number(process.env.OLLAMA_REQUEST_TIMEOUT_MS ?? "90000")
  };
}

function parseVaultAuthMode(value: string | undefined): AppConfig["vaultAuthMode"] {
  switch (value) {
    case "token":
    case "approle":
    case "aws-iam":
    case "oidc-pass-through":
      return value;
    default:
      return "mock";
  }
}
