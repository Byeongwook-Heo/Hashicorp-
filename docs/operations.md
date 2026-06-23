# Operations

## HCP Terraform

Recommended workspaces:

```text
hashicorp_lab                 Existing bootstrap EC2 and agent workspace
hashicorp_lab-enterprise-dev  Enterprise-style dev environment
```

For GitHub VCS integration, set the workspace working directory to:

```text
envs/dev
```

## AWS Source IP Restriction

The current AWS credentials are restricted by a session policy. Remote plans from an EC2-hosted agent may fail if the agent public IP is not allowed by that policy.

Current agent public IP:

```text
52.79.210.204/32
```

If remote runs fail with `explicit deny in a session policy`, run from an allowed network or update the AWS credential/session policy source IP allowlist.

## Cost Control

This lab uses large defaults for enterprise testing:

```text
EC2 application instances: t4g.2xlarge
EC2 Vault instances:       3 x t4g.2xlarge
EC2 Keycloak instances:    2 x t4g.2xlarge
EC2 MCP instances:         2 x t4g.2xlarge
RDS instance:              db.t4g.2xlarge
Keycloak RDS instance:     db.t4g.2xlarge
NAT gateways:              one per AZ by default
```

Run `terraform plan` first and review all resources before applying.

If higher capacity is needed, increase these variables in `envs/dev/variables.tf` or pass them as Terraform variables:

```text
app_instance_type
vault_instance_type
keycloak_instance_type
mcp_instance_type
db_instance_class
keycloak_db_instance_class
```

## Vault Enterprise

Vault Enterprise is bootstrapped from the approved arm64 Ubuntu AMI and runs as a 3-node integrated storage Raft cluster.

```text
Vault nodes:             i-0711d6a1adb0e1609, i-01d934cd430ab6576, i-013740958d1b26329
Vault API URLs:          http://10.40.10.202:8200, http://10.40.11.68:8200, http://10.40.10.147:8200
Auto-unseal KMS alias:   alias/hashicorp-lab-dev-vault-unseal
License parameter:       /hashicorp-lab/dev/vault/license
Init output parameter:   /hashicorp-lab/dev/vault/init
```

The original `/Users/heobyeong-ug/Downloads/vault.hclic` license was for Vault but expired on `2026-05-31`, so Vault refused to start. The active SSM license parameter was updated with `/Users/heobyeong-ug/Downloads/vault_exp20260930.hclic`.

The init output parameter contains sensitive recovery material and the initial root token. Only retrieve it when needed, and avoid sharing the terminal output.

## Keycloak

Keycloak is deployed as a 2-node private EC2 Auto Scaling Group behind a public ALB, with a dedicated PostgreSQL Multi-AZ RDS database.

```text
Keycloak URL:       http://hashicorp-lab-dev-keycloak-alb-1501591011.ap-northeast-2.elb.amazonaws.com
Keycloak ASG:       hashicorp-lab-dev-keycloak-asg
Keycloak nodes:     i-0f0d3272dcc541c1d / 10.40.10.114, i-097f55a48266aaf13 / 10.40.11.53
Keycloak database:  hashicorp-lab-dev-keycloak-postgres.cx4i8kgqav98.ap-northeast-2.rds.amazonaws.com:5432
Health path:        /realms/master
```

The bootstrap admin credential is stored in AWS Secrets Manager. Retrieve it only when needed:

```bash
aws secretsmanager get-secret-value \
  --region ap-northeast-2 \
  --secret-id "$(terraform -chdir=/Users/heobyeong-ug/Documents/Byeongwook_HashiCorp/envs/dev output -raw keycloak_admin_secret_arn)" \
  --query SecretString \
  --output text
```

## MCP Server and API Gateway

The MCP server is deployed as a 2-node private EC2 Auto Scaling Group behind an internal ALB. API Gateway HTTP API exposes the MCP endpoint through a VPC Link.

```text
MCP API endpoint:   https://oyvxrcyt3g.execute-api.ap-northeast-2.amazonaws.com
MCP ASG:            hashicorp-lab-dev-mcp-asg
MCP nodes:          i-0e6c50c07e78ed4d9 / 10.40.10.29, i-07452c46ba4f594bd / 10.40.11.40
MCP internal ALB:   internal-hashicorp-lab-dev-mcp-alb-1731134098.ap-northeast-2.elb.amazonaws.com
Health path:        /health
JSON-RPC path:      /mcp
```

Smoke test:

```bash
curl https://oyvxrcyt3g.execute-api.ap-northeast-2.amazonaws.com/health

curl -sS -X POST https://oyvxrcyt3g.execute-api.ap-northeast-2.amazonaws.com/mcp \
  -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'
```

Current MCP server implementation is a starter JSON-RPC service with `initialize`, `ping`, `tools/list`, and `tools/call`. For a production-like enterprise pattern, the next hardening step is to add Keycloak OIDC/JWT authorization at API Gateway and then expose real internal tools behind the MCP server.
