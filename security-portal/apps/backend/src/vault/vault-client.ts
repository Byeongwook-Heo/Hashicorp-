import type {
  AccessRequest,
  SystemSummary,
  VaultPluginApplyRequest,
  VaultPluginApplyResult,
  VaultPluginRollbackRequest,
  VaultPluginRollbackResult,
  VaultIssueResult,
  VaultMapping,
  VaultMappingHealth
} from "@security-portal/shared";
import type { AppConfig } from "../config";
import { maskValue, redact } from "../utils/redact";

type VaultHealth = {
  mode: "mock" | "real";
  healthy: boolean;
  detail: Record<string, unknown>;
};

type VaultMethod = "GET" | "POST" | "PUT" | "DELETE";

type VaultResponse = {
  status: number;
  body: Record<string, any>;
};

export interface VaultClient {
  health(): Promise<VaultHealth>;
  inspectMappings(systems: SystemSummary[]): Promise<VaultMappingHealth[]>;
  issueCredential(request: AccessRequest, system: SystemSummary): Promise<VaultIssueResult>;
  revokeLease(leaseId: string): Promise<{ revoked: boolean; detail: Record<string, unknown> }>;
  applyPlugin(request: VaultPluginApplyRequest): Promise<VaultPluginApplyResult>;
  rollbackPlugin(request: VaultPluginRollbackRequest): Promise<VaultPluginRollbackResult>;
}

export function createVaultClient(config: AppConfig): VaultClient {
  if (config.vaultMode === "real") {
    return new RealVaultClient(config);
  }
  return new MockVaultClient();
}

class MockVaultClient implements VaultClient {
  async health(): Promise<VaultHealth> {
    return {
      mode: "mock",
      healthy: true,
      detail: { message: "Mock Vault adapter is active" }
    };
  }

  async inspectMappings(systems: SystemSummary[]): Promise<VaultMappingHealth[]> {
    return systems.flatMap((system) =>
      system.vaultMountMappings.map((mapping) => ({
        systemId: system.id,
        systemName: system.name,
        requestType: mapping.requestType,
        mountPath: mapping.mountPath,
        roleName: mapping.roleName,
        namespace: system.vaultNamespace,
        reachable: true,
        status: "mock",
        detail: { mode: "mock" }
      }))
    );
  }

  async issueCredential(request: AccessRequest, system: SystemSummary): Promise<VaultIssueResult> {
    const mapping = selectMapping(request, system);
    const rawValue = `${request.requestType.toLowerCase()}-${crypto.randomUUID().replaceAll("-", "")}`;
    const expiresAt = addTtl(request.ttl).toISOString();
    return {
      leaseId: `${mapping.mountPath}creds/${request.id}/${crypto.randomUUID()}`,
      ttl: request.ttl,
      expiresAt,
      maskedDisplayValue: maskValue(rawValue),
      revealValue: rawValue,
      metadata: {
        mode: "mock",
        vault_namespace: system.vaultNamespace,
        vault_mount: mapping.mountPath,
        vault_role: mapping.roleName,
        request_type: request.requestType,
        external_system: inferExternalSystem(request.requestType)
      }
    };
  }

  async revokeLease(leaseId: string): Promise<{ revoked: boolean; detail: Record<string, unknown> }> {
    return {
      revoked: true,
      detail: { mode: "mock", lease_id: leaseId }
    };
  }

  async applyPlugin(request: VaultPluginApplyRequest): Promise<VaultPluginApplyResult> {
    return {
      mode: "mock",
      applied: true,
      pluginName: request.pluginName,
      mountPath: normalizeMount(request.mountPath),
      pluginType: request.pluginType,
      version: request.version,
      steps: [
        {
          label: "Catalog registration",
          status: "success",
          detail: `Mock registered ${request.pluginName} as ${request.pluginType}`
        },
        {
          label: "Enable mount",
          status: "success",
          detail:
            request.pluginType === "auth"
              ? `Mock enabled auth/${normalizeMount(request.mountPath)}`
              : `Mock enabled ${normalizeMount(request.mountPath)}/`
        },
        {
          label: "Smoke test",
          status: "planned",
          detail: "Run against a real Vault dev server before production promotion"
        }
      ],
      detail: {
        sha256: request.artifactSha256,
        command: request.command,
        description: request.description,
        note: "Mock Vault mode does not mutate a Vault server"
      }
    };
  }

