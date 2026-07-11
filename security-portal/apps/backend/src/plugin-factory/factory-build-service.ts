import crypto from "node:crypto";
import {
  BatchGetBuildsCommand,
  CodeBuildClient,
  StartBuildCommand
} from "@aws-sdk/client-codebuild";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type {
  VaultPluginAutoRepairResult,
  VaultPluginBuildArtifact,
  VaultPluginBuildAttempt,
  VaultPluginBuildTestPlan,
  VaultPluginGeneratedFile,
  VaultPluginRequirements,
  VaultPluginSecurityReview
} from "@security-portal/shared";
import JSZip from "jszip";
import type { FactoryRepairResult } from "./factory-assistant";

interface FactoryBuildConfig {
  mode: "static" | "codebuild";
  projectName?: string;
  bucket?: string;
  prefix: string;
  maxAttempts: number;
  pollIntervalMs: number;
  timeoutMs: number;
}

interface FactoryBuildInput {
  runId?: string;
  pluginName: string;
  command: string;
  files: VaultPluginGeneratedFile[];
  requirements: VaultPluginRequirements;
}

interface BuildExecutionResult {
  status: "pass" | "fail";
  diagnostics: string;
  durationMs: number;
  formatStatus: "pass" | "fail" | "skipped";
  tidyStatus: "pass" | "fail" | "skipped";
  testStatus: "pass" | "fail" | "skipped";
  buildStatus: "pass" | "fail" | "skipped";
  artifact?: VaultPluginBuildArtifact;
}

type RepairFunction = (input: {
  files: VaultPluginGeneratedFile[];
  diagnostics: string;
  requirements: VaultPluginRequirements;
}) => Promise<FactoryRepairResult>;

export class FactoryBuildService {
  private readonly codeBuild: CodeBuildClient;
  private readonly s3: S3Client;

  constructor(
    private readonly config: FactoryBuildConfig,
    private readonly repair: RepairFunction,
    clients: { codeBuild?: CodeBuildClient; s3?: S3Client } = {}
  ) {
    this.codeBuild = clients.codeBuild ?? new CodeBuildClient({});
    this.s3 = clients.s3 ?? new S3Client({});
  }

  async run(
    input: FactoryBuildInput,
    onProgress?: (result: VaultPluginAutoRepairResult) => Promise<void> | void
  ): Promise<VaultPluginAutoRepairResult> {
    const id = input.runId ?? crypto.randomUUID();
    const startedAt = new Date().toISOString();
    let files = input.files;
    const attempts: VaultPluginBuildAttempt[] = [];
    let lastExecution: BuildExecutionResult | undefined;

    for (let attempt = 1; attempt <= this.config.maxAttempts; attempt += 1) {
      const running = buildResult({
        id,
        status: "running",
        maxAttempts: this.config.maxAttempts,
        attempts,
        files,
        startedAt,
        summary: `Build attempt ${attempt} is running.`
      });
      await onProgress?.(running);

      const execution = await this.executeBuild({ ...input, runId: id, files }, attempt);
      lastExecution = execution;
      const buildAttempt: VaultPluginBuildAttempt = {
        attempt,
        status: execution.status,
        summary:
          execution.status === "pass"
            ? "Go formatting, tests, and ARM64 plugin compilation passed."
            : "The build failed; diagnostics were collected for the repair model.",
        diagnostics: execution.diagnostics.slice(0, 16_000),
        durationMs: execution.durationMs,
        repairedFiles: []
      };
      attempts.push(buildAttempt);

      if (execution.status === "pass" && execution.artifact) {
        const result = buildResult({
          id,
          status: "pass",
          maxAttempts: this.config.maxAttempts,
          attempts,
          files,
          startedAt,
          completedAt: new Date().toISOString(),
          artifact: execution.artifact,
          execution,
          summary: `The plugin compiled successfully after ${attempt} attempt${attempt === 1 ? "" : "s"}.`
        });
        await onProgress?.(result);
        return result;
      }

      if (attempt >= this.config.maxAttempts || this.config.mode !== "codebuild") break;
      let repaired: FactoryRepairResult;
      try {
        repaired = await this.repair({
          files,
          diagnostics: execution.diagnostics,
          requirements: input.requirements
        });
      } catch (error) {
        buildAttempt.summary = `AI repair failed: ${error instanceof Error ? error.message : String(error)}`;
        break;
      }
      buildAttempt.repairedFiles = repaired.changedFiles;
      buildAttempt.provider = repaired.provider;
      buildAttempt.model = repaired.model;
      buildAttempt.summary = repaired.changedFiles.length
        ? `${repaired.summary} Changed ${repaired.changedFiles.join(", ")}.`
        : `${repaired.summary} No safe source change was returned.`;
      if (!repaired.changedFiles.length) break;
      files = repaired.files;
    }

    const result = buildResult({
      id,
      status: "failed",
      maxAttempts: this.config.maxAttempts,
      attempts,
      files,
      startedAt,
      completedAt: new Date().toISOString(),
      execution: lastExecution,
      summary: `The plugin did not pass the build after ${attempts.length} attempt${attempts.length === 1 ? "" : "s"}.`
    });
    await onProgress?.(result);
    return result;
  }

