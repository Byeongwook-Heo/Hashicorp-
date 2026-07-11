export const requestTypes = [
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
] as const;

export type RequestType = (typeof requestTypes)[number];

export type RequestStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "executed"
  | "expired";

export type CredentialStatus = "active" | "expired" | "revoked" | "revoke_failed";

export type UserRole =
  | "developer"
  | "app-owner"
  | "security-approver"
  | "vault-admin"
  | "auditor";

export const userRoles = [
  "developer",
  "app-owner",
  "security-approver",
  "vault-admin",
  "auditor"
] as const satisfies readonly UserRole[];

export const userStatuses = ["active", "locked", "disabled", "pending"] as const;

export type UserStatus = (typeof userStatuses)[number];

export interface PortalUser {
  id: string;
  email: string;
  displayName: string;
  groups: string[];
  roles: UserRole[];
}

export interface ManagedUser extends PortalUser {
  status: UserStatus;
  authMode: "mock" | "oidc" | "saml";
  mfaEnabled: boolean;
  passwordResetRequired: boolean;
  activeSessions: number;
  lastLoginAt?: string;
  createdAt?: string;
}

export interface SystemSummary {
  id: string;
  name: string;
  description: string;
  environment: "dev" | "staging" | "prod";
  ownerGroup: string;
  allowedRequestTypes: RequestType[];
  vaultNamespace: string;
  vaultMountMappings: VaultMapping[];
}

export interface VaultMapping {
  id: string;
  mountPath: string;
  roleName: string;
  requestType: RequestType;
  displayName: string;
  enabled: boolean;
}

export interface AccessRequest {
  id: string;
  requesterId: string;
  requesterEmail: string;
  systemId: string;
  systemName: string;
  requestType: RequestType;
  status: RequestStatus;
  reason: string;
  riskLevel: "low" | "medium" | "high";
  ttl: string;
  payload: Record<string, unknown>;
  approvalRequired: boolean;
  approvedBy?: string;
  approvedAt?: string;
  rejectedBy?: string;
  rejectedAt?: string;
  executedAt?: string;
  expiresAt?: string;
  createdAt: string;
}

export interface IssuedCredential {
  id: string;
  requestId: string;
  systemId: string;
  systemName: string;
  requestType: RequestType;
  vaultMount: string;
  vaultRole: string;
  vaultLeaseId: string;
  ttl: string;
  expiresAt: string;
  status: CredentialStatus;
  maskedDisplayValue: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  revokedAt?: string;
}