  async rollbackPlugin(request: VaultPluginRollbackRequest): Promise<VaultPluginRollbackResult> {
    return {
      mode: "mock",
      rolledBack: true,
      pluginName: request.pluginName,
      mountPath: normalizeMount(request.mountPath),
      steps: [
        { label: "Disable mount", status: "success", detail: `Mock disabled ${normalizeMount(request.mountPath)}/` },
        {
          label: "Remove catalog entry",
          status: request.removeCatalog ? "success" : "skipped",
          detail: request.removeCatalog ? `Mock removed ${request.pluginName}` : "Catalog entry retained"
        }
      ]
    };
  }
}

class RealVaultClient implements VaultClient {
  private readonly cachedTokens = new Map<"runtime" | "plugin", { token: string; expiresAt: number }>();

  constructor(private readonly config: AppConfig) {}

  async health(): Promise<VaultHealth> {
    if (!this.config.vaultAddr) {
      return { mode: "real", healthy: false, detail: { error: "VAULT_ADDR is required" } };
    }

    const response = await this.vaultRequest("GET", "sys/health", {
      allowUnauthenticated: true,
      tolerateStatus: [200, 429, 472, 473, 501, 503]
    });
    const initialized = response.body.initialized === true;
    const sealed = response.body.sealed === true;
    return {
      mode: "real",
      healthy: initialized && !sealed && [200, 429, 472, 473].includes(response.status),
      detail: {
        status: response.status,
        initialized,
        sealed,
        standby: response.body.standby === true,
        performance_standby: response.body.performance_standby === true,
        version: response.body.version,
        cluster_name: response.body.cluster_name,
        cluster_id: response.body.cluster_id
      }
    };
  }

  async inspectMappings(systems: SystemSummary[]): Promise<VaultMappingHealth[]> {
    const results: VaultMappingHealth[] = [];
    for (const system of systems) {
      for (const mapping of system.vaultMountMappings) {
        const namespace = this.namespaceFor(system);
        const mount = normalizeMount(mapping.mountPath);
        try {
          const response = await this.vaultRequest("GET", `sys/internal/ui/mounts/${mount}`, {
            namespace,
            tolerateStatus: [200, 403, 404]
          });
          results.push({
            systemId: system.id,
            systemName: system.name,
            requestType: mapping.requestType,
            mountPath: mapping.mountPath,
            roleName: mapping.roleName,
            namespace,
            reachable: response.status === 200,
            status: response.status,
            detail: redact({
              mount_type: response.body.data?.type,
              path: response.body.data?.path,
              error: response.body.errors?.[0]
            })
          });
        } catch (error) {
          results.push({
            systemId: system.id,
            systemName: system.name,
            requestType: mapping.requestType,
            mountPath: mapping.mountPath,
            roleName: mapping.roleName,
            namespace,
            reachable: false,
            status: 0,
            detail: { error: error instanceof Error ? error.message : String(error) }
          });
        }
      }
    }
    return results;
  }

  async issueCredential(request: AccessRequest, system: SystemSummary): Promise<VaultIssueResult> {
    const mapping = selectMapping(request, system);
    const namespace = this.namespaceFor(system);
    const operation = buildOperation(mapping, request);
    const response = await this.vaultRequest(operation.method, operation.path, {
      namespace,
      body: operation.body,
      wrapTtl: operation.wrapTtl
    });

    const data = response.body.data ?? {};
    const ttlSeconds = ttlSecondsFromResponse(response.body, request.ttl);
    const leaseId =
      response.body.lease_id ??
      response.body.wrap_info?.wrapped_accessor ??
      `non-lease/${normalizeMount(mapping.mountPath)}/${mapping.roleName}/${request.id}`;

    return {
      leaseId,
      ttl: `${ttlSeconds}s`,
      expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
      maskedDisplayValue: displayForVaultResponse(request, response.body),
      metadata: redact({
        mode: "real",
        vault_namespace: namespace,
        vault_mount: mapping.mountPath,
        vault_role: mapping.roleName,
        request_type: request.requestType,
        vault_path: operation.path,
        lease_renewable: response.body.renewable,
        response_keys: Object.keys(data),
        wrap_info: response.body.wrap_info
          ? {
              ttl: response.body.wrap_info.ttl,
              creation_time: response.body.wrap_info.creation_time,
              wrapped_accessor: response.body.wrap_info.wrapped_accessor
            }
          : undefined
      })
    };
  }

  async revokeLease(leaseId: string): Promise<{ revoked: boolean; detail: Record<string, unknown> }> {
    const response = await this.vaultRequest("PUT", "sys/leases/revoke", {
      body: { lease_id: leaseId },
      tolerateStatus: [200, 204, 400, 404]
    });
    return {
      revoked: response.status === 200 || response.status === 204,
      detail: redact({ status: response.status, errors: response.body.errors })
    };
  }

