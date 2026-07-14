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

  it("keeps separate workspaces isolated when they generate the same plugin", async () => {
    const store = new MemoryStore();
    const owner = await store.getUserByEmail("developer@example.com");
    const firstArtifact = "a".repeat(64);
    const secondArtifact = "b".repeat(64);
    const first = await store.createFactoryJob({
      owner: owner!,
      templateId: "github-secrets",
      pluginName: "vault-plugin-secrets-github",
      snapshot: { workspaceId: "workspace-first", artifactSha256: firstArtifact }
    });
    const second = await store.createFactoryJob({
      owner: owner!,
      templateId: "github-secrets",
      pluginName: "vault-plugin-secrets-github",
      snapshot: { workspaceId: "workspace-second", artifactSha256: "" }
    });

    await store.updateFactoryJob(second.id, {
      snapshot: { workspaceId: "workspace-second", artifactSha256: secondArtifact }
    });

    expect((await store.getFactoryJob(first.id))?.snapshot).toEqual({
      workspaceId: "workspace-first",
      artifactSha256: firstArtifact
    });
    expect((await store.getFactoryJob(second.id))?.snapshot).toEqual({
      workspaceId: "workspace-second",
      artifactSha256: secondArtifact
    });
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

  it("updates history details without changing plugin artifact fields", async () => {
    const store = new MemoryStore();
    const owner = await store.getUserByEmail("developer@example.com");
    const job = await store.createFactoryJob({
      owner: owner!,
      templateId: "auth-kubernetes",
      pluginName: "vault-plugin-auth-kubernetes",
      snapshot: { generated: true }
    });

    const updated = await store.updateFactoryJob(job.id, {
      historyTitle: "Kubernetes auth production review",
      historyNote: "Waiting for platform team feedback"
    });

    expect(updated.historyTitle).toBe("Kubernetes auth production review");
    expect(updated.historyNote).toBe("Waiting for platform team feedback");
    expect(updated.pluginName).toBe(job.pluginName);
    expect(updated.templateId).toBe(job.templateId);
    expect(updated.snapshot).toEqual(job.snapshot);
    expect(updated.approval).toEqual(job.approval);
  });

  it("deletes a saved Factory job and returns the deleted record", async () => {
    const store = new MemoryStore();
    const owner = await store.getUserByEmail("developer@example.com");
    const job = await store.createFactoryJob({ owner: owner!, pluginName: "temporary-plugin" });

    const deleted = await store.deleteFactoryJob(job.id);

    expect(deleted.id).toBe(job.id);
    expect(await store.getFactoryJob(job.id)).toBeUndefined();
    await expect(store.deleteFactoryJob(job.id)).rejects.toThrow("Factory job not found");
  });
});
