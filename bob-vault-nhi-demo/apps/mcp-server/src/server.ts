import { createServer } from "node:http";

import type { Logger } from "pino";

import {
  BoundedChatAgent,
  HttpMcpToolCaller,
  ResilientPlanner,
  RuleBasedPlanner,
} from "./agent.js";
import { loadConfig } from "./config.js";
import { PostgresOrdersDatabase } from "./database.js";
import { SecurityEventStore } from "./event-store.js";
import { createHttpApp } from "./http-app.js";
import {
  type IdentityProvider,
  UnconfiguredIdentityClient,
  VerifyIdentityClient,
  VerifyOboIdentityClient,
} from "./identity-client.js";
import { KmsClientAssertionSigner } from "./kms-signer.js";
import { createLogger } from "./logger.js";
import { RemoteMessagePlanner } from "./remote-planner.js";
import { ToolService } from "./tool-service.js";
import {
  UnconfiguredUserAuth,
  type UserAuthenticator,
  VerifyUserAuth,
} from "./user-auth.js";
import { VaultClient } from "./vault-client.js";

const config = loadConfig();
const logger = createLogger(config);
const events = new SecurityEventStore();
const signer = createSigner();
const identity = createIdentity(signer);
const userAuth = createUserAuth();
const vault = new VaultClient(config.vault);
const database = new PostgresOrdersDatabase(config.database);
const tools = new ToolService(identity, vault, database, events, "chat-agent");
const agent = config.chatbotEnabled ? createAgent() : undefined;
const app = createHttpApp({
  config,
  logger,
  events,
  tools,
  userAuth,
  ...(agent ? { agent } : {}),
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
    "secure agent service is ready",
  );
  if (agent) {
    void agent.preflight().then((status) => {
      logger.info(
        { ready: status.ready, mode: status.mode },
        "agent planning preflight completed",
      );
    });
  }
});

function createAgent(): BoundedChatAgent {
  const fallback = new RuleBasedPlanner();
  const planning = config.agentPlanning;
  const planner =
    planning.mode === "private" &&
    planning.baseUrl &&
    planning.model &&
    planning.apiToken
      ? new ResilientPlanner(
          new RemoteMessagePlanner({
            baseUrl: planning.baseUrl,
            model: planning.model,
            apiToken: planning.apiToken,
            timeoutMs: planning.timeoutMs,
            keepAlive: planning.keepAlive,
          }),
          fallback,
          (error) => {
            logger.warn(
              { err: error },
              "agent planning service unavailable; safe routing is active",
            );
          },
        )
      : fallback;
  return new BoundedChatAgent(
    new HttpMcpToolCaller(config.mcpInternalUrl, config.serviceVersion),
    planner,
    (event) => events.record(event),
  );
}

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
  const clientId =
    config.identityFlow === "obo" ? verify.obo.clientId : verify.clientId;
  const audience =
    config.identityFlow === "obo" ? verify.obo.tokenUrl : verify.tokenUrl;
  return new KmsClientAssertionSigner({
    region: config.awsRegion,
    keyId: verify.kmsKeyId,
    ...(clientId ? { clientId } : {}),
    ...(audience ? { audience } : {}),
  });
}

function createIdentity(
  availableSigner: KmsClientAssertionSigner | undefined,
): IdentityProvider {
  const verify = config.verify;
  if (config.identityFlow === "obo") {
    const obo = verify.obo;
    if (
      !availableSigner ||
      !obo.tokenUrl ||
      !obo.jwksUrl ||
      !obo.issuer ||
      !obo.audience ||
      !obo.clientId ||
      !obo.actorValue
    ) {
      return new UnconfiguredIdentityClient();
    }
    return new VerifyOboIdentityClient(
      {
        tokenUrl: obo.tokenUrl,
        jwksUrl: obo.jwksUrl,
        issuer: obo.issuer,
        audience: obo.audience,
        clientId: obo.clientId,
        ...(obo.scope ? { scope: obo.scope } : {}),
        actorClaim: obo.actorClaim,
        actorValue: obo.actorValue,
      },
      availableSigner,
    );
  }
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

function createUserAuth(): UserAuthenticator {
  const user = config.verify.user;
  if (
    !config.chatbotEnabled ||
    !config.sessionSecret ||
    !config.publicBaseUrl ||
    !user.authorizationUrl ||
    !user.tokenUrl ||
    !user.jwksUrl ||
    !user.issuer ||
    !user.clientId
  ) {
    return new UnconfiguredUserAuth();
  }
  return new VerifyUserAuth({
    authorizationUrl: user.authorizationUrl,
    tokenUrl: user.tokenUrl,
    jwksUrl: user.jwksUrl,
    issuer: user.issuer,
    ...(user.audience ? { audience: user.audience } : {}),
    clientId: user.clientId,
    ...(user.clientSecret ? { clientSecret: user.clientSecret } : {}),
    scopes: user.scopes,
    redirectUri: `${config.publicBaseUrl}/auth/callback`,
    sessionSecret: config.sessionSecret,
  });
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
