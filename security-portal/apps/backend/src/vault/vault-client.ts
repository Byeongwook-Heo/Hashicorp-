import { createHash } from "node:crypto";
import type {
  AccessRequest,
  SystemSummary,
  VaultPluginApplyRequest,
  VaultPluginApplyResult,
  VaultPluginMountInspectionResult,
  VaultPluginMountRemovalRequest,
  VaultPluginMountRemovalResult,
  VaultPluginMountTarget,
  VaultPluginRollbackRequest,
  VaultPluginRollbackResult,
  VaultIssueResult,
  VaultHealthStatus,
  VaultInventory,
  VaultInventoryMount,
  VaultMapping,
  VaultMappingHealth,
  VaultPluginCatalogEntry,
  VaultPluginType
} from "@security-portal/shared";
import type { AppConfig } from "../config";
import { maskValue, redact } from "../utils/redact";

type VaultMethod = "GET" | "POST" | "PUT" | "DELETE" | "LIST";

type VaultResponse = {
  status: number;
  body: Record<string, any>;
};

export interface VaultClient {
  health(): Promise<VaultHealthStatus>;
  inventory(forceRefresh?: boolean): Promise<VaultInventory>;
  inspectMappings(systems: SystemSummary[]): Promise<VaultMappingHealth[]>;
  issueCredential(request: AccessRequest, system: SystemSummary): Promise<VaultIssueResult>;
  revokeLease(leaseId: string): Promise<{ revoked: boolean; detail: Record<string, unknown> }>;
  inspectPluginMount(request: VaultPluginMountTarget): Promise<VaultPluginMountInspectionResult>;
  removePluginMount(request: VaultPluginMountRemovalRequest): Promise<VaultPluginMountRemovalResult>;
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
  async health(): Promise<VaultHealthStatus> {
    return {
      mode: "mock",
      healthy: true,
      detail: { message: "Mock Vault adapter is active" }
    };
  }