export interface AuditEvent {
  id: string;
  actorId: string;
  actorEmail: string;
  action: string;
  targetType: string;
  targetId: string;
  result: "success" | "failure";
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface VaultIssueResult {
  leaseId: string;
  ttl: string;
  expiresAt: string;
  maskedDisplayValue: string;
  metadata: Record<string, unknown>;
  revealValue?: string;
}

export interface VaultMappingHealth {
  systemId: string;
  systemName: string;
  requestType: RequestType;
  mountPath: string;
  roleName: string;
  namespace?: string;
  reachable: boolean;
  status: number | "mock";
  detail: Record<string, unknown>;
}

export type VaultPluginType = "auth" | "secret" | "database";

export type VaultPluginSource = "official" | "partner" | "learning" | "community";

export interface VaultPluginTemplate {
  id: string;
  name: string;
  displayName: string;
  pluginType: VaultPluginType;
  source: VaultPluginSource;
  repository: string;
  sourceUrl: string;
  description: string;
  defaultMountPath: string;
  defaultCommand: string;
  defaultVersion: string;
  integrationTarget: string;
  buildProfile: "scaffold" | "reference" | "adapter";
  popularity?: {
    stars: number;
    rank?: number;
    capturedAt: string;
    basis: string;
  };
  tags: string[];
  guardrails: string[];
  marketplace: VaultPluginMarketplaceProfile;
}

export interface VaultPluginGeneratedFile {
  path: string;
  language: "go" | "hcl" | "markdown" | "makefile" | "dockerfile" | "json" | "text";
  content: string;
}

export interface VaultPluginGenerateRequest {
  interviewId?: string;
  templateId: string;
  pluginName: string;
  mountPath: string;
  version: string;
  command: string;
  description?: string;
  requirements?: VaultPluginRequirements;
}

export type VaultPluginRequirementField =
  | "targetSystem"
  | "authMethod"
  | "apiBasePath"
  | "ttl"
  | "rotationStrategy"
  | "revokeStrategy"
  | "mountPath";

export interface VaultPluginRequirements {
  targetSystem: string;
  authMethod: string;
  apiBasePath: string;
  ttl: string;
  rotationStrategy: string;
  revokeStrategy: string;
  mountPath: string;
  environment: "dev" | "staging" | "prod";
  confirmed: boolean;
  confirmedAt?: string;
}

export interface VaultPluginRequirementsInterview {
  id: string;
  templateId: string;
  requestedApply: boolean;
  spec: VaultPluginRequirements;
  missingFields: VaultPluginRequirementField[];
  readyToConfirm: boolean;
  provider: "ollama" | "rules";
  model?: string;
  reply: string;
  updatedAt: string;
}

export interface VaultPluginMarketplaceProfile {
  maturity: "production-ready" | "reference" | "conditional" | "learning" | "experimental" | "lab-only";
  riskLevel: "low" | "medium" | "high";
  recommendedUse: string;
  lastReviewedAt: string;
  badges: string[];
}

export interface VaultPluginBlueprintQuestion {
  id: string;
  question: string;
  answer: string;
  required: boolean;
}

export interface VaultPluginBlueprint {
  id: string;
  name: string;
  summary: string;
  questions: VaultPluginBlueprintQuestion[];
  defaults: {
    mountPath: string;
    ttl: string;
    rotation: string;
    environment: "dev" | "staging" | "prod";
  };
}

export interface VaultPluginDryRunChange {
  action: "create" | "update" | "verify" | "skip";
  target: string;
  before: string;
  after: string;
  risk: "low" | "medium" | "high";
}

export interface VaultPluginDryRunPlan {
  summary: string;
  mode: "dry-run";
  changes: VaultPluginDryRunChange[];
  collisions: string[];
  approvals: string[];
}

export interface VaultPluginBuildStep {
  label: string;
  command: string;
  status: "pass" | "warn" | "fail" | "pending";
  durationMs: number;
  detail: string;
}

export interface VaultPluginBuildTestPlan {
  status: "pass" | "warn" | "fail";
  steps: VaultPluginBuildStep[];
}

export interface VaultPluginRollbackPlan {
  available: boolean;
  summary: string;
  commands: string[];
  steps: Array<{
    label: string;
    detail: string;
    destructive: boolean;
  }>;
}

export interface VaultPluginSecurityFinding {
  severity: "low" | "medium" | "high";
  title: string;
  detail: string;
  remediation: string;
}

export interface VaultPluginSecurityReview {
  score: number;
  posture: "ready" | "needs-review" | "blocked";
  findings: VaultPluginSecurityFinding[];
}

export interface VaultPluginGenerateResult {
  id: string;
  template: VaultPluginTemplate;
  pluginName: string;
  mountPath: string;
  version: string;
  command: string;
  description: string;
  generatedAt: string;
  scaffoldSha256: string;
  files: VaultPluginGeneratedFile[];
  commands: string[];
  applyPlan: string[];
  warnings: string[];
  requirements: VaultPluginRequirements;
  blueprint: VaultPluginBlueprint;
  dryRun: VaultPluginDryRunPlan;
  buildTest: VaultPluginBuildTestPlan;
  rollbackPlan: VaultPluginRollbackPlan;
  securityReview: VaultPluginSecurityReview;
  buildArtifact?: VaultPluginBuildArtifact;
}

export interface VaultPluginBuildArtifact {
  bucket: string;
  key: string;
  sha256: string;
  architecture: "arm64";
  command: string;
  builtAt: string;
}

export interface VaultPluginBuildAttempt {
  attempt: number;
  status: "pass" | "fail";
  summary: string;
  diagnostics: string;
  durationMs: number;
  repairedFiles: string[];
  provider?: "ollama" | "rules";
  model?: string;
}

export interface VaultPluginAutoRepairResult {
  id: string;
  status: "running" | "pass" | "failed";
  maxAttempts: number;
  attempts: VaultPluginBuildAttempt[];
  files: VaultPluginGeneratedFile[];
  scaffoldSha256: string;
  buildTest: VaultPluginBuildTestPlan;
  securityReview: VaultPluginSecurityReview;
  artifact?: VaultPluginBuildArtifact;
  startedAt: string;
  completedAt?: string;
  summary: string;
}

export interface VaultPluginApplyRequest {
  pluginType: VaultPluginType;
  pluginName: string;
  mountPath: string;
  version: string;
  command: string;
  artifactSha256: string;
  description?: string;
  artifactBucket?: string;
  artifactKey?: string;
}

export interface VaultPluginApplyResult {
  mode: "mock" | "real";
  applied: boolean;
  pluginName: string;
  mountPath: string;
  pluginType: VaultPluginType;
  version: string;
  steps: Array<{
    label: string;
    status: "planned" | "skipped" | "success";
    detail: string;
  }>;
  detail: Record<string, unknown>;
}

export interface VaultPluginRollbackRequest {
  jobId: string;
  pluginType: VaultPluginType;
  pluginName: string;
  mountPath: string;
  removeCatalog: boolean;
}

export interface VaultPluginRollbackResult {
  mode: "mock" | "real";
  rolledBack: boolean;
  pluginName: string;
  mountPath: string;
  steps: Array<{
    label: string;
    status: "skipped" | "success";
    detail: string;
  }>;
}

export type VaultPluginFactoryJobStatus =
  | "draft"
  | "running"
  | "waiting-approval"
  | "approved"
  | "rejected"
  | "scheduled"
  | "complete"
  | "failed"
  | "rolled-back";

export type VaultPluginFactoryJobStage =
  | "design"
  | "generate"
  | "test"
  | "security-review"
  | "approval"
  | "deploy"
  | "complete";

export interface VaultPluginFactoryJobEvent {
  id: string;
  label: string;
  detail: string;
  status: "pending" | "running" | "success" | "warning" | "failed";
  createdAt: string;
}

export interface VaultPluginFactoryApproval {
  status: "not-requested" | "requested" | "approved" | "rejected";
  artifactFingerprint?: string;
  requestedAt?: string;
  requestedBy?: string;
  decidedAt?: string;
  decidedBy?: string;
  note?: string;
}

export interface VaultPluginFactoryDeployment {
  mode: "full" | "canary";
  scheduledFor?: string;
  environment: "dev" | "staging" | "prod";
  rollbackReady: boolean;
}

export interface VaultPluginFactoryJob {
  id: string;
  ownerId: string;
  ownerEmail: string;
  templateId?: string;
  pluginName: string;
  status: VaultPluginFactoryJobStatus;
  stage: VaultPluginFactoryJobStage;
  progress: number;
  snapshot: Record<string, unknown>;
  events: VaultPluginFactoryJobEvent[];
  approval: VaultPluginFactoryApproval;
  deployment: VaultPluginFactoryDeployment;
  createdAt: string;
  updatedAt: string;
}

export interface CreateVaultPluginFactoryJobInput {
  owner: PortalUser;
  templateId?: string;
  pluginName: string;
  status?: VaultPluginFactoryJobStatus;
  stage?: VaultPluginFactoryJobStage;
  progress?: number;
  snapshot?: Record<string, unknown>;
  events?: VaultPluginFactoryJobEvent[];
  deployment?: Partial<VaultPluginFactoryDeployment>;
}

export type UpdateVaultPluginFactoryJobInput = Partial<
  Pick<
    VaultPluginFactoryJob,
    "templateId" | "pluginName" | "status" | "stage" | "progress" | "snapshot" | "events" | "approval" | "deployment"
  >
>;