  async applyPlugin(request: VaultPluginApplyRequest): Promise<VaultPluginApplyResult> {
    if (!/^[a-f0-9]{64}$/i.test(request.artifactSha256)) {
      throw new Error("A real Vault apply requires the compiled plugin binary SHA256");
    }

    const pluginName = normalizeMount(request.pluginName);
    const mountPath = normalizeMount(request.mountPath);
    this.assertPluginMountAllowed(mountPath);
    const catalogPath = `sys/plugins/catalog/${request.pluginType}/${pluginName}`;
    const enablePath =
      request.pluginType === "auth" ? `sys/auth/${mountPath}` : `sys/mounts/${mountPath}`;
    const enableListPath = request.pluginType === "auth" ? "sys/auth" : "sys/mounts";

    const register = await this.vaultRequest("POST", catalogPath, {
      namespace: this.config.vaultNamespace,
      credentialScope: "plugin",
      body: {
        sha256: request.artifactSha256,
        command: request.command,
        version: request.version
      }
    });
    const enable = await this.vaultRequest("POST", enablePath, {
      namespace: this.config.vaultNamespace,
      credentialScope: "plugin",
      body: {
        type: pluginName,
        description: request.description ?? `${pluginName} managed by Security Portal`,
        config: {
          plugin_version: request.version
        }
      }
    });
    const verify = await this.vaultRequest("GET", enableListPath, {
      namespace: this.config.vaultNamespace,
      credentialScope: "plugin",
      tolerateStatus: [200]
    });
    const mounted = verify.body.data?.[`${mountPath}/`] ?? verify.body.data?.[mountPath];
    if (!mounted) {
      throw new Error(`Vault mounted plugin ${mountPath} was not present in ${enableListPath}`);
    }
    const smokePath =
      request.pluginType === "auth" ? `auth/${mountPath}/login` : `${mountPath}/config`;
    const smoke = await this.vaultRequest("GET", smokePath, {
      namespace: this.config.vaultNamespace,
      credentialScope: "plugin",
      tolerateStatus: [200]
    });

    return {
      mode: "real",
      applied: true,
      pluginName,
      mountPath,
      pluginType: request.pluginType,
      version: request.version,
      steps: [
        {
          label: "Catalog registration",
          status: "success",
          detail: `${catalogPath} returned ${register.status}`
        },
        {
          label: "Enable mount",
          status: "success",
          detail: `${enablePath} returned ${enable.status}`
        },
        {
          label: "Verify mount list",
          status: "success",
          detail: `Verified via ${enableListPath}`
        },
        {
          label: "Plugin read smoke test",
          status: "success",
          detail: `${smokePath} returned ${smoke.status}`
        }
      ],
      detail: redact({
        register_status: register.status,
        enable_status: enable.status,
        smoke_status: smoke.status,
        smoke_response_keys: Object.keys(smoke.body.data ?? {}),
        mounted
      })
    };
  }

  async rollbackPlugin(request: VaultPluginRollbackRequest): Promise<VaultPluginRollbackResult> {
    const pluginName = normalizeMount(request.pluginName);
    const mountPath = normalizeMount(request.mountPath);
    this.assertPluginMountAllowed(mountPath);
    const mountApiPath = request.pluginType === "auth" ? `sys/auth/${mountPath}` : `sys/mounts/${mountPath}`;
    const catalogPath = `sys/plugins/catalog/${request.pluginType}/${pluginName}`;
    const disable = await this.vaultRequest("DELETE", mountApiPath, {
      namespace: this.config.vaultNamespace,
      credentialScope: "plugin",
      tolerateStatus: [200, 204, 404]
    });
    let catalogStatus: number | undefined;
    if (request.removeCatalog) {
      const catalog = await this.vaultRequest("DELETE", catalogPath, {
        namespace: this.config.vaultNamespace,
        credentialScope: "plugin",
        tolerateStatus: [200, 204, 404]
      });
      catalogStatus = catalog.status;
    }
    return {
      mode: "real",
      rolledBack: [200, 204, 404].includes(disable.status),
      pluginName,
      mountPath,
      steps: [
        { label: "Disable mount", status: "success", detail: `${mountApiPath} returned ${disable.status}` },
        {
          label: "Remove catalog entry",
          status: request.removeCatalog ? "success" : "skipped",
          detail: request.removeCatalog ? `${catalogPath} returned ${catalogStatus}` : "Catalog entry retained"
        }
      ]
    };
  }