  async inventory(): Promise<VaultInventory> {
    return {
      mode: "mock",
      syncedAt: new Date().toISOString(),
      mounts: [],
      plugins: [],
      summary: {
        totalMounts: 0,
        authMounts: 0,
        secretMounts: 0,
        catalogEntries: 0,
        builtinPlugins: 0,
        customPlugins: 0,
        mountedCustomPlugins: 0,
        registeredOnlyCustomPlugins: 0,
        unregisteredMountedPlugins: 0
      },
      warnings: ["Mock Vault mode has no live mount or plugin catalog inventory"]
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

  async inspectPluginMount(request: VaultPluginMountTarget): Promise<VaultPluginMountInspectionResult> {
    const mountPath = normalizeMount(request.mountPath);
    return {
      mode: "mock",
      exists: false,
      pluginType: request.pluginType,
      mountPath,
      detail: { note: "Mock Vault mode does not mutate a Vault server" }
    };
  }

  async removePluginMount(request: VaultPluginMountRemovalRequest): Promise<VaultPluginMountRemovalResult> {
    throw new Error(`Vault mount ${normalizeMount(request.mountPath)} was not found`);
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
  private inventoryCache?: { value: VaultInventory; expiresAt: number };
  private inventoryInFlight?: Promise<VaultInventory>;

  constructor(private readonly config: AppConfig) {}

  async health(): Promise<VaultHealthStatus> {
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

  async inventory(forceRefresh = false): Promise<VaultInventory> {
    if (!this.config.vaultAddr) {
      return emptyVaultInventory("real", ["VAULT_ADDR is required"]);
    }
    if (!forceRefresh && this.inventoryCache && this.inventoryCache.expiresAt > Date.now()) {
      return this.inventoryCache.value;
    }
    if (this.inventoryInFlight) {
      return this.inventoryInFlight;
    }

    const request = this.loadInventory();
    this.inventoryInFlight = request;
    try {
      const inventory = await request;
      this.inventoryCache = {
        value: inventory,
        expiresAt: Date.now() + 10_000
      };
      return inventory;
    } finally {
      if (this.inventoryInFlight === request) {
        this.inventoryInFlight = undefined;
      }
    }
  }

  async inspectMappings(systems: SystemSummary[]): Promise<VaultMappingHealth[]> {
    const inventory = await this.inventory();
    return systems.flatMap((system) =>
      system.vaultMountMappings.map((mapping) => {
        const expected = expectedInventoryMount(mapping.mountPath);
        const inventoryUnavailable = inventory.warnings.some((warning) =>
          warning.includes(expected.kind === "auth" ? "sys/auth" : "sys/mounts")
        );
        const mounted = inventory.mounts.find(
          (item) => item.kind === expected.kind && normalizeMount(item.path) === expected.path
        );
        return {
          systemId: system.id,
          systemName: system.name,
          requestType: mapping.requestType,
          mountPath: mapping.mountPath,
          roleName: mapping.roleName,
          namespace: this.namespaceFor(system),
          reachable: Boolean(mounted),
          status: mounted ? 200 : inventoryUnavailable ? 0 : 404,
          detail: redact({
            check: "live mount inventory",
            mount_type: mounted?.type,
            plugin_version: mounted?.pluginVersion,
            source: mounted?.source,
            warning: inventory.warnings[0]
          })
        };
      })
    );
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

  async inspectPluginMount(request: VaultPluginMountTarget): Promise<VaultPluginMountInspectionResult> {
    const mountPath = normalizeMount(request.mountPath);
    this.assertPluginMountAllowed(mountPath);
    const listPath = request.pluginType === "auth" ? "sys/auth" : "sys/mounts";
    const response = await this.vaultRequest("GET", listPath, {
      namespace: this.config.vaultNamespace,
      credentialScope: "plugin",
      tolerateStatus: [200]
    });
    const mounted = response.body.data?.[`${mountPath}/`] ?? response.body.data?.[mountPath];
    if (!mounted || typeof mounted !== "object") {
      return {
        mode: "real",
        exists: false,
        pluginType: request.pluginType,
        mountPath,
        detail: { list_path: listPath }
      };
    }
    const identity = pluginMountIdentity(request.pluginType, mountPath, mounted);
    return {
      mode: "real",
      exists: true,
      pluginType: request.pluginType,
      mountPath,
      fingerprint: pluginMountFingerprint(request.pluginType, mountPath, mounted),
      mountType: identity.type || undefined,
      description: identity.description || undefined,
      pluginVersion: identity.pluginVersion || undefined,
      detail: redact({
        list_path: listPath,
        mount_type: identity.type,
        description: identity.description,
        plugin_version: identity.pluginVersion
      })
    };
  }

  async removePluginMount(request: VaultPluginMountRemovalRequest): Promise<VaultPluginMountRemovalResult> {
    const inspected = await this.inspectPluginMount(request);
    if (!inspected.exists || !inspected.fingerprint) {
      throw new Error(`Vault mount ${inspected.mountPath} was not found`);
    }
    if (inspected.fingerprint !== request.expectedFingerprint) {
      throw new Error(`Vault mount ${inspected.mountPath} changed after inspection; inspect it again`);
    }
    const mountApiPath = request.pluginType === "auth"
      ? `sys/auth/${inspected.mountPath}`
      : `sys/mounts/${inspected.mountPath}`;
    const disable = await this.vaultRequest("DELETE", mountApiPath, {
      namespace: this.config.vaultNamespace,
      credentialScope: "plugin",
      tolerateStatus: [200, 204, 404]
    });
    const verified = await this.inspectPluginMount(request);
    if (verified.exists) {
      throw new Error(`Vault mount ${inspected.mountPath} is still present after deletion`);
    }
    this.invalidateInventoryCache();
    return {
      mode: "real",
      removed: true,
      pluginType: request.pluginType,
      mountPath: inspected.mountPath,
      steps: [
        { label: "Disable existing mount", status: "success", detail: `${mountApiPath} returned ${disable.status}` },
        { label: "Verify mount removal", status: "success", detail: `Verified via ${request.pluginType === "auth" ? "sys/auth" : "sys/mounts"}` }
      ],
      detail: redact({ disable_status: disable.status, previous_mount_type: inspected.mountType })
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

    const mountsBefore = await this.vaultRequest("GET", enableListPath, {
      namespace: this.config.vaultNamespace,
      credentialScope: "plugin",
      tolerateStatus: [200]
    });
    if (mountsBefore.body.data?.[`${mountPath}/`] ?? mountsBefore.body.data?.[mountPath]) {
      throw new Error(`Vault mount ${mountPath} already exists`);
    }

    const catalogBefore = await this.vaultRequest("GET", catalogPath, {
      namespace: this.config.vaultNamespace,
      credentialScope: "plugin",
      tolerateStatus: [200, 404]
    });
    const existingCatalog = catalogBefore.status === 200 ? catalogBefore.body.data ?? {} : undefined;
    if (
      existingCatalog &&
      (String(existingCatalog.sha256 ?? "").toLowerCase() !== request.artifactSha256.toLowerCase() ||
        String(existingCatalog.command ?? "") !== request.command)
    ) {
      throw new Error(`Vault plugin catalog entry ${pluginName} does not match the approved artifact`);
    }

    let catalogCreatedByAttempt = false;
    let mountCreatedByAttempt = false;
    let registerStatus = catalogBefore.status;
    let enableStatus = 0;

    try {
      if (!existingCatalog) {
        catalogCreatedByAttempt = true;
        const register = await this.vaultRequest("POST", catalogPath, {
          namespace: this.config.vaultNamespace,
          credentialScope: "plugin",
          body: {
            sha256: request.artifactSha256,
            command: request.command,
            version: request.version
          }
        });
        registerStatus = register.status;
      }

      mountCreatedByAttempt = true;
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
      enableStatus = enable.status;

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
        credentialScope: "runtime",
        tolerateStatus: [200]
      });

      this.invalidateInventoryCache();
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
            detail: existingCatalog
              ? `Reused the matching ${catalogPath} entry`
              : `${catalogPath} returned ${registerStatus}`
          },
          {
            label: "Enable mount",
            status: "success",
            detail: `${enablePath} returned ${enableStatus}`
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
          register_status: registerStatus,
          catalog_reused: Boolean(existingCatalog),
          enable_status: enableStatus,
          smoke_status: smoke.status,
          smoke_response_keys: Object.keys(smoke.body.data ?? {}),
          mounted
        })
      };
    } catch (error) {
      const cleanup: string[] = [];
      if (mountCreatedByAttempt) {
        const disable = await this.vaultRequest("DELETE", enablePath, {
          namespace: this.config.vaultNamespace,
          credentialScope: "plugin",
          tolerateStatus: [200, 204, 404]
        }).catch((cleanupError) => {
          cleanup.push(`mount cleanup failed: ${errorMessage(cleanupError)}`);
          return undefined;
        });
        if (disable) cleanup.push(`mount cleanup returned ${disable.status}`);
      }
      if (catalogCreatedByAttempt) {
        const remove = await this.vaultRequest("DELETE", catalogPath, {
          namespace: this.config.vaultNamespace,
          credentialScope: "plugin",
          tolerateStatus: [200, 204, 404]
        }).catch((cleanupError) => {
          cleanup.push(`catalog cleanup failed: ${errorMessage(cleanupError)}`);
          return undefined;
        });
        if (remove) cleanup.push(`catalog cleanup returned ${remove.status}`);
      }
      throw new Error(
        `Vault plugin apply failed: ${errorMessage(error)}. Automatic rollback: ${cleanup.join(", ") || "no mutation required"}`
      );
    }
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
    this.invalidateInventoryCache();
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

  private async loadInventory(): Promise<VaultInventory> {
    const namespace = this.config.vaultNamespace;
    const [secretMountResult, authMountResult] = await Promise.allSettled([
      this.vaultRequest("GET", "sys/mounts", {
        namespace,
        credentialScope: "plugin",
        tolerateStatus: [200]
      }),
      this.vaultRequest("GET", "sys/auth", {
        namespace,
        credentialScope: "plugin",
        tolerateStatus: [200]
      })
    ]);

    const warnings: string[] = [];
    const mounts: VaultInventoryMount[] = [];
    if (secretMountResult.status === "fulfilled") {
      mounts.push(...inventoryMounts(secretMountResult.value.body.data, "secret"));
    } else {
      warnings.push(`Unable to read sys/mounts: ${errorMessage(secretMountResult.reason)}`);
    }
    if (authMountResult.status === "fulfilled") {
      mounts.push(...inventoryMounts(authMountResult.value.body.data, "auth"));
    } else {
      warnings.push(`Unable to read sys/auth: ${errorMessage(authMountResult.reason)}`);
    }

    const pluginTypes: VaultPluginType[] = ["auth", "secret", "database"];
    const catalogLists = await Promise.all(
      pluginTypes.map(async (pluginType) => {
        try {
          const response = await this.vaultRequest("LIST", `sys/plugins/catalog/${pluginType}`, {
            namespace,
            credentialScope: "plugin",
            tolerateStatus: [200, 404]
          });
          return { pluginType, body: response.body };
        } catch (error) {
          return {
            pluginType,
            body: {},
            warning: `Unable to list ${pluginType} plugin catalog: ${errorMessage(error)}`
          };
        }
      })
    );
    warnings.push(...catalogLists.flatMap((item) => item.warning ? [item.warning] : []));

    const candidates = catalogLists.flatMap((item) => catalogCandidates(item.pluginType, item.body));
    const catalogDetails = await Promise.all(
      candidates.map(async (candidate) => {
        if (candidate.info.builtin === true) {
          return { candidate, detail: candidate.info };
        }
        try {
          const response = await this.vaultRequest(
            "GET",
            `sys/plugins/catalog/${candidate.pluginType}/${encodeURIComponent(candidate.name)}`,
            {
              namespace,
              credentialScope: "plugin",
              tolerateStatus: [200, 404]
            }
          );
          return { candidate, detail: { ...candidate.info, ...(response.body.data ?? {}) } };
        } catch (error) {
          return {
            candidate,
            detail: candidate.info,
            warning: `Unable to inspect ${candidate.pluginType} plugin ${candidate.name}: ${errorMessage(error)}`
          };
        }
      })
    );
    warnings.push(...catalogDetails.flatMap((item) => item.warning ? [item.warning] : []));

    const catalogPlugins = catalogDetails.map<VaultPluginCatalogEntry>(({ candidate, detail }) => {
      const builtin = detail.builtin === true;
      const mountedPaths = mounts
        .filter((mount) => {
          if (mount.type !== candidate.name) return false;
          return candidate.pluginType === "auth" ? mount.kind === "auth" : mount.kind === "secret";
        })
        .map((mount) => mount.path)
        .sort();
      return {
        name: candidate.name,
        pluginType: candidate.pluginType,
        builtin,
        status: builtin ? "builtin" : mountedPaths.length > 0 ? "mounted" : "registered",
        mountedPaths,
        command: optionalString(detail.command),
        version: optionalString(detail.version ?? detail.builtin_version),
        sha256: optionalString(detail.sha256),
        deprecationStatus: optionalString(detail.deprecation_status)
      };
    });

    const catalogPluginNames = new Set(catalogPlugins.map((plugin) => plugin.name));
    const orphanedByName = new Map<string, VaultPluginCatalogEntry>();
    for (const mount of mounts) {
      if (catalogPluginNames.has(mount.type) || !isLikelyExternalMount(mount)) continue;
      const existing = orphanedByName.get(mount.type);
      if (existing) {
        existing.mountedPaths.push(mount.path);
        continue;
      }
      orphanedByName.set(mount.type, {
        name: mount.type,
        pluginType: inferredCatalogType(mount),
        builtin: false,
        status: "orphaned",
        mountedPaths: [mount.path],
        version: mount.pluginVersion
      });
    }
    const orphanedPlugins = [...orphanedByName.values()].map((plugin) => ({
      ...plugin,
      mountedPaths: plugin.mountedPaths.sort()
    }));
    if (orphanedPlugins.length > 0) {
      warnings.push(
        `Detected ${orphanedPlugins.length} mounted external plugin${orphanedPlugins.length === 1 ? "" : "s"} without a catalog entry`
      );
    }
    const plugins = [...catalogPlugins, ...orphanedPlugins];

    const pluginsByName = new Map(plugins.map((plugin) => [plugin.name, plugin]));
    const classifiedMounts = mounts
      .map<VaultInventoryMount>((mount) => {
        const catalogPlugin = pluginsByName.get(mount.type);
        return {
          ...mount,
          source: catalogPlugin
            ? catalogPlugin.builtin
              ? "builtin"
              : "external"
            : isBuiltinMount(mount)
              ? "builtin"
              : "unknown",
          catalogType: catalogPlugin?.pluginType
        };
      })
      .sort((left, right) => left.kind.localeCompare(right.kind) || left.path.localeCompare(right.path));
    const customPlugins = plugins.filter((plugin) => !plugin.builtin);

    return {
      mode: "real",
      namespace,
      syncedAt: new Date().toISOString(),
      mounts: classifiedMounts,
      plugins: plugins.sort((left, right) => left.pluginType.localeCompare(right.pluginType) || left.name.localeCompare(right.name)),
      summary: {
        totalMounts: classifiedMounts.length,
        authMounts: classifiedMounts.filter((mount) => mount.kind === "auth").length,
        secretMounts: classifiedMounts.filter((mount) => mount.kind === "secret").length,
        catalogEntries: catalogPlugins.length,
        builtinPlugins: catalogPlugins.filter((plugin) => plugin.builtin).length,
        customPlugins: customPlugins.length,
        mountedCustomPlugins: customPlugins.filter((plugin) => plugin.status === "mounted" || plugin.status === "orphaned").length,
        registeredOnlyCustomPlugins: customPlugins.filter((plugin) => plugin.status === "registered").length,
        unregisteredMountedPlugins: customPlugins.filter((plugin) => plugin.status === "orphaned").length
      },
      warnings
    };
  }

  private invalidateInventoryCache(): void {
    this.inventoryCache = undefined;
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

type VaultCatalogCandidate = {
  name: string;
  pluginType: VaultPluginType;
  info: Record<string, any>;
};

const builtinMountTypes = new Set([
  "ad",
  "approle",
  "aws",
  "azure",
  "consul",
  "cubbyhole",
  "database",
  "gcp",
  "identity",
  "jwt",
  "keymgmt",
  "kmip",
  "kubernetes",
  "kv",
  "ldap",
  "nomad",
  "oidc",
  "openldap",
  "pki",
  "rabbitmq",
  "ssh",
  "system",
  "token",
  "totp",
  "transform",
  "transit",
  "userpass"
]);

function isBuiltinMount(mount: VaultInventoryMount): boolean {
  return builtinMountTypes.has(mount.type) || Boolean(mount.pluginVersion?.includes("+builtin"));
}

function isLikelyExternalMount(mount: VaultInventoryMount): boolean {
  if (isBuiltinMount(mount)) return false;
  return mount.type.startsWith("vault-plugin-") || Boolean(mount.pluginVersion);
}

function inferredCatalogType(mount: VaultInventoryMount): VaultPluginType {
  if (mount.kind === "auth") return "auth";
  return mount.type.includes("database") ? "database" : "secret";
}

function emptyVaultInventory(mode: "mock" | "real", warnings: string[]): VaultInventory {
  return {
    mode,
    syncedAt: new Date().toISOString(),
    mounts: [],
    plugins: [],
    summary: {
      totalMounts: 0,
      authMounts: 0,
      secretMounts: 0,
      catalogEntries: 0,
      builtinPlugins: 0,
      customPlugins: 0,
      mountedCustomPlugins: 0,
      registeredOnlyCustomPlugins: 0,
      unregisteredMountedPlugins: 0
    },
    warnings
  };
}

function inventoryMounts(data: unknown, kind: VaultInventoryMount["kind"]): VaultInventoryMount[] {
  if (!data || typeof data !== "object" || Array.isArray(data)) return [];
  return Object.entries(data as Record<string, any>).flatMap(([path, value]) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const type = optionalString(value.type);
    if (!type) return [];
    return [{
      path: normalizeMount(path),
      kind,
      type,
      description: optionalString(value.description),
      accessor: optionalString(value.accessor),
      pluginVersion: optionalString(value.running_plugin_version ?? value.config?.plugin_version),
      source: "unknown" as const
    }];
  });
}

function catalogCandidates(pluginType: VaultPluginType, body: Record<string, any>): VaultCatalogCandidate[] {
  const data = body.data && typeof body.data === "object" ? body.data : {};
  const keyInfo = data.key_info && typeof data.key_info === "object" && !Array.isArray(data.key_info)
    ? data.key_info as Record<string, Record<string, any>>
    : {};
  const keys = Array.isArray(data.keys) ? data.keys : [];
  const names = new Set(
    [...keys, ...Object.keys(keyInfo)]
      .map((key) => normalizeMount(String(key)))
      .filter(Boolean)
  );
  return [...names].map((name) => ({
    name,
    pluginType,
    info: keyInfo[name] ?? keyInfo[`${name}/`] ?? {}
  }));
}

function expectedInventoryMount(mountPath: string): { kind: VaultInventoryMount["kind"]; path: string } {
  const normalized = normalizeMount(mountPath);
  if (normalized.startsWith("auth/")) {
    return { kind: "auth", path: normalizeMount(normalized.slice("auth/".length)) };
  }
  return { kind: "secret", path: normalized };
}

function optionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized || undefined;
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

function pluginMountIdentity(
  pluginType: VaultPluginMountTarget["pluginType"],
  mountPath: string,
  mounted: Record<string, any>
): {
  pluginType: VaultPluginMountTarget["pluginType"];
  mountPath: string;
  type: string;
  accessor: string;
  uuid: string;
  description: string;
  pluginVersion: string;
} {
  return {
    pluginType,
    mountPath: normalizeMount(mountPath),
    type: String(mounted.type ?? ""),
    accessor: String(mounted.accessor ?? ""),
    uuid: String(mounted.uuid ?? ""),
    description: String(mounted.description ?? ""),
    pluginVersion: String(mounted.running_plugin_version ?? mounted.pluginVersion ?? mounted.config?.plugin_version ?? "")
  };
}

function pluginMountFingerprint(
  pluginType: VaultPluginMountTarget["pluginType"],
  mountPath: string,
  mounted: Record<string, any>
): string {
  return createHash("sha256").update(JSON.stringify(pluginMountIdentity(pluginType, mountPath, mounted))).digest("hex");
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return {};
  }
}
