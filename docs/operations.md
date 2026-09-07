> 주소와 리소스 ID는 예시입니다. 실제 값은 배포 환경에 맞게 지정하세요.

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

When AWS credentials use a source-IP session policy, remote plans can fail if the runner public IP is not allowed.

Example runner source CIDR:

```text
192.0.2.204/32
```

If remote runs fail with `explicit deny in a session policy`, run from an allowed network or update the AWS credential/session policy source IP allowlist.

## Cost Control

This lab uses large defaults for enterprise testing:

```text
EC2 application instances: t4g.2xlarge
EC2 Vault instances:       3 x t4g.2xlarge
EC2 Keycloak instances:    2 x t4g.2xlarge
EC2 MCP instances:         2 x t4g.2xlarge
EC2 benchmark runner:      1 x c7g.2xlarge
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
vault_benchmark_runner_instance_type
db_instance_class
keycloak_db_instance_class
```

## Vault Enterprise

Vault Enterprise is bootstrapped from the approved arm64 Ubuntu AMI and runs as a 3-node integrated storage Raft cluster.

```text
Vault nodes:             i-00000000000000000, i-00000000000000000, i-00000000000000000
Vault API URLs:          http://192.0.2.202:8200, http://192.0.2.68:8200, http://192.0.2.147:8200
Auto-unseal KMS alias:   alias/hashicorp-lab-dev-vault-unseal
License parameter:       /hashicorp-lab/dev/vault/license
Init output parameter:   /hashicorp-lab/dev/vault/init
```

A valid Vault Enterprise license must be available in the configured SSM parameter before startup. Check its entitlement and expiry date before deployment.

The init output parameter contains sensitive recovery material and the initial root token. Only retrieve it when needed, and avoid sharing the terminal output.

## Keycloak

Keycloak is deployed as a 2-node private EC2 Auto Scaling Group behind a public ALB, with a dedicated PostgreSQL Multi-AZ RDS database.

```text
Keycloak URL:       http://service.example.invalid
Keycloak ASG:       hashicorp-lab-dev-keycloak-asg
Keycloak nodes:     i-00000000000000000 / 192.0.2.114, i-00000000000000000 / 192.0.2.53
Keycloak database:  hashicorp-lab-dev-keycloak-postgres.service.example.invalid:5432
Health path:        /realms/master
```

The bootstrap admin credential is stored in AWS Secrets Manager. Retrieve it only when needed:

```bash
aws secretsmanager get-secret-value \
  --region ap-northeast-2 \
  --secret-id "$(terraform -chdir=./envs/dev output -raw keycloak_admin_secret_arn)" \
  --query SecretString \
  --output text
```

## MCP Server and API Gateway

The MCP server is deployed as a 2-node private EC2 Auto Scaling Group behind an internal ALB. API Gateway HTTP API exposes the MCP endpoint through a VPC Link.

```text
MCP API endpoint:   https://oyvxrcyt3g.service.example.invalid
MCP ASG:            hashicorp-lab-dev-mcp-asg
MCP nodes:          i-00000000000000000 / 192.0.2.29, i-00000000000000000 / 192.0.2.40
MCP internal ALB:   service.example.invalid
Health path:        /health
JSON-RPC path:      /mcp
```

Smoke test:

```bash
curl https://oyvxrcyt3g.service.example.invalid/health

curl -sS -X POST https://oyvxrcyt3g.service.example.invalid/mcp \
  -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'
```

Current MCP server implementation is a starter JSON-RPC service with `initialize`, `ping`, `tools/list`, and `tools/call`. For a production-like enterprise pattern, the next hardening step is to add Keycloak OIDC/JWT authorization at API Gateway and then expose real internal tools behind the MCP server.

## Vault Benchmark Runner

The benchmark runner is deployed in a private application subnet and reaches Vault over the VPC CIDR on port 8200.

```text
Runner instance:     i-00000000000000000
Runner private IP:   192.0.2.98
Instance type:       c7g.2xlarge
Vault target:        http://192.0.2.202:8200
Result directory:    /opt/vault-benchmark/results
```

Run commands through SSM. The runner reads the Vault root token from the SSM SecureString at runtime; do not print or save the token.

```bash
aws ssm start-session \
  --region ap-northeast-2 \
  --target i-00000000000000000
```

Inside the runner:

```bash
vault-benchmark-status
DURATION=10s run-vault-benchmark transit-smoke
prepare-transform-fpe
THREADS=2 CONNECTIONS=2 CARD_COUNT=20 DURATION=10s run-transform-fpe-wrk
```

PDF-style Transform FPE matrix:

```bash
DURATION=60s run-transform-fpe-matrix
```

Run the full matrix only when cost and cluster load are acceptable.
