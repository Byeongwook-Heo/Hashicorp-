# Operations runbook

## Current deployment

- AWS account: `063455554839`
- Region: `ap-northeast-2`
- URL: `https://bob-vault-demo.byeongwook-heo.sbx.hashidemos.io`
- Mode: chatbot after the Verify OIDC application and STS client are supplied
- Vault: Enterprise 2.0.3+ent, Raft, KMS auto-unseal
- RDS: PostgreSQL 16.14, private and encrypted
- Container: immutable ECR digest

## Ordered deployment

```bash
make aws-preflight
make bootstrap-aws
make upload-source
make ci
make tf-plan
make build-image
make tf-apply-base
make vault-init
make db-bootstrap
make deploy-mcp-bootstrap
```

After IBM Verify chatbot setup:

```bash
make configure-chatbot-verify
make bootstrap-chat-session-secret
# Inject AGENT_RUNTIME_TOKEN from an approved secret source without printing it.
make bootstrap-agent-runtime-secret
make vault-bootstrap
make agent-runtime-start
make chatbot-plan
make deploy-chatbot
make smoke
make access-tier-smoke
make demo-status
```

## Daily checks

```bash
make aws-preflight
make demo-status
make smoke
```

Confirm ECS has one healthy task, the target group is healthy, Verify login
redirects correctly, Vault is initialized and unsealed, and RDS is available.
The integrated control panel contains sanitized in-memory decisions for 30
minutes, maximum 100 events. It must show either **AI 계획 준비됨** or **안전
모드 준비됨** before the demo begins.

After the live-demo window, stop the GPU runtime to avoid idle cost:

```bash
make agent-runtime-stop
```

## Source CIDR change

If the laptop or VPN public egress changes, add the exact approved `/32` without
replacing the existing allowlist:

```bash
SOURCE_CIDR='203.0.113.10/32' make source-cidr-add
```

Do not add the same rule manually in the EC2 console; duplicate unmanaged rules
can cause a later Terraform apply to fail. For a new bootstrap, set
`BOB_SOURCE_CIDRS` to a comma-separated allowlist before `make bootstrap-aws`.

## ContextForge operations

ContextForge runs on loopback port `4444` in the ECS task. Its native UI is
disabled and no ALB listener exposes it. Use the integrated control center and
the CloudWatch `contextforge` log stream for health and routing evidence. The
static transport token is discovery-only in chatbot mode; protected tool calls
must carry a Verify OBO JWT.

## Secret rotation

- Chat session key: create a new Secrets Manager version and force a new ECS
  deployment. Existing sessions become invalid.
- Agent runtime token: copy the approved source secret into the project-scoped
  secret without printing it, then force a new ECS deployment.
- Legacy transport token: retained only for bootstrap compatibility and not
  accepted by the chatbot MCP mode.
- Verify signing key: create/register a second KMS public JWK before changing the task key.
- Dynamic DB users: revoked after each call; maximum TTL five minutes.
- Vault TLS certificate: 90-day lab certificate generated on the instance; rotate before reuse beyond the event.

## Teardown guard

Destroy is blocked unless `CONFIRM_DESTROY=bob-vault-nhi-demo`. The ALB and RDS also have deletion protection. Disable those protections deliberately before an approved teardown. Never target the existing VPC, subnets, routes, NAT gateways, hosted zone, or shared Terraform state bucket.