  private namespaceFor(system: SystemSummary): string | undefined {
    if (this.config.vaultNamespace) {
      return this.config.vaultNamespace;
    }
    if (this.config.vaultUseSystemNamespace) {
      return system.vaultNamespace;
    }
    return undefined;
  }

  private async vaultRequest(
    method: VaultMethod,
    path: string,
    options: {
      namespace?: string;
      body?: Record<string, unknown>;
      wrapTtl?: string;
      allowUnauthenticated?: boolean;
      credentialScope?: "runtime" | "plugin";
      tolerateStatus?: number[];
    } = {}
  ): Promise<VaultResponse> {
    if (!this.config.vaultAddr) {
      throw new Error("VAULT_ADDR is required for real Vault mode");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.vaultRequestTimeoutMs);
    const url = `${this.config.vaultAddr.replace(/\/$/g, "")}/v1/${path.replace(/^\/+/g, "")}`;
    try {
      const headers: Record<string, string> = {
        "content-type": "application/json"
      };
      const token = options.allowUnauthenticated
        ? undefined
        : await this.getClientToken(options.credentialScope ?? "runtime");
      if (token) headers["X-Vault-Token"] = token;
      if (options.namespace) headers["X-Vault-Namespace"] = options.namespace;
      if (options.wrapTtl) headers["X-Vault-Wrap-TTL"] = options.wrapTtl;

      const response = await fetch(url, {
        method,
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal
      });
      const body = (await safeJson(response)) as Record<string, any>;
      if (!response.ok && !options.tolerateStatus?.includes(response.status)) {
        throw new Error(`Vault API ${method} ${path} failed with ${response.status}`);
      }
      return { status: response.status, body };
    } finally {
      clearTimeout(timeout);
    }
  }

  private async getClientToken(scope: "runtime" | "plugin"): Promise<string | undefined> {
    if (this.config.vaultAuthMode === "token") {
      if (!this.config.vaultToken) {
        throw new Error("VAULT_TOKEN is required for VAULT_AUTH_MODE=token");
      }
      return this.config.vaultToken;
    }

    if (this.config.vaultAuthMode === "approle") {
      const cachedToken = this.cachedTokens.get(scope);
      if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) {
        return cachedToken.token;
      }
      const roleId = scope === "plugin" ? this.config.vaultPluginRoleId : this.config.vaultRoleId;
      const secretId = scope === "plugin" ? this.config.vaultPluginSecretId : this.config.vaultSecretId;
      if (!roleId || !secretId) {
        throw new Error(
          scope === "plugin"
            ? "VAULT_PLUGIN_ROLE_ID and VAULT_PLUGIN_SECRET_ID are required for real plugin operations"
            : "VAULT_ROLE_ID and VAULT_SECRET_ID are required for VAULT_AUTH_MODE=approle"
        );
      }
      const mount = normalizeMount(this.config.vaultAppRoleAuthMount);
      const response = await this.vaultRequest("POST", `auth/${mount}/login`, {
        allowUnauthenticated: true,
        body: {
          role_id: roleId,
          secret_id: secretId
        }
      });
      const clientToken = response.body.auth?.client_token;
      if (!clientToken) {
        throw new Error("Vault AppRole login did not return a client token");
      }
      const leaseDuration = Number(response.body.auth?.lease_duration ?? 3600);
      this.cachedTokens.set(scope, {
        token: clientToken,
        expiresAt: Date.now() + leaseDuration * 1000
      });
      return clientToken;
    }

    if (this.config.vaultAuthMode === "aws-iam") {
      throw new Error("VAULT_AUTH_MODE=aws-iam is configured but AWS IAM auth signing is not implemented in Phase 2");
    }

    if (this.config.vaultAuthMode === "oidc-pass-through") {
      throw new Error("VAULT_AUTH_MODE=oidc-pass-through requires a user Vault token broker integration");
    }

    return undefined;
  }

  private assertPluginMountAllowed(mountPath: string): void {
    const prefix = this.config.vaultPluginAllowedMountPrefix?.replace(/^\/+|\/+$/g, "");
    if (prefix && mountPath !== prefix && !mountPath.startsWith(`${prefix}/`)) {
      throw new Error(`Real plugin operations are restricted to ${prefix}/`);
    }
  }
}

function selectMapping(request: AccessRequest, system: SystemSummary): VaultMapping {
  const mapping = system.vaultMountMappings.find((item) => item.requestType === request.requestType && item.enabled);
  if (!mapping) {
    throw new Error(`No Vault mapping enabled for ${request.requestType} on ${system.name}`);
  }
  return mapping;
}

