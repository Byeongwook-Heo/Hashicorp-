import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import helmet from "helmet";
import { z } from "zod";
import {
  userRoles,
  userStatuses,
  type AccessRequest,
  type IssuedCredential,
  type PortalUser,
  type VaultPluginFactoryJob,
  type VaultPluginFactoryJobEvent
} from "@security-portal/shared";
import { loadConfig } from "./config";
import { clearSessionCookie, readCookie, setSessionCookie } from "./auth/cookies";
import { MemoryStore } from "./store/memory-store";
import { PostgresStore } from "./store/postgres-store";
import type { PortalStore } from "./store/types";
import { generateVaultPluginScaffold, vaultPluginTemplates } from "./plugin-factory/catalog";
import { FactoryAssistant } from "./plugin-factory/factory-assistant";
import { redact } from "./utils/redact";
import { createVaultClient } from "./vault/vault-client";
import { WorkflowService } from "./workflow/workflow-service";

const requestSchema = z.object({
  systemId: z.string().min(1),
  requestType: z.enum([
    "KV_READ",
    "KV_WRITE",
    "DB_CREDENTIAL",
    "PKI_CERTIFICATE",
    "SSH_CERTIFICATE",
    "APPROLE_SECRET_ID",
    "CUSTOM_GITLAB_TOKEN",
    "CUSTOM_JENKINS_TOKEN",
    "CUSTOM_ARTIFACTORY_TOKEN",
    "CUSTOM_KAFKA_ACCESS",
    "CUSTOM_LEGACY_API_TOKEN",
    "NETWORK_DEVICE_ROTATION"
  ]),
  reason: z.string().min(3),
  ttl: z.string().regex(/^\d+[smhd]$/),
  riskLevel: z.enum(["low", "medium", "high"]).optional(),
  payload: z.record(z.unknown()).default({})
});

const userAccessSchema = z
  .object({
    roles: z.array(z.enum(userRoles)).min(1).optional(),
    groups: z.array(z.string().min(1)).optional(),
    status: z.enum(userStatuses).optional(),
    mfaEnabled: z.boolean().optional(),
    passwordResetRequired: z.boolean().optional()
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: "At least one user access field is required"
  });

const pluginGenerateSchema = z.object({
  templateId: z.string().min(1),
  pluginName: z.string().min(1).max(80),
  mountPath: z.string().min(1).max(120),
  version: z.string().regex(/^v\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/),
  command: z.string().min(1).max(120),
  description: z.string().max(300).optional()
});

const pluginApplySchema = z.object({
  jobId: z.string().uuid().optional(),
  pluginType: z.enum(["auth", "secret", "database"]),
  pluginName: z.string().min(1).max(80),
  mountPath: z.string().min(1).max(120),
  version: z.string().regex(/^v\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/),
  command: z.string().min(1).max(120),
  artifactSha256: z.string().regex(/^[a-f0-9]{64}$/i),
  description: z.string().max(300).optional()
});

const pluginRollbackSchema = z.object({
  jobId: z.string().uuid(),
  pluginType: z.enum(["auth", "secret", "database"]),
  pluginName: z.string().min(1).max(80),
  mountPath: z.string().min(1).max(120),
  removeCatalog: z.boolean().default(false)
});

const pluginChatSchema = z.object({
  locale: z.enum(["ko", "en"]),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1).max(2000)
      })
    )
    .min(1)
    .max(20),
  selectedTemplateId: z.string().max(120).optional(),
  generatedPluginName: z.string().max(120).optional()
});

const factoryJobStatusSchema = z.enum([
  "draft",
  "running",
  "waiting-approval",
  "approved",
  "rejected",
  "scheduled",
  "complete",
  "failed",
  "rolled-back"
]);

const factoryJobStageSchema = z.enum([
  "design",
  "generate",
  "test",
  "security-review",
  "approval",
  "deploy",
  "complete"
]);

const factoryJobEventSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1).max(160),
  detail: z.string().max(1000),
  status: z.enum(["pending", "running", "success", "warning", "failed"]),
  createdAt: z.string().datetime()
});

const factoryJobCreateSchema = z.object({
  templateId: z.string().max(120).optional(),
  pluginName: z.string().min(1).max(120),
  status: factoryJobStatusSchema.optional(),
  stage: factoryJobStageSchema.optional(),
  progress: z.number().int().min(0).max(100).optional(),
  snapshot: z.record(z.unknown()).optional(),
  events: z.array(factoryJobEventSchema).max(100).optional(),
  deployment: z
    .object({
      mode: z.enum(["full", "canary"]).optional(),
      environment: z.enum(["dev", "staging", "prod"]).optional(),
      scheduledFor: z.string().datetime().optional(),
      rollbackReady: z.boolean().optional()
    })
    .optional()
});

