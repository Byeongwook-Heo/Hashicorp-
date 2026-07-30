# Operations runbook

## Current deployment

- AWS account: `063455554839`
- Region: `ap-northeast-2`
- URL: `https://bob-vault-demo.byeongwook-heo.sbx.hashidemos.io`
- Mode: `bootstrap` until IBM Verify values are supplied
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

After IBM Verify setup:

```bash
make configure-verify
make verify-preflight
make vault-bootstrap
make deploy-app
make smoke
make demo-status
```

## Daily checks

```bash
make aws-preflight
make demo-status
make smoke
```

Confirm ECS has one healthy task, the target group is healthy, Vault is initialized and unsealed, and RDS is available. The dashboard contains sanitized in-memory decisions for 30 minutes, maximum 100 events.

## Source CIDR change

If the laptop or VPN public egress changes:

```bash
./scripts/configure-source-cidr.sh
make upload-source
make tf-apply-base
```

Set `BOB_SOURCE_CIDRS` to a comma-separated allowlist when the event uses known VPN ranges.

## Secret rotation

- Transport token: create a new Secrets Manager version, force a new ECS deployment, update Bob, then retire the old version.
- Verify signing key: create/register a second KMS public JWK before changing the task key.
- Dynamic DB users: revoked after each call; maximum TTL five minutes.
- Vault TLS certificate: 90-day lab certificate generated on the instance; rotate before reuse beyond the event.

## Teardown guard

Destroy is blocked unless `CONFIRM_DESTROY=bob-vault-nhi-demo`. The ALB and RDS also have deletion protection. Disable those protections deliberately before an approved teardown. Never target the existing VPC, subnets, routes, NAT gateways, hosted zone, or shared Terraform state bucket.