  private async executeBuild(
    input: FactoryBuildInput & { runId: string },
    attempt: number
  ): Promise<BuildExecutionResult> {
    if (this.config.mode !== "codebuild") {
      return {
        status: "fail",
        diagnostics: "FACTORY_BUILD_MODE is not configured for the isolated AWS CodeBuild runner.",
        durationMs: 0,
        formatStatus: "skipped",
        tidyStatus: "skipped",
        testStatus: "skipped",
        buildStatus: "skipped"
      };
    }
    if (!this.config.projectName || !this.config.bucket) {
      throw new Error("Factory CodeBuild project and artifact bucket are required");
    }

    const sourceKey = `${this.config.prefix}/${input.runId}/attempt-${attempt}/source.zip`;
    const resultKey = `${this.config.prefix}/${input.runId}/attempt-${attempt}/result.json`;
    const artifactKey = `${this.config.prefix}/${input.runId}/artifact/${input.command}`;
    const zip = new JSZip();
    for (const file of input.files) {
      assertSafeFile(file);
      zip.file(file.path, file.content);
    }
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: sourceKey,
        Body: await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }),
        ContentType: "application/zip",
        ServerSideEncryption: "AES256"
      })
    );

    const startedAt = Date.now();
    const started = await this.codeBuild.send(
      new StartBuildCommand({
        projectName: this.config.projectName,
        environmentVariablesOverride: [
          { name: "FACTORY_BUCKET", value: this.config.bucket, type: "PLAINTEXT" },
          { name: "FACTORY_SOURCE_KEY", value: sourceKey, type: "PLAINTEXT" },
          { name: "FACTORY_RESULT_KEY", value: resultKey, type: "PLAINTEXT" },
          { name: "FACTORY_ARTIFACT_KEY", value: artifactKey, type: "PLAINTEXT" },
          { name: "FACTORY_PLUGIN_NAME", value: input.pluginName, type: "PLAINTEXT" },
          { name: "FACTORY_COMMAND", value: input.command, type: "PLAINTEXT" }
        ]
      })
    );
    const buildId = started.build?.id;
    if (!buildId) throw new Error("Factory CodeBuild did not return a build ID");

    const deadline = Date.now() + this.config.timeoutMs;
    let buildStatus = "IN_PROGRESS";
    while (Date.now() < deadline) {
      await delay(this.config.pollIntervalMs);
      const response = await this.codeBuild.send(new BatchGetBuildsCommand({ ids: [buildId] }));
      buildStatus = response.builds?.[0]?.buildStatus ?? "UNKNOWN";
      if (["SUCCEEDED", "FAILED", "FAULT", "STOPPED", "TIMED_OUT"].includes(buildStatus)) break;
    }
    if (buildStatus === "IN_PROGRESS") throw new Error("Factory CodeBuild timed out");

    try {
      const object = await this.s3.send(new GetObjectCommand({ Bucket: this.config.bucket, Key: resultKey }));
      const raw = await object.Body?.transformToString();
      const result = JSON.parse(raw ?? "{}") as {
        status?: "pass" | "fail";
        diagnostics_base64?: string;
        sha256?: string;
        format_status?: BuildExecutionResult["formatStatus"];
        tidy_status?: BuildExecutionResult["tidyStatus"];
        test_status?: BuildExecutionResult["testStatus"];
        build_status?: BuildExecutionResult["buildStatus"];
      };
      const status = result.status === "pass" ? "pass" : "fail";
      const sha256 = result.sha256?.trim();
      return {
        status,
        diagnostics: result.diagnostics_base64
          ? Buffer.from(result.diagnostics_base64, "base64").toString("utf8").slice(-16_000)
          : `CodeBuild completed with ${buildStatus}.`,
        durationMs: Date.now() - startedAt,
        formatStatus: result.format_status ?? "skipped",
        tidyStatus: result.tidy_status ?? "skipped",
        testStatus: result.test_status ?? "skipped",
        buildStatus: result.build_status ?? "skipped",
        artifact:
          status === "pass" && sha256 && /^[a-f0-9]{64}$/i.test(sha256)
            ? {
                bucket: this.config.bucket,
                key: artifactKey,
                sha256,
                architecture: "arm64",
                command: input.command,
                builtAt: new Date().toISOString()
              }
            : undefined
      };
    } catch (error) {
      return {
        status: "fail",
        diagnostics: `CodeBuild ${buildStatus}; result artifact unavailable: ${error instanceof Error ? error.message : String(error)}`,
        durationMs: Date.now() - startedAt,
        formatStatus: "skipped",
        tidyStatus: "skipped",
        testStatus: "skipped",
        buildStatus: "fail"
      };
    }
  }
}