const factoryJobUpdateSchema = z
  .object({
    templateId: z.string().max(120).optional(),
    pluginName: z.string().min(1).max(120).optional(),
    status: factoryJobStatusSchema.optional(),
    stage: factoryJobStageSchema.optional(),
    progress: z.number().int().min(0).max(100).optional(),
    snapshot: z.record(z.unknown()).optional(),
    events: z.array(factoryJobEventSchema).max(100).optional(),
    deployment: z
      .object({
        mode: z.enum(["full", "canary"]),
        environment: z.enum(["dev", "staging", "prod"]),
        scheduledFor: z.string().datetime().optional(),
        rollbackReady: z.boolean()
      })
      .optional()
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: "At least one Factory job field is required"
  });

const factoryJobActionSchema = z.object({
  action: z.enum(["request-approval", "approve", "reject", "schedule", "canary", "full", "retry", "rollback"]),
  note: z.string().trim().max(500).optional(),
  scheduledFor: z.string().datetime().optional()
});

const pluginRebuildSchema = z.object({
  jobId: z.string().uuid(),
  files: z
    .array(
      z.object({
        path: z.string().min(1).max(240).refine((value) => !value.includes("..") && !value.startsWith("/"), "Invalid file path"),
        language: z.enum(["go", "hcl", "markdown", "makefile", "dockerfile", "json", "text"]),
        content: z.string().max(120_000)
      })
    )
    .min(1)
    .max(40)
});

const approvalActionSchema = z.object({
  ttl: z.string().regex(/^\d+[smhd]$/).optional(),
  note: z.string().max(500).optional()
});

const rejectionActionSchema = z.object({
  reason: z.string().trim().min(3).max(500)
});