function buildOperation(
  mapping: VaultMapping,
  request: AccessRequest
): { method: VaultMethod; path: string; body?: Record<string, unknown>; wrapTtl?: string } {
  const mount = normalizeMount(mapping.mountPath);
  const payload = request.payload;

  switch (request.requestType) {
    case "KV_READ": {
      const path = stringField(payload, "path", mapping.roleName);
      return { method: "GET", path: `${mount}/data/${path}` };
    }
    case "KV_WRITE": {
      const path = stringField(payload, "path", mapping.roleName);
      const data = objectField(payload, "data");
      return { method: "POST", path: `${mount}/data/${path}`, body: { data } };
    }
    case "DB_CREDENTIAL":
      return { method: "GET", path: `${mount}/creds/${mapping.roleName}` };
    case "PKI_CERTIFICATE":
      return {
        method: "POST",
        path: `${mount}/issue/${mapping.roleName}`,
        body: {
          common_name: stringField(payload, "common_name", `${request.systemName.toLowerCase()}.service.internal`),
          ttl: request.ttl,
          alt_names: payload.alt_names
        }
      };
    case "SSH_CERTIFICATE":
      return {
        method: "POST",
        path: `${mount}/sign/${mapping.roleName}`,
        body: {
          public_key: stringField(payload, "public_key", ""),
          cert_type: stringField(payload, "cert_type", "user"),
          valid_principals: stringField(payload, "valid_principals", request.requesterEmail),
          ttl: request.ttl
        }
      };
    case "APPROLE_SECRET_ID":
      return {
        method: "POST",
        path: `${mount}/role/${mapping.roleName}/secret-id`,
        body: { metadata: payload.metadata ?? {} },
        wrapTtl: stringField(payload, "wrap_ttl", "5m")
      };
    case "NETWORK_DEVICE_ROTATION":
      return { method: "POST", path: `${mount}/rotate/${mapping.roleName}`, body: payload };
    case "CUSTOM_GITLAB_TOKEN":
    case "CUSTOM_JENKINS_TOKEN":
    case "CUSTOM_ARTIFACTORY_TOKEN":
    case "CUSTOM_KAFKA_ACCESS":
    case "CUSTOM_LEGACY_API_TOKEN":
      return { method: "POST", path: `${mount}/creds/${mapping.roleName}`, body: payload };
    default:
      return { method: "POST", path: `${mount}/creds/${mapping.roleName}`, body: payload };
  }
}

function displayForVaultResponse(request: AccessRequest, body: Record<string, any>): string {
  if (body.wrap_info?.wrapped_accessor) {
    return `[wrapped:${maskValue(body.wrap_info.wrapped_accessor)}]`;
  }
  if (body.lease_id) {
    return `[lease:${maskValue(body.lease_id)}]`;
  }
  const keys = Object.keys(body.data ?? {});
  if (keys.length > 0) {
    return `[vault-data:${keys.length} fields]`;
  }
  return `[vault:${request.requestType.toLowerCase()}]`;
}

function normalizeMount(mountPath: string): string {
  return mountPath.replace(/^\/+|\/+$/g, "");
}

function inferExternalSystem(requestType: AccessRequest["requestType"]): string {
  if (requestType.includes("GITLAB")) return "GitLab";
  if (requestType.includes("JENKINS")) return "Jenkins";
  if (requestType.includes("ARTIFACTORY")) return "Artifactory";
  if (requestType.includes("KAFKA")) return "Kafka";
  if (requestType.includes("LEGACY")) return "Legacy API";
  if (requestType.includes("NETWORK")) return "Network/Security Device";
  return "Vault built-in engine";
}

function addTtl(ttl: string): Date {
  return new Date(Date.now() + parseTtlSeconds(ttl) * 1000);
}

function ttlSecondsFromResponse(body: Record<string, any>, fallback: string): number {
  const leaseDuration = Number(body.lease_duration ?? body.data?.ttl ?? 0);
  return Number.isFinite(leaseDuration) && leaseDuration > 0 ? leaseDuration : parseTtlSeconds(fallback);
}

function parseTtlSeconds(ttl: string): number {
  const match = /^(\d+)([smhd])$/.exec(ttl.trim());
  if (!match) return 3600;
  const value = Number(match[1]);
  const unit = match[2];
  const multiplier = unit === "s" ? 1 : unit === "m" ? 60 : unit === "h" ? 3600 : 86_400;
  return value * multiplier;
}

function stringField(payload: Record<string, unknown>, key: string, fallback: string): string {
  const value = payload[key];
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function objectField(payload: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = payload[key];
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return {};
  }
}
