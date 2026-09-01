# AWS lab environment and installation guide

This guide recreates the event lab in the AWS account for which this repository
is configured. It is an event/demo runbook, not a production HA Vault design.
All builds, Terraform operations, and container image creation run in AWS. A
local Docker Desktop, Terraform binary, Vault binary, or PostgreSQL client is
not required for the standard deployment path.

## What is deployed

```text
Browser
  -> IBM Verify user login (Authorization Code + PKCE)
  -> public HTTPS ALB
  -> private ECS Fargate task
       - Bob chatbot and bounded Agent
       - IBM Verify RFC 8693 OBO token exchange
       - ContextForge private sidecar
       - MCP Server
  -> private Vault Enterprise on EC2
       - JWT authentication and policy evaluation
       - short-lived PostgreSQL credentials
  -> private Amazon RDS for PostgreSQL
```

The Agent signs its Verify client assertion with AWS KMS. The browser never
receives the OBO JWT, Vault token, or database password. ContextForge is an
internal sidecar: its native Admin UI is disabled and port `4444` is not routed
through the public ALB.

## Current event environment

| Item                | Current value                                                           |
| ------------------- | ----------------------------------------------------------------------- |
| Project prefix      | `bob-vault-nhi-demo`                                                    |
| AWS account         | `063455554839`                                                          |
| AWS region          | `ap-northeast-2`                                                        |
| Public URL          | `https://bob-vault-demo.byeongwook-heo.sbx.hashidemos.io`               |
| Existing VPC        | `vpc-0faaeb5858901d385`                                                 |
| Public subnets      | `subnet-068dffa0960dbcffd`, `subnet-068a968f3426594db`                  |
| Private app subnets | `subnet-026ffcc7ad4b697c6`, `subnet-06c50448784244f83`                  |
| Isolated DB subnets | `subnet-07e488fded4534ef2`, `subnet-0cd8afeeca0ace850`                  |
| Hosted zone         | `byeongwook-heo.sbx.hashidemos.io` (`Z07579811BJW2L1U58CO1`)            |
| Vault               | Enterprise `2.0.3+ent`, single-node Raft, AWS KMS auto-unseal           |
| Vault AMI           | `ami-09d68fa4b57f9e888` (`hc-security-base-ubuntu-2204-20260730033928`) |
| Database            | RDS PostgreSQL `16.14`, private, encrypted                              |
| ContextForge        | `ghcr.io/ibm/mcp-context-forge:v1.0.6`, private sidecar                 |
| Access-tier mode    | `enforce` (`orders-full`, `orders-limited`, or unapproved)              |