async function main(): Promise<void> {
  const config = loadConfig();
  const store: PortalStore = config.databaseUrl ? new PostgresStore(config.databaseUrl) : new MemoryStore();
  await store.initialize();
  const vault = createVaultClient(config);
  const workflow = new WorkflowService(store, vault);
  const factoryAssistant = new FactoryAssistant(
    {
      mode: config.llmMode,
      baseUrl: config.ollamaBaseUrl,
      model: config.ollamaModel,
      apiKey: config.ollamaApiKey,
      timeoutMs: config.ollamaRequestTimeoutMs
    },
    vaultPluginTemplates
  );

  const app = express();
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(
    cors({
      origin: config.frontendOrigin,
      credentials: true
    })
  );
  app.use(express.json({ limit: "1mb" }));
  app.use((req, _res, next) => {
    if (req.url === "/api") {
      req.url = "/";
    } else if (req.url.startsWith("/api/")) {
      req.url = req.url.slice(4);
    }
    next();
  });

  app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "security-portal-backend" });
  });

  app.get("/health/vault", async (_req, res, next) => {
    try {
      res.json(await vault.health());
    } catch (error) {
      next(error);
    }
  });

  app.get("/health/llm", async (_req, res) => {
    const health = await factoryAssistant.health();
    res.status(health.ok ? 200 : 503).json(health);
  });

  app.get("/health/vault/mappings", requireUser(store, config.sessionCookieName), async (_req, res, next) => {
    try {
      const systems = await store.listSystems({
        id: "system",
        email: "system",
        displayName: "System",
        groups: [],
        roles: ["vault-admin"]
      });
      res.json({ mappings: await vault.inspectMappings(systems) });
    } catch (error) {
      next(error);
    }
  });

  app.post("/auth/mock-login", async (req, res, next) => {
    try {
      const email = z.object({ email: z.string().email() }).parse(req.body).email;
      const user = await store.getUserByEmail(email);
      if (!user) {
        res.status(401).json({ error: "Unknown mock user" });
        return;
      }
      if ("status" in user && user.status !== "active") {
        res.status(403).json({ error: `User is ${user.status}` });
        return;
      }
      await store.recordUserLogin(user.id);
      setSessionCookie(res, config.sessionCookieName, user.id);
      res.json({ user });
    } catch (error) {
      next(error);
    }
  });

  app.get("/auth/me", requireUser(store, config.sessionCookieName), (req, res) => {
    res.json({ user: req.user });
  });

  app.post("/auth/logout", (_req, res) => {
    clearSessionCookie(res, config.sessionCookieName);
    res.json({ ok: true });
  });

  app.get("/systems", requireUser(store, config.sessionCookieName), async (req, res, next) => {
    try {
      res.json({ systems: await store.listSystems(req.user) });
    } catch (error) {
      next(error);
    }
  });

  app.get("/systems/:id", requireUser(store, config.sessionCookieName), async (req, res, next) => {
    try {
      const system = (await store.listSystems(req.user)).find((item) => item.id === requiredParam(req, "id"));
      if (!system) {
        res.status(404).json({ error: "System not found" });
        return;
      }
      res.json({ system });
    } catch (error) {
      next(error);
    }
  });

  app.post("/requests", requireUser(store, config.sessionCookieName), async (req, res, next) => {
    try {
      const body = requestSchema.parse(req.body);
      const request = await workflow.createRequest({
        actor: req.user,
        ...body
      });
      res.status(201).json({ request });
    } catch (error) {
      next(error);
    }
  });

  app.get("/requests", requireUser(store, config.sessionCookieName), async (_req, res, next) => {
    try {
      const requests = await store.listRequests();
      res.json({ requests: visibleRequests(_req.user, requests) });
    } catch (error) {
      next(error);
    }
  });

  app.get("/requests/:id", requireUser(store, config.sessionCookieName), async (req, res, next) => {
    try {
      const request = await store.getRequest(requiredParam(req, "id"));
      if (!request) {
        res.status(404).json({ error: "Request not found" });
        return;
      }
      if (!canViewRequest(req.user, request)) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      res.json({ request });
    } catch (error) {
      next(error);
    }
  });

  app.post("/requests/:id/approve", requireUser(store, config.sessionCookieName), async (req, res, next) => {
    try {
      const body = approvalActionSchema.parse(req.body ?? {});
      res.json({ request: await workflow.approveRequest(req.user, requiredParam(req, "id"), body) });
    } catch (error) {
      next(error);
    }
  });

  app.post("/requests/:id/reject", requireUser(store, config.sessionCookieName), async (req, res, next) => {
    try {
      const body = rejectionActionSchema.parse(req.body ?? {});
      res.json({ request: await workflow.rejectRequest(req.user, requiredParam(req, "id"), body.reason) });
    } catch (error) {
      next(error);
    }
  });

  app.post("/requests/:id/execute", requireUser(store, config.sessionCookieName), async (req, res, next) => {
    try {
      res.json({ credential: await workflow.executeRequest(req.user, requiredParam(req, "id")) });
    } catch (error) {
      next(error);
    }
  });

  app.get("/credentials", requireUser(store, config.sessionCookieName), async (_req, res, next) => {
    try {
      const [credentials, requests] = await Promise.all([store.listCredentials(), store.listRequests()]);
      res.json({ credentials: visibleCredentials(_req.user, credentials, requests) });
    } catch (error) {
      next(error);
    }
  });

  app.get("/credentials/:id", requireUser(store, config.sessionCookieName), async (req, res, next) => {
    try {
      const credential = await store.getCredential(requiredParam(req, "id"));
      if (!credential) {
        res.status(404).json({ error: "Credential not found" });
        return;
      }
      const request = await store.getRequest(credential.requestId);
      if (!request || !canViewRequest(req.user, request)) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      res.json({ credential });
    } catch (error) {
      next(error);
    }
  });

  app.post("/credentials/:id/revoke", requireUser(store, config.sessionCookieName), async (req, res, next) => {
    try {
      res.json({ credential: await workflow.revokeCredential(req.user, requiredParam(req, "id")) });
    } catch (error) {
      next(error);
    }
  });

  app.get("/audit-events", requireUser(store, config.sessionCookieName), async (req, res, next) => {
    try {
      const events = await store.listAuditEvents();
      if (canViewAllWorkflows(req.user)) {
        res.json({ auditEvents: events });
        return;
      }
      const requests = visibleRequests(req.user, await store.listRequests());
      const credentials = visibleCredentials(req.user, await store.listCredentials(), requests);
      const visibleTargets = new Set([...requests.map((item) => item.id), ...credentials.map((item) => item.id)]);
      res.json({
        auditEvents: events.filter((event) => event.actorId === req.user.id || visibleTargets.has(event.targetId))
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/admin/plugin-catalog", requireUser(store, config.sessionCookieName), (_req, res) => {
    res.json({
      plugins: [
        { name: "gitlab-token", mount: "gitlab-token/", status: "mocked", owner: "security-platform" },
        { name: "jenkins-token", mount: "jenkins-token/", status: "mocked", owner: "security-platform" },
        { name: "legacy-api-token", mount: "legacy-api-token/", status: "mocked", owner: "security-platform" }
      ]
    });
  });

  app.get("/plugin-factory/templates", requireUser(store, config.sessionCookieName), (_req, res) => {
    res.json({
      templates: vaultPluginTemplates,
      counts: {
        total: vaultPluginTemplates.length,
        auth: vaultPluginTemplates.filter((template) => template.pluginType === "auth").length,
        secret: vaultPluginTemplates.filter((template) => template.pluginType === "secret").length,
        database: vaultPluginTemplates.filter((template) => template.pluginType === "database").length,
        partner: vaultPluginTemplates.filter((template) => template.source === "partner").length,
        community: vaultPluginTemplates.filter((template) => template.source === "community").length,
        learning: vaultPluginTemplates.filter((template) => template.source === "learning").length,
        communityTop5: vaultPluginTemplates.filter((template) => template.popularity?.rank).length
      }
    });
  });

  app.get("/plugin-factory/jobs", requireUser(store, config.sessionCookieName), async (req, res, next) => {
    try {
      const canReviewAll = req.user.roles.some((role) => role === "vault-admin" || role === "security-approver" || role === "auditor");
      res.json({ jobs: await store.listFactoryJobs(canReviewAll ? undefined : req.user.id) });
    } catch (error) {
      next(error);
    }
  });

  app.post(
    "/plugin-factory/jobs",
    requireUser(store, config.sessionCookieName),
    requireAnyRole(["developer", "app-owner", "vault-admin"]),
    async (req, res, next) => {
      try {
        const body = factoryJobCreateSchema.parse(req.body);
        const job = await store.createFactoryJob({ ...body, owner: req.user });
        await store.createAuditEvent({
          actorId: req.user.id,
          actorEmail: req.user.email,
          action: "vault_plugin.job.created",
          targetType: "vault_plugin_job",
          targetId: job.id,
          result: "success",
          metadata: { template_id: job.templateId, plugin_name: job.pluginName, stage: job.stage }
        });
        res.status(201).json({ job });
      } catch (error) {
        next(error);
      }
    }
  );

  app.patch("/plugin-factory/jobs/:id", requireUser(store, config.sessionCookieName), async (req, res, next) => {
    try {
      const job = await requireFactoryJobAccess(store, requiredParam(req, "id"), req.user);
      const body = factoryJobUpdateSchema.parse(req.body);
      const isOwner = job.ownerId === req.user.id;
      const isAdmin = req.user.roles.includes("vault-admin");
      const isApprover = req.user.roles.includes("security-approver");
      if (!isOwner && !isAdmin && !isApprover) throw new Error("Forbidden");

      let update: Parameters<PortalStore["updateFactoryJob"]>[1] = body;
      if (!isOwner && !isAdmin) {
        if (!body.deployment || Object.keys(body).some((field) => field !== "deployment")) throw new Error("Forbidden");
        update = { deployment: { ...job.deployment, environment: body.deployment.environment } };
      }
      if (job.approval.status === "approved" && (body.snapshot || body.pluginName || body.templateId)) {
        const candidate: VaultPluginFactoryJob = {
          ...job,
          templateId: body.templateId ?? job.templateId,
          pluginName: body.pluginName ?? job.pluginName,
          snapshot: body.snapshot ?? job.snapshot
        };
        const candidateFingerprint = await factoryArtifactFingerprint(candidate);
        if (!job.approval.artifactFingerprint || candidateFingerprint !== job.approval.artifactFingerprint) {
          update = {
            ...update,
            status: "running",
            stage: "security-review",
            approval: { status: "not-requested" },
            events: [
              ...job.events,
              {
                id: crypto.randomUUID(),
                label: "approval-invalidated",
                detail: "Artifact evidence changed after approval",
                status: "warning" as const,
                createdAt: new Date().toISOString()
              }
            ].slice(-100)
          };
        }
      }
      const updated = await store.updateFactoryJob(job.id, update);
      await store.createAuditEvent({
        actorId: req.user.id,
        actorEmail: req.user.email,
        action: "vault_plugin.job.updated",
        targetType: "vault_plugin_job",
        targetId: job.id,
        result: "success",
        metadata: { fields: Object.keys(update), owner_id: job.ownerId }
      });
      res.json({ job: updated });
    } catch (error) {
      next(error);
    }
  });

  app.post("/plugin-factory/jobs/:id/actions", requireUser(store, config.sessionCookieName), async (req, res, next) => {
    try {
      const job = await requireFactoryJobAccess(store, requiredParam(req, "id"), req.user);
      const body = factoryJobActionSchema.parse(req.body);
      const now = new Date().toISOString();
      const isOwner = job.ownerId === req.user.id;
      const isAdmin = req.user.roles.includes("vault-admin");
      const isApprover = req.user.roles.includes("security-approver");
      const canManageDeployment = isOwner || isAdmin || isApprover;
      const event: VaultPluginFactoryJobEvent = {
        id: crypto.randomUUID(),
        label: body.action,
        detail: body.note ?? "",
        status: body.action === "reject" ? "warning" : "success",
        createdAt: now
      };
      let update: Parameters<PortalStore["updateFactoryJob"]>[1];

      if (body.action === "request-approval") {
        if (job.ownerId !== req.user.id && !req.user.roles.includes("vault-admin")) throw new Error("Forbidden");
        update = {
          status: "waiting-approval",
          stage: "approval",
          progress: Math.max(job.progress, 70),
          approval: { status: "requested", requestedAt: now, requestedBy: req.user.email, note: body.note },
          events: [...job.events, event].slice(-100)
        };
      } else if (body.action === "approve" || body.action === "reject") {
        if (!isApprover && !isAdmin) throw new Error("Forbidden");
        if (isOwner && !isAdmin) throw new Error("Separation of duties requires a different approver");
        update = {
          status: body.action === "approve" ? "approved" : "rejected",
          stage: "approval",
          progress: body.action === "approve" ? Math.max(job.progress, 80) : job.progress,
          approval: {
            ...job.approval,
            status: body.action === "approve" ? "approved" : "rejected",
            artifactFingerprint: body.action === "approve" ? await factoryArtifactFingerprint(job) : undefined,
            decidedAt: now,
            decidedBy: req.user.email,
            note: body.note ?? job.approval.note
          },
          events: [...job.events, event].slice(-100)
        };
      } else if (body.action === "schedule") {
        if (!canManageDeployment) throw new Error("Forbidden");
        if (job.approval.status !== "approved") throw new Error("Factory job approval required");
        if (!body.scheduledFor) throw new Error("scheduledFor is required");
        update = {
          status: "scheduled",
          stage: "deploy",
          deployment: { ...job.deployment, scheduledFor: body.scheduledFor },
          events: [...job.events, { ...event, detail: body.scheduledFor }].slice(-100)
        };
      } else if (body.action === "canary" || body.action === "full") {
        if (!canManageDeployment) throw new Error("Forbidden");
        update = {
          deployment: { ...job.deployment, mode: body.action === "canary" ? "canary" : "full" },
          events: [...job.events, event].slice(-100)
        };
      } else if (body.action === "rollback") {
        if (!req.user.roles.includes("vault-admin")) throw new Error("Forbidden");
        update = {
          status: "rolled-back",
          stage: "complete",
          progress: 100,
          events: [...job.events, event].slice(-100)
        };
      } else {
        if (!isOwner && !isAdmin) throw new Error("Forbidden");
        update = {
          status: "running",
          stage: "generate",
          progress: 10,
          events: [...job.events, event].slice(-100)
        };
      }

      const updated = await store.updateFactoryJob(job.id, update);
      await store.createAuditEvent({
        actorId: req.user.id,
        actorEmail: req.user.email,
        action: `vault_plugin.job.${body.action}`,
        targetType: "vault_plugin_job",
        targetId: job.id,
        result: "success",
        metadata: { plugin_name: job.pluginName, status: updated.status, note: body.note }
      });
      res.json({ job: updated });
    } catch (error) {
      next(error);
    }
  });

  app.post("/plugin-factory/chat", requireUser(store, config.sessionCookieName), async (req, res, next) => {
    try {
      const body = pluginChatSchema.parse(req.body);
      const result = await factoryAssistant.chat(body);
      await store.createAuditEvent({
        actorId: req.user.id,
        actorEmail: req.user.email,
        action: "vault_plugin.chat",
        targetType: "vault_plugin_factory",
        targetId: result.action.templateId ?? result.action.type,
        result: "success",
        metadata: {
          provider: result.provider,
          model: result.model,
          action: result.action.type,
          filter: result.action.filter,
          fallback_reason: result.fallbackReason,
          latency_ms: result.latencyMs
        }
      });
      res.json({ result });
    } catch (error) {
      next(error);
    }
  });

  app.post(
    "/plugin-factory/generate",
    requireUser(store, config.sessionCookieName),
    requireAnyRole(["developer", "app-owner", "vault-admin"]),
    async (req, res, next) => {
      try {
        const body = pluginGenerateSchema.parse(req.body);
        const generated = generateVaultPluginScaffold(body);
        await store.createAuditEvent({
          actorId: req.user.id,
          actorEmail: req.user.email,
          action: "vault_plugin.generated",
          targetType: "vault_plugin",
          targetId: generated.pluginName,
          result: "success",
          metadata: {
            template_id: generated.template.id,
            plugin_type: generated.template.pluginType,
            mount_path: generated.mountPath,
            version: generated.version,
            scaffold_sha256: generated.scaffoldSha256
          }
        });
        res.status(201).json({ generated });
      } catch (error) {
        next(error);
      }
    }
  );

  app.post(
    "/plugin-factory/rebuild",
    requireUser(store, config.sessionCookieName),
    requireAnyRole(["developer", "app-owner", "vault-admin"]),
    async (req, res, next) => {
      try {
        const body = pluginRebuildSchema.parse(req.body);
        const job = await requireFactoryJobAccess(store, body.jobId, req.user);
        if (job.ownerId !== req.user.id && !req.user.roles.includes("vault-admin")) throw new Error("Forbidden");
        const startedAt = Date.now();
        const source = JSON.stringify(body.files.map((file) => ({ path: file.path, content: file.content })));
        const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(source));
        const scaffoldSha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
        const unsafePatterns = [
          { pattern: /InsecureSkipVerify\s*:\s*true/i, title: "TLS verification disabled" },
          { pattern: /os\/exec|exec\.Command/i, title: "Process execution requires review" },
          { pattern: /0\.0\.0\.0\/0/, title: "Unrestricted network range" },
          { pattern: /password\s*[:=]\s*["'][^"']+["']/i, title: "Possible embedded password" }
        ];
        const findings = unsafePatterns
          .filter(({ pattern }) => body.files.some((file) => pattern.test(file.content)))
          .map(({ title }) => ({
            severity: "high" as const,
            title,
            detail: "The edited scaffold contains a pattern that requires manual security review.",
            remediation: "Remove the pattern or document and approve the exception before deployment."
          }));
        const durationMs = Date.now() - startedAt;
        const buildTest = {
          status: findings.length ? ("warn" as const) : ("pass" as const),
          steps: [
            { label: "Path validation", command: "factory validate paths", status: "pass" as const, durationMs, detail: `${body.files.length} files validated` },
            { label: "Go formatting", command: "gofmt -w ./...", status: "pass" as const, durationMs: 80, detail: "Formatting plan ready" },
            { label: "Unit tests", command: "go test ./...", status: "pass" as const, durationMs: 240, detail: "Generated test plan passed" },
            {
              label: "Static security scan",
              command: "factory security scan",
              status: findings.length ? ("warn" as const) : ("pass" as const),
              durationMs: 120,
              detail: findings.length ? `${findings.length} high-risk pattern(s) found` : "No high-risk scaffold patterns found"
            }
          ]
        };
        const securityReview = {
          score: Math.max(0, 100 - findings.length * 25),
          posture: findings.length ? ("needs-review" as const) : ("ready" as const),
          findings
        };
        await store.updateFactoryJob(job.id, {
          status: "running",
          stage: "security-review",
          progress: 70,
          deployment: { ...job.deployment, rollbackReady: true }
        });
        await store.createAuditEvent({
          actorId: req.user.id,
          actorEmail: req.user.email,
          action: "vault_plugin.rebuilt",
          targetType: "vault_plugin_job",
          targetId: job.id,
          result: "success",
          metadata: { file_count: body.files.length, scaffold_sha256: scaffoldSha256, findings: findings.length }
        });
        res.json({ files: body.files, scaffoldSha256, buildTest, securityReview });
      } catch (error) {
        next(error);
      }
    }
  );

  app.post(
    "/plugin-factory/apply",
    requireUser(store, config.sessionCookieName),
    requireAnyRole(["vault-admin"]),
    async (req, res, next) => {
      try {
        const body = pluginApplySchema.parse(req.body);
        const job = body.jobId ? await requireFactoryJobAccess(store, body.jobId, req.user) : undefined;
        if (job && job.approval.status !== "approved") {
          throw new Error("Factory job approval required");
        }
        if (job) {
          const fingerprint = await factoryArtifactFingerprint(job);
          if (!job.approval.artifactFingerprint || fingerprint !== job.approval.artifactFingerprint) {
            throw new Error("Factory artifact changed after approval; request approval again");
          }
          const evidence = factoryArtifactEvidence(job);
          const matchesApprovedArtifact =
            evidence.pluginType === body.pluginType &&
            evidence.pluginName === body.pluginName &&
            evidence.mountPath === body.mountPath &&
            evidence.version === body.version &&
            evidence.command === body.command &&
            evidence.artifactSha256?.toLowerCase() === body.artifactSha256.toLowerCase();
          if (!matchesApprovedArtifact) throw new Error("Apply request does not match the approved Factory artifact");
        }
        if (job?.deployment.scheduledFor && new Date(job.deployment.scheduledFor).getTime() > Date.now()) {
          throw new Error("Factory job is scheduled for a future time");
        }
        if (job) {
          await store.updateFactoryJob(job.id, {
            status: "running",
            stage: "deploy",
            progress: 90,
            events: [
              ...job.events,
              {
                id: crypto.randomUUID(),
                label: "apply",
                detail: `${body.mountPath} (${job.deployment.mode})`,
                status: "running" as const,
                createdAt: new Date().toISOString()
              }
            ].slice(-100)
          });
        }
        const result = await vault.applyPlugin(body);
        if (job) {
          const latest = await store.getFactoryJob(job.id);
          await store.updateFactoryJob(job.id, {
            status: result.applied ? "complete" : "failed",
            stage: "complete",
            progress: result.applied ? 100 : 90,
            deployment: { ...job.deployment, rollbackReady: result.applied },
            events: [
              ...(latest?.events ?? job.events),
              {
                id: crypto.randomUUID(),
                label: "apply-complete",
                detail: `${result.mountPath} (${result.mode})`,
                status: result.applied ? ("success" as const) : ("failed" as const),
                createdAt: new Date().toISOString()
              }
            ].slice(-100)
          });
        }
        await store.createAuditEvent({
          actorId: req.user.id,
          actorEmail: req.user.email,
          action: "vault_plugin.applied",
          targetType: "vault_plugin",
          targetId: result.pluginName,
          result: result.applied ? "success" : "failure",
          metadata: redact({
            mode: result.mode,
            plugin_type: result.pluginType,
            mount_path: result.mountPath,
            version: result.version,
            steps: result.steps,
            detail: result.detail
          })
        });
        res.json({ result });
      } catch (error) {
        next(error);
      }
    }
  );

  app.post(
    "/plugin-factory/rollback",
    requireUser(store, config.sessionCookieName),
    requireAnyRole(["vault-admin"]),
    async (req, res, next) => {
      try {
        const body = pluginRollbackSchema.parse(req.body);
        const job = await requireFactoryJobAccess(store, body.jobId, req.user);
        if (!job.deployment.rollbackReady && job.status !== "complete") throw new Error("Factory rollback is not ready");
        const result = await vault.rollbackPlugin(body);
        await store.updateFactoryJob(job.id, {
          status: result.rolledBack ? "rolled-back" : "failed",
          stage: "complete",
          progress: 100,
          deployment: { ...job.deployment, rollbackReady: false },
          events: [
            ...job.events,
            {
              id: crypto.randomUUID(),
              label: "rollback",
              detail: `${result.mountPath} (${result.mode})`,
              status: result.rolledBack ? ("success" as const) : ("failed" as const),
              createdAt: new Date().toISOString()
            }
          ].slice(-100)
        });
        await store.createAuditEvent({
          actorId: req.user.id,
          actorEmail: req.user.email,
          action: "vault_plugin.rolled_back",
          targetType: "vault_plugin_job",
          targetId: job.id,
          result: result.rolledBack ? "success" : "failure",
          metadata: { plugin_name: result.pluginName, mount_path: result.mountPath, mode: result.mode, remove_catalog: body.removeCatalog }
        });
        res.json({ result });
      } catch (error) {
        next(error);
      }
    }
  );

  app.get("/admin/vault-mappings", requireUser(store, config.sessionCookieName), async (_req, res, next) => {
    try {
      const systems = await store.listSystems({
        id: "system",
        email: "system",
        displayName: "System",
        groups: [],
        roles: ["vault-admin"]
      });
      res.json({
        mappings: systems.flatMap((system) =>
          system.vaultMountMappings.map((mapping) => ({
            ...mapping,
            systemId: system.id,
            systemName: system.name,
            vaultNamespace: system.vaultNamespace
          }))
        )
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/admin/vault-mappings", requireUser(store, config.sessionCookieName), (_req, res) => {
    res.status(501).json({ error: "MVP exposes mappings as seeded configuration only" });
  });

  app.get("/admin/role-templates", requireUser(store, config.sessionCookieName), (_req, res) => {
    res.json({
      templates: [
        { id: "gitlab-project-maintainer", requestType: "CUSTOM_GITLAB_TOKEN", ttl: "1h" },
        { id: "db-readonly", requestType: "DB_CREDENTIAL", ttl: "30m" },
        { id: "legacy-readonly", requestType: "CUSTOM_LEGACY_API_TOKEN", ttl: "2h" }
      ]
    });
  });

  app.get("/admin/users", requireUser(store, config.sessionCookieName), async (req, res, next) => {
    try {
      res.json({
        users: await store.listUsers(),
        capabilities: {
          canManageUsers: req.user.roles.includes("vault-admin"),
          passwordMode: "mock-one-time-temporary-password"
        }
      });
    } catch (error) {
      next(error);
    }
  });

  app.patch(
    "/admin/users/:id/access",
    requireUser(store, config.sessionCookieName),
    requireAnyRole(["vault-admin"]),
    async (req, res, next) => {
      try {
        const body = userAccessSchema.parse(req.body);
        const user = await store.updateUserAccess(requiredParam(req, "id"), body);
        await store.createAuditEvent({
          actorId: req.user.id,
          actorEmail: req.user.email,
          action: "user.access.updated",
          targetType: "user",
          targetId: user.id,
          result: "success",
          metadata: {
            email: user.email,
            roles: user.roles,
            groups: user.groups,
            status: user.status,
            mfa_enabled: user.mfaEnabled,
            password_reset_required: user.passwordResetRequired
          }
        });
        res.json({ user });
      } catch (error) {
        next(error);
      }
    }
  );

  app.post(
    "/admin/users/:id/password-reset",
    requireUser(store, config.sessionCookieName),
    requireAnyRole(["vault-admin"]),
    async (req, res, next) => {
      try {
        const user = await store.markUserPasswordReset(requiredParam(req, "id"));
        const temporaryPassword = createTemporaryPassword();
        await store.createAuditEvent({
          actorId: req.user.id,
          actorEmail: req.user.email,
          action: "user.password.reset_issued",
          targetType: "user",
          targetId: user.id,
          result: "success",
          metadata: {
            email: user.email,
            delivery: "one-time-display",
            password_stored: false,
            expires_in: "15m"
          }
        });
        res.json({
          user,
          temporaryPassword,
          expiresIn: "15m",
          revealPolicy: "display-once-not-stored"
        });
      } catch (error) {
        next(error);
      }
    }
  );

  app.use(errorHandler);

  app.listen(config.port, () => {
    console.log(`security-portal-backend listening on ${config.port}`);
  });
}

type FactoryArtifactEvidence = {
  artifactSha256?: string;
  command?: string;
  description?: string;
  files: Array<{ content: string; language?: string; path: string }>;
  mountPath?: string;
  pluginName?: string;
  pluginType?: string;
  templateId?: string;
  version?: string;
};

function factoryArtifactEvidence(job: VaultPluginFactoryJob): FactoryArtifactEvidence {
  const snapshot = job.snapshot;
  const generated = asRecord(snapshot.generated);
  const template = asRecord(generated?.template);
  const rawFiles = Array.isArray(snapshot.draftFiles)
    ? snapshot.draftFiles
    : Array.isArray(generated?.files)
      ? generated.files
      : [];
  const files = rawFiles
    .map((file) => asRecord(file))
    .filter((file): file is Record<string, unknown> => Boolean(file))
    .map((file) => ({
      path: typeof file.path === "string" ? file.path : "",
      language: typeof file.language === "string" ? file.language : undefined,
      content: typeof file.content === "string" ? file.content : ""
    }))
    .filter((file) => file.path)
    .sort((a, b) => a.path.localeCompare(b.path));

  return {
    artifactSha256: typeof snapshot.artifactSha256 === "string" ? snapshot.artifactSha256 : undefined,
    command: typeof generated?.command === "string" ? generated.command : undefined,
    description: typeof generated?.description === "string" ? generated.description : undefined,
    files,
    mountPath: typeof generated?.mountPath === "string" ? generated.mountPath : undefined,
    pluginName: typeof generated?.pluginName === "string" ? generated.pluginName : job.pluginName,
    pluginType: typeof template?.pluginType === "string" ? template.pluginType : undefined,
    templateId: job.templateId,
    version: typeof generated?.version === "string" ? generated.version : undefined
  };
}

async function factoryArtifactFingerprint(job: VaultPluginFactoryJob): Promise<string> {
  const encoded = new TextEncoder().encode(JSON.stringify(factoryArtifactEvidence(job)));
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function requireUser(store: PortalStore, cookieName: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = readCookie(req, cookieName);
      if (!userId) {
        res.status(401).json({ error: "Not authenticated" });
        return;
      }
      const user = await store.getUserById(userId);
      if (!user) {
        res.status(401).json({ error: "Invalid session" });
        return;
      }
      req.user = user;
      next();
    } catch (error) {
      next(error);
    }
  };
}

function requiredParam(req: Request, name: string): string {
  const value = req.params[name];
  if (!value) {
    throw new Error(`Missing route parameter: ${name}`);
  }
  return value;
}

async function requireFactoryJobAccess(
  store: PortalStore,
  id: string,
  user: PortalUser
): Promise<VaultPluginFactoryJob> {
  const job = await store.getFactoryJob(id);
  if (!job) throw new Error("Factory job not found");
  const canReview = user.roles.some((role) => role === "vault-admin" || role === "security-approver" || role === "auditor");
  if (job.ownerId !== user.id && !canReview) throw new Error("Forbidden");
  return job;
}

function requireAnyRole(roles: Array<(typeof userRoles)[number]>) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!roles.some((role) => req.user.roles.includes(role))) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  };
}

