import { describe, expect, it } from "vitest";
import { MemoryStore } from "../src/store/memory-store";

describe("Factory job persistence", () => {
  it("creates and restores a user Factory job", async () => {
    const store = new MemoryStore();
    const owner = await store.getUserByEmail("developer@example.com");
    expect(owner).toBeDefined();

    const job = await store.createFactoryJob({
      owner: owner!,
      templateId: "auth-kubernetes",
      pluginName: "vault-plugin-auth-kubernetes",
      snapshot: { activeTab: "workspace", favoriteTemplateIds: ["auth-kubernetes"] }
    });

    const restored = await store.getFactoryJob(job.id);
    expect(restored?.ownerId).toBe(owner?.id);
    expect(restored?.snapshot).toEqual({
      activeTab: "workspace",
      favoriteTemplateIds: ["auth-kubernetes"]
    });
  });

  it("updates approval and deployment state without losing the snapshot", async () => {
    const store = new MemoryStore();
    const owner = await store.getUserByEmail("admin@example.com");
    const job = await store.createFactoryJob({ owner: owner!, pluginName: "demo-plugin", snapshot: { generated: true } });

    const updated = await store.updateFactoryJob(job.id, {
      status: "approved",
      stage: "approval",
      progress: 80,
      approval: {
        status: "approved",
        artifactFingerprint: "a".repeat(64),
        requestedAt: new Date().toISOString(),
        requestedBy: owner!.email,
        decidedAt: new Date().toISOString(),
        decidedBy: owner!.email
      },
      deployment: { mode: "canary", environment: "staging", rollbackReady: true }
    });

    expect(updated.snapshot).toEqual({ generated: true });
    expect(updated.approval.status).toBe("approved");
    expect(updated.approval.artifactFingerprint).toBe("a".repeat(64));
    expect(updated.deployment.mode).toBe("canary");
    expect(updated.progress).toBe(80);
  });

  it("scopes job history by owner while allowing an all-jobs view", async () => {
    const store = new MemoryStore();
    const developer = await store.getUserByEmail("developer@example.com");
    const admin = await store.getUserByEmail("admin@example.com");
    await store.createFactoryJob({ owner: developer!, pluginName: "developer-plugin" });
    await store.createFactoryJob({ owner: admin!, pluginName: "admin-plugin" });

    expect(await store.listFactoryJobs(developer!.id)).toHaveLength(1);
    expect(await store.listFactoryJobs()).toHaveLength(2);
  });
});