function buildResult(input: {
  id: string;
  status: VaultPluginAutoRepairResult["status"];
  maxAttempts: number;
  attempts: VaultPluginBuildAttempt[];
  files: VaultPluginGeneratedFile[];
  startedAt: string;
  completedAt?: string;
  artifact?: VaultPluginBuildArtifact;
  execution?: BuildExecutionResult;
  summary: string;
}): VaultPluginAutoRepairResult {
  return {
    id: input.id,
    status: input.status,
    maxAttempts: input.maxAttempts,
    attempts: input.attempts,
    files: input.files,
    scaffoldSha256: hashFiles(input.files),
    buildTest: buildTestPlan(input.execution, input.files.length),
    securityReview: securityReview(input.files),
    artifact: input.artifact,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    summary: input.summary
  };
}

function buildTestPlan(execution: BuildExecutionResult | undefined, fileCount: number): VaultPluginBuildTestPlan {
  const status = execution?.status === "pass" ? "pass" : execution ? "fail" : "warn";
  return {
    status,
    steps: [
      {
        label: "Source package",
        command: "factory validate source",
        status: "pass",
        durationMs: 0,
        detail: `${fileCount} files were packaged for an isolated build.`
      },
      {
        label: "Go formatting",
        command: "gofmt -w ./...",
        status: buildStepStatus(execution?.formatStatus),
        durationMs: 0,
        detail: "Formatting ran inside the isolated CodeBuild worker."
      },
      {
        label: "Dependency tidy",
        command: "go mod tidy",
        status: buildStepStatus(execution?.tidyStatus),
        durationMs: 0,
        detail: "Dependencies are resolved without Vault runtime credentials."
      },
      {
        label: "Unit tests",
        command: "go test ./...",
        status: buildStepStatus(execution?.testStatus),
        durationMs: execution?.durationMs ?? 0,
        detail: execution?.diagnostics.slice(-1000) ?? "Waiting for the isolated test runner."
      },
      {
        label: "ARM64 plugin binary",
        command: "GOOS=linux GOARCH=arm64 CGO_ENABLED=0 go build",
        status: buildStepStatus(execution?.buildStatus),
        durationMs: execution?.durationMs ?? 0,
        detail: execution?.artifact ? `Binary SHA256 ${execution.artifact.sha256}` : "No deployable binary is available yet."
      }
    ]
  };
}

function securityReview(files: VaultPluginGeneratedFile[]): VaultPluginSecurityReview {
  const source = files.map((file) => file.content).join("\n");
  const candidates: Array<[RegExp, string, string]> = [
    [/InsecureSkipVerify\s*:\s*true/i, "TLS verification disabled", "Require verified TLS for every upstream API."],
    [/os\/exec|exec\.Command/i, "Process execution detected", "Remove subprocess execution from the plugin."],
    [/0\.0\.0\.0\/0/, "Unrestricted network range", "Replace it with an approved private CIDR."],
    [/(?:hvs\.|hvb\.|sk-[a-z0-9_-]{12,})/i, "Possible embedded credential", "Remove the value and use sealed plugin configuration."]
  ];
  const findings = candidates
    .filter(([pattern]) => pattern.test(source))
    .map(([, title, remediation]) => ({
      severity: "high" as const,
      title,
      detail: "The generated or repaired source contains a blocked security pattern.",
      remediation
    }));
  return {
    score: Math.max(0, 100 - findings.length * 30),
    posture: findings.length ? "blocked" : "ready",
    findings
  };
}

function hashFiles(files: VaultPluginGeneratedFile[]): string {
  const hash = crypto.createHash("sha256");
  for (const file of [...files].sort((left, right) => left.path.localeCompare(right.path))) {
    hash.update(file.path);
    hash.update("\0");
    hash.update(file.content);
    hash.update("\0");
  }
  return hash.digest("hex");
}

function assertSafeFile(file: VaultPluginGeneratedFile): void {
  if (!file.path || file.path.startsWith("/") || file.path.includes("..")) {
    throw new Error(`Unsafe generated file path: ${file.path}`);
  }
}

function buildStepStatus(
  status: BuildExecutionResult["formatStatus"] | undefined
): "pass" | "fail" | "warn" | "pending" {
  if (!status) return "pending";
  return status === "skipped" ? "warn" : status;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