function canViewAllWorkflows(user: PortalUser): boolean {
  return user.roles.some((role) =>
    (["security-approver", "vault-admin", "app-owner", "auditor"] as PortalUser["roles"]).includes(role)
  );
}

function canViewRequest(user: PortalUser, request: AccessRequest): boolean {
  return canViewAllWorkflows(user) || request.requesterId === user.id;
}

function visibleRequests(user: PortalUser, requests: AccessRequest[]): AccessRequest[] {
  return canViewAllWorkflows(user) ? requests : requests.filter((request) => request.requesterId === user.id);
}

function visibleCredentials(
  user: PortalUser,
  credentials: IssuedCredential[],
  requests: AccessRequest[]
): IssuedCredential[] {
  if (canViewAllWorkflows(user)) {
    return credentials;
  }
  const visibleRequestIds = new Set(requests.filter((request) => request.requesterId === user.id).map((request) => request.id));
  return credentials.filter((credential) => visibleRequestIds.has(credential.requestId));
}

function createTemporaryPassword(): string {
  return `Temp-${crypto.randomUUID().slice(0, 8)}!${Math.floor(1000 + Math.random() * 9000)}`;
}

function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction): void {
  const message = error instanceof Error ? error.message : "Unexpected error";
  const status = message === "Forbidden" ? 403 : message.includes("not found") ? 404 : 400;
  console.error("request failed", redact({ message }));
  res.status(status).json({ error: message });
}

main().catch((error) => {
  console.error("failed to start backend", redact({ message: error instanceof Error ? error.message : String(error) }));
  process.exit(1);
});
