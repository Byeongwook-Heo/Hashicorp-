import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppConfig } from "../src/config";
import { createVaultClient } from "../src/vault/vault-client";

const config: AppConfig = {
  port: 4000,
  frontendOrigin: "http://localhost:3000",
  sessionCookieName: "sp_user",
  vaultMode: "real",
  vaultAuthMode: "token",
  vaultAddr: "http://vault.service:8200",
  vaultToken: "test-token",
  vaultAppRoleAuthMount: "approle",
  vaultSkipVerify: false,
  vaultUseSystemNamespace: false,
  vaultRequestTimeoutMs: 10000
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Vault live inventory", () => {
  it("classifies live mounts and custom catalog entries from Vault APIs", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/v1/sys/mounts")) {
        return new Response(JSON.stringify({
          data: {
            "factory-lab/github/": {
              type: "vault-plugin-secrets-github",
              description: "GitHub plugin",
              running_plugin_version: "v0.1.0"
            },
            "kv/": { type: "kv", description: "Built-in KV" }
          }
        }), { status: 200 });
      }
      if (url.endsWith("/v1/sys/auth")) {
        return new Response(JSON.stringify({
          data: { "approle/": { type: "approle", description: "AppRole" } }
        }), { status: 200 });
      }
      if (url.endsWith("/v1/sys/plugins/catalog/auth") && init?.method === "LIST") {
        return new Response(JSON.stringify({
          data: { keys: ["approle"], key_info: { approle: { builtin: true, version: "v1.0.0" } } }
        }), { status: 200 });
      }
      if (url.endsWith("/v1/sys/plugins/catalog/secret") && init?.method === "LIST") {
        return new Response(JSON.stringify({
          data: {
            keys: ["kv", "vault-plugin-secrets-github"],
            key_info: {
              kv: { builtin: true },
              "vault-plugin-secrets-github": { builtin: false }
            }
          }
        }), { status: 200 });
      }
      if (url.endsWith("/v1/sys/plugins/catalog/database") && init?.method === "LIST") {
        return new Response(JSON.stringify({
          data: {
            keys: ["vault-plugin-database-redis"],
            key_info: { "vault-plugin-database-redis": { builtin: false } }
          }
        }), { status: 200 });
      }
      if (url.endsWith("/v1/sys/plugins/catalog/secret/vault-plugin-secrets-github")) {
        return new Response(JSON.stringify({
          data: {
            builtin: false,
            command: "vault-plugin-secrets-github",
            sha256: "a".repeat(64),
            version: "v0.1.0"
          }
        }), { status: 200 });
      }
      if (url.endsWith("/v1/sys/plugins/catalog/database/vault-plugin-database-redis")) {
        return new Response(JSON.stringify({
          data: {
            builtin: false,
            command: "vault-plugin-database-redis",
            sha256: "b".repeat(64),
            version: "v0.2.0"
          }
        }), { status: 200 });
      }
      return new Response(JSON.stringify({ errors: ["not found"] }), { status: 404 });
    });
    const client = createVaultClient(config);

    const inventory = await client.inventory(true);

    expect(inventory.summary).toEqual({
      totalMounts: 3,
      authMounts: 1,
      secretMounts: 2,
      catalogEntries: 4,
      builtinPlugins: 2,
      customPlugins: 2,
      mountedCustomPlugins: 1,
      registeredOnlyCustomPlugins: 1
    });
    expect(inventory.mounts).toContainEqual(expect.objectContaining({
      path: "factory-lab/github",
      source: "external",
      catalogType: "secret"
    }));
    expect(inventory.plugins).toContainEqual(expect.objectContaining({
      name: "vault-plugin-secrets-github",
      status: "mounted",
      mountedPaths: ["factory-lab/github"]
    }));
    expect(inventory.plugins).toContainEqual(expect.objectContaining({
      name: "vault-plugin-database-redis",
      status: "registered",
      mountedPaths: []
    }));
    expect(fetchMock.mock.calls.filter((call) => call[1]?.method === "LIST")).toHaveLength(3);

    const mappings = await client.inspectMappings([{
      id: "system-test",
      name: "Test",
      description: "Test system",
      environment: "dev",
      ownerGroup: "test",
      allowedRequestTypes: ["CUSTOM_GITLAB_TOKEN"],
      vaultNamespace: "root",
      vaultMountMappings: [
        {
          id: "github",
          mountPath: "factory-lab/github/",
          roleName: "test",
          requestType: "CUSTOM_GITLAB_TOKEN",
          displayName: "GitHub",
          enabled: true
        },
        {
          id: "approle",
          mountPath: "auth/approle/",
          roleName: "test",
          requestType: "APPROLE_SECRET_ID",
          displayName: "AppRole",
          enabled: true
        },
        {
          id: "missing",
          mountPath: "missing/",
          roleName: "test",
          requestType: "CUSTOM_KAFKA_ACCESS",
          displayName: "Missing",
          enabled: true
        }
      ]
    }]);

    expect(mappings.map((mapping) => [mapping.mountPath, mapping.reachable, mapping.status])).toEqual([
      ["factory-lab/github/", true, 200],
      ["auth/approle/", true, 200],
      ["missing/", false, 404]
    ]);
  });
});
