import type { PortalStore } from "../store/types";

export async function recoverStalledFactoryBuildJobs(store: PortalStore, timeoutMs: number): Promise<number> {
  const now = Date.now();
  const recoveryThresholdMs = timeoutMs + 60_000;
  const jobs = await store.listFactoryJobs();
  let recovered = 0;

  for (const job of jobs) {
    const autoRepair = asRecord(job.snapshot.autoRepair);
    if (job.status !== "running" || autoRepair?.status !== "running") continue;
    const startedAt = typeof autoRepair.startedAt === "string" ? Date.parse(autoRepair.startedAt) : Number.NaN;
    if (!Number.isFinite(startedAt) || now - startedAt <= recoveryThresholdMs) continue;

    const completedAt = new Date().toISOString();
    const elapsedMs = Math.max(0, now - startedAt);
    const summary = "The isolated build was interrupted before its verified artifact state was saved. Run the build again.";
    const buildTest = {
      status: "fail" as const,
      steps: [
        {
          label: "Build state recovery",
          command: "factory build --isolated",
          status: "fail" as const,
          durationMs: elapsedMs,
          detail: summary
        }
      ]
    };
    const generated = asRecord(job.snapshot.generated);
    const autoRepairWithoutArtifact = Object.fromEntries(
      Object.entries(autoRepair).filter(([key]) => key !== "artifact")
    );
    const recoveredGenerated = generated
      ? Object.fromEntries(Object.entries(generated).filter(([key]) => key !== "buildArtifact"))
      : job.snapshot.generated;
    const recoveredSnapshot = {
      ...job.snapshot,
      artifactSha256: "",
      autoRepair: {
        ...autoRepairWithoutArtifact,
        status: "failed",
        phase: "complete",
        completedAt,
        buildTest,
        summary
      },
      generated: recoveredGenerated
        ? {
            ...recoveredGenerated,
            buildTest
          }
        : recoveredGenerated
    };
    await store.updateFactoryJob(job.id, {
      status: "failed",
      stage: "test",
      progress: 55,
      snapshot: recoveredSnapshot,
      deployment: { ...job.deployment, rollbackReady: false },
      events: [
        ...job.events,
        {
          id: `${String(autoRepair.id ?? job.id)}-recovery`,
          label: "build-recovery-required",
          detail: summary,
          status: "warning" as const,
          createdAt: completedAt
        }
      ].slice(-100)
    });
    await store.createAuditEvent({
      actorId: "system",
      actorEmail: "system@security-portal.local",
      action: "vault_plugin.build_recovery_required",
      targetType: "vault_plugin_job",
      targetId: job.id,
      result: "failure",
      metadata: { build_run_id: autoRepair.id, elapsed_ms: elapsedMs }
    });
    recovered += 1;
  }

  return recovered;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}