The IDs above are intentionally environment-specific and are not secrets. A
deployment to another AWS account must replace them as described in
[Adapting this repository](#adapting-this-repository).

## Local prerequisites

Install only the control tools:

- Git
- Bash 4 or later and GNU Make
- AWS CLI v2
- `jq`, `curl`, `zip`, and `unzip`
- AWS Session Manager plugin only when using the optional Vault port forward
- IBM Verify tenant administration access
- an approved Vault Enterprise license file

The AWS identity must be allowed to operate the CloudFormation, CodeBuild, ECR,
ECS, EC2, KMS, RDS, Route 53, ACM, S3, SSM Parameter Store, Secrets Manager,
CloudWatch, and IAM resources used by the lab.

## 1. Clone the deployment branch

```bash
git clone --branch codex/bob-vault-nhi-demo \
  https://github.com/Byeongwook-Heo/Hashicorp-.git

cd Hashicorp-/bob-vault-nhi-demo
```

Run `make help` to list the supported operations. The Make targets invoke AWS
CodeBuild; `make install` deliberately does not install local packages.

## 2. Supply short-lived AWS credentials

The preferred method is to export a temporary STS credential in the current
shell:

```bash
unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN
unset AWS_SECURITY_TOKEN AWS_PROFILE AWS_DEFAULT_PROFILE

export AWS_ACCESS_KEY_ID='<temporary-access-key-id>'
export AWS_SECRET_ACCESS_KEY='<temporary-secret-access-key>'
export AWS_SESSION_TOKEN='<temporary-session-token>'
export AWS_REGION='ap-northeast-2'

aws sts get-caller-identity
```

For the existing macOS operator workflow, the repository can parse a local RTF
file without copying it into the repository. Use a Bash shell to avoid Zsh
prompt plug-ins inheriting Bash's `nounset` option:

```bash
bash
export AWS_CREDENTIALS_FILE='/secure/local/path/AWS credentials.rtf'
source scripts/aws-credentials.sh
load_demo_aws_credentials
aws sts get-caller-identity
```

The returned account must be `063455554839`. If AWS reports `ExpiredToken`,
replace the local STS credential and reload it before retrying.

Never commit AWS credentials, IBM Verify client secrets, Vault tokens, recovery
material, private keys, `.pem` files, Terraform state, or the Vault license.

## 3. Provide the Vault license and run preflight

Keep the license outside the repository:

```bash
export VAULT_LICENSE_FILE='/secure/local/path/vault-enterprise.hclic'
make aws-preflight
```

Preflight fails closed unless the expected account, VPC, six subnets, hardened
AMI, Route 53 zone, Terraform state bucket, and readable license are present.

For an existing deployed environment, add a changed laptop or VPN address as an
explicit approved `/32`:

```bash
SOURCE_CIDR='203.0.113.10/32' make source-cidr-add
```

For the very first bootstrap, the CodeBuild project used by
`source-cidr-add` does not exist yet. Provide the allowlist before
`bootstrap-aws` instead:

```bash
export BOB_SOURCE_CIDRS='203.0.113.10/32'
```

Use only an approved address. Do not open the ALB, Vault, bastion, or RDS to
`0.0.0.0/0`, and do not create duplicate security-group rules manually.

## 4. Provision the AWS build plane and base resources

Run in this order for a new environment:

```bash
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

What these steps do:

1. `bootstrap-aws` creates the encrypted artifact bucket, CodeBuild projects,
   ECR repository, build IAM roles, scoped secrets, and approved source CIDR.
2. `upload-source` creates a source-only archive and uploads it to versioned S3.
3. `ci` runs format, lint, type, unit, integration, and dependency checks in
   CodeBuild.
4. `tf-plan` previews the infrastructure change.
5. `build-image` builds in CodeBuild and publishes an immutable ECR digest.
6. `tf-apply-base` creates the ALB, private ECS/Vault/RDS foundations, KMS, DNS,
   TLS, logging, and security groups without enabling the final chatbot path.
7. `vault-init` initializes Vault and stores protected recovery material in
   KMS-protected Secrets Manager.
8. `db-bootstrap` creates synthetic data, fixed views, and least-privilege DB
   group roles.
9. `deploy-mcp-bootstrap` exposes health and public JWKS endpoints needed for
   IBM Verify setup.

Each CodeBuild target waits for completion. A long `IN_PROGRESS` period is
normal during image builds, Terraform changes, and package installation.

## 5. Configure IBM Verify

Create two distinct registrations:

- a public OIDC application for user login with Authorization Code, PKCE S256,
  JWT access tokens, and scopes `openid profile vault.db.read`
- a separate STS client for RFC 8693 Token Exchange using KMS-backed
  `private_key_jwt`

Follow [IBM Verify chatbot and OBO setup](CHATBOT_VERIFY_SETUP.md) for the exact
redirect URI, issuer, JWKS URI, audience, and metadata variables. Follow
[Verify access-tier rollout](ACCESS_TIER_SETUP.md) to emit and preserve the
signed `access_tier` claim.

Store only public metadata in Parameter Store and generate runtime secrets
directly in Secrets Manager:

```bash
make configure-chatbot-verify
make bootstrap-chat-session-secret
make bootstrap-contextforge-secret
```

The current `deploy-chatbot` target enables the existing private
natural-language planning service. Before using that target, inject its token
without placing the value in a file or command history:

```bash
read -r -s -p 'Planning runtime token: ' AGENT_RUNTIME_TOKEN
echo
export AGENT_RUNTIME_TOKEN
make bootstrap-agent-runtime-secret
unset AGENT_RUNTIME_TOKEN
```

The planning service receives only the bounded user message. It never receives
Verify tokens, Vault tokens, database credentials, or tool results. A
deterministic safe mode remains available if the planning service is stopped.

## 6. Bind Vault and deploy the chatbot

After Verify metadata and access-tier claims are ready:

```bash
make upload-source
make vault-bootstrap
make ci
make build-image
make agent-runtime-start
make chatbot-plan
make deploy-chatbot
```

`vault-bootstrap` is idempotent. It configures tiered Vault JWT roles and the
database secrets engine while preserving an existing rotating database
connection. `deploy-chatbot` deploys the Verify-authenticated chatbot,
ContextForge sidecar, MCP Server, and enforced access-tier configuration.

## 7. Validate the deployment

```bash
make smoke
make access-tier-smoke
make demo-access-report
make demo-status
```

Expected access behavior:

| User state              | General chat | Protected order data            |
| ----------------------- | ------------ | ------------------------------- |
| `orders-full`           | allowed      | all four synthetic orders       |
| `orders-limited`        | allowed      | only the `CUS-1001` scoped view |
| missing or invalid tier | allowed      | denied before MCP/Vault/RDS     |

For an operator-only sanitized database report:

```bash
./scripts/bob-rds-report.sh
```

That script starts the private CodeBuild report action, gets a short-lived DB
credential from Vault, queries the approved read-only view, revokes the lease,
and prints no password, Vault token, or lease ID.

## 8. Access the running services

### Chatbot and control center

Open:

```text
https://bob-vault-demo.byeongwook-heo.sbx.hashidemos.io
```

The integrated control center is part of the chatbot UI. The legacy `/ops`
path redirects to `/#control-center`.

### Vault UI

Vault is private. Start the approved local SSM port forward:

```bash
make vault-port-forward
```

Keep that terminal open, then browse to:

```text
https://127.0.0.1:8200/ui/
```

Use an approved Vault authentication method and role. The browser may need to
trust the lab CA because the private Vault certificate is not a public web
certificate. Team SSH and SSM procedures are documented in
[EC2 team access](EC2_TEAM_ACCESS.md).

### ContextForge

There is no public ContextForge Admin UI in this environment. The native UI is
disabled, port `4444` is private to the ECS task, and the ALB forwards only to
the application container. Use the chatbot control center and CloudWatch
`contextforge` log stream for the demo. Exposing an admin UI requires a separate
authenticated, network-restricted design and is intentionally outside this
lab.

## 9. Daily operation

Before a demo:

```bash
make aws-preflight
make demo-status
make smoke
```

If the planning service is stopped, start it with `make agent-runtime-start`.
After the event window, stop it to control cost:

```bash
make agent-runtime-stop
```

The event SSH/SSM expiry and Vault license expiry are intentionally fixed for
the event. Update and re-approve those values before reusing the environment
after the stated window.

## Adapting this repository

For a different AWS account or network, review and change all environment-bound
defaults before running any apply:

- `Makefile`: account, region, artifact bucket, VPC, app subnets, state bucket
- `scripts/aws-preflight.sh`: expected account, VPC, all subnets, AMI, zone,
  state bucket, and local license path
- `infra/terraform/variables.tf`: network, DNS, AMI owner/ID, runtime endpoint,
  event operator principals, public SSH keys, and expiry timestamps
- `docs/CHATBOT_VERIFY_SETUP.md`: public hostname and Verify endpoints

Then run `make aws-preflight` and `make tf-plan`. Do not apply this repository's
hard-coded event defaults to an unrelated account.

## Teardown guard

Destroy is blocked unless the exact confirmation is supplied, and ALB/RDS
deletion protection must be changed deliberately:

```bash
CONFIRM_DESTROY='bob-vault-nhi-demo' make destroy
```

Never target the shared VPC, subnets, routes, NAT gateways, hosted zone, or
Terraform state bucket for deletion. See the [operations runbook](OPERATIONS_RUNBOOK.md)
and [threat model](THREAT_MODEL.md) before changing security boundaries.
