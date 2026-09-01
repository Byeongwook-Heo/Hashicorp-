# Blockers and external inputs

## Current event state

There is no known implementation blocker for the deployed event scenario. The
user OIDC application, Agent STS client, OBO exchange, signed access-tier
claims, Vault policies, and PostgreSQL full/limited views have been configured
and validated.

## Inputs required for a rebuild

- valid short-lived AWS STS credentials for account `063455554839`
- the approved Vault Enterprise license file, kept outside Git
- the existing VPC, six subnets, Route 53 hosted zone, Terraform state bucket,
  and approved hardened AMI listed in `scripts/aws-preflight.sh`
- IBM Verify tenant administration access for the public OIDC application,
  Agent STS client, scopes, entitlements, and `access_tier` claim mapping
- an approved public source CIDR for the event laptop or VPN
- the private planning runtime token when natural-language planning is enabled

## Time-bound constraints

- Vault license expiry: `2026-09-02T00:00:00Z`
- event IAM/SSM access expiry: `2026-09-02T00:00:00Z`
- event SSH authorized-key expiry: `20260902000000` UTC

Do not extend these values without approval. If the environment is reused,
renew the license, re-approve operator access, rotate the event key material,
and run a fresh Terraform plan.

## Operational caveats

- A changed laptop/VPN public IP requires an approved source-CIDR update.
- Manage source CIDRs through `make source-cidr-add`; duplicate manual
  security-group rules can cause a later Terraform apply to fail.
- ContextForge is private and intentionally has no public Admin UI.
- Full chatbot MCP calls require a Verify OBO JWT. The static transport token is
  discovery-only in this mode.
- The event Vault topology is single-node Raft and is not production HA.

See [the installation guide](docs/INSTALLATION.md) and
[operations runbook](docs/OPERATIONS_RUNBOOK.md) for the supported procedures.
