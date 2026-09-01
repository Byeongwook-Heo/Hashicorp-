# Implementation status

Status: event lab deployed with IBM Verify OIDC/OBO and enforced access tiers

Last reviewed: 2026-09-01

## Implemented and deployed

- AWS-only S3, CodeBuild, ECR, Terraform, and ECS Fargate delivery plane
- IBM Verify browser login with Authorization Code and PKCE
- KMS-backed Agent `private_key_jwt` and RFC 8693 OBO Token Exchange
- IBM ContextForge `v1.0.6` as a private ECS sidecar
- TypeScript MCP Server with five fixed tools and no generic SQL, shell, file,
  HTTP, or Vault-path tool
- Vault Enterprise `2.0.3+ent` on single-node Raft with KMS auto-unseal
- Vault JWT roles and policies for `orders-full` and `orders-limited`
- RDS PostgreSQL `16.14` with separate group roles, fixed views, TLS, and
  short-lived Vault-issued credentials
- Full, limited, and unapproved user paths with fail-closed `access_tier`
  enforcement
- Private natural-language planning service with a deterministic safe fallback
- Integrated chatbot/control center, step details, access decisions, and
  presentation-safe operator reports

## Validation

- AWS preflight: passed for account `063455554839` in `ap-northeast-2`
- Local source verification: TypeScript build and ESLint passed
- Bootstrap tests: 8 passed
- MCP application tests: 80 passed across 12 files
- Statement coverage: 80.28%
- Public health, Verify login redirect, unauthenticated denial, Vault/RDS tier
  isolation, and sanitized access-report paths: passed in the deployed lab
- Current public endpoint:
  `https://bob-vault-demo.byeongwook-heo.sbx.hashidemos.io`

## Intentional constraints

- ContextForge's native Admin UI is disabled and is not exposed by the ALB.
- Vault and RDS have no public address.
- Vault is single-node for the event lab and is not a production HA topology.
- The planning instance is started only for preparation and live-demo windows.
- Event SSM/SSH access and the Vault Enterprise license have explicit event
  expiry dates and must be re-approved before later reuse.
- Direct Bob IDE access with the static transport token is bootstrap/discovery
  only in chatbot mode. Protected tool calls require a Verify-issued OBO JWT.

See [the installation guide](docs/INSTALLATION.md) for the complete environment,
deployment, validation, and access procedure.
