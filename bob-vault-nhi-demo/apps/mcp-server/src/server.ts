import { createServer } from "node:http";

import type { Logger } from "pino";

import { loadConfig } from "./config.js";
import { PostgresOrdersDatabase } from "./database.js";
import { SecurityEventStore } from "./event-store.js";
import { createHttpApp } from "./http-app.js";
import {
  type IdentityProvider,
  UnconfiguredIdentityClient,
  VerifyIdentityClient,
} from "./identity-client.js";
import { KmsClientAssertionSigner } from "./kms-signer.js";
import { createLogger } from "./logger.js";
import { ToolService } from "./tool-service.js";
import { VaultClient } from "./vault-client.js";

const config = loadConfig();
const logger = createLogger(config);
const events = new SecurityEventStore();
const signer = createSigner();
const identity = createIdentity(signer);
const vault = new VaultClient(config.vault);
const database = new PostgresOrdersDatabase(config.database);
const tools = new ToolService(identity, vault, database, events);
const app = createHttpApp({
  config,
  logger,
  events,
  tools,
  ...(signer ? { signer } : {}),
});
const httpServer = createServer(app);

httpServer.listen(config.port, "0.0.0.0", () => {
  logger.info(
    {
      port: config.port,
      mode: config.appMode,
      protocol: "2025-11-25",
    },
    "MCP gateway is ready",
  );
});

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  logger.info({ signal }, "shutting down");

  const forceExit = setTimeout(() => process.exit(1), 10_000);
  forceExit.unref();
  httpServer.closeIdleConnections();
  httpServer.closeAllConnections();
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  await vault.close();
  clearTimeout(forceExit);
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("uncaughtException", (error) => {
  logger.fatal({ err: error }, "uncaught exception");
  void shutdown("uncaughtException");
});
process.on("unhandledRejection", (error) => {
  logger.fatal({ err: error }, "unhandled rejection");
  void shutdown("unhandledRejection");
});

function createSigner(): KmsClientAssertionSigner | undefined {
  const verify = config.verify;
  if (!verify.kmsKeyId) {
    return undefined;
  }
  return new KmsClientAssertionSigner({
    region: config.awsRegion,
    keyId: verify.kmsKeyId,
    ...(verify.clientId ? { clientId: verify.clientId } : {}),
    ...(verify.tokenUrl ? { audience: verify.tokenUrl } : {}),
  });
}

function createIdentity(
  availableSigner: KmsClientAssertionSigner | undefined,
): IdentityProvider {
  const verify = config.verify;
  if (
    !availableSigner ||
    !verify.tokenUrl ||
    !verify.jwksUrl ||
    !verify.issuer ||
    !verify.audience ||
    !verify.clientId ||
    !verify.nhiValue
  ) {
    return new UnconfiguredIdentityClient();
  }
  return new VerifyIdentityClient(
    {
      tokenUrl: verify.tokenUrl,
      jwksUrl: verify.jwksUrl,
      issuer: verify.issuer,
      audience: verify.audience,
      clientId: verify.clientId,
      ...(verify.scope ? { scope: verify.scope } : {}),
      nhiClaim: verify.nhiClaim,
      nhiValue: verify.nhiValue,
    },
    availableSigner,
  );
}

function logStartupError(error: unknown, startupLogger: Logger): never {
  startupLogger.fatal({ err: error }, "service startup failed");
  process.exit(1);
}

process.on("beforeExit", (code) => {
  if (code !== 0) {
    logStartupError(
      new Error(`process exited with code ${String(code)}`),
      logger,
    );
  }
});
