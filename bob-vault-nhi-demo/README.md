# Verify authenticates. The Agent uses MCP. Vault authorizes.

`bob-vault-nhi-demo` is an AWS-hosted Agentic Identity lab. A sample chatbot
authenticates the human user with IBM Verify, a private planning service maps
natural language to a fixed MCP tool, the Agent exchanges the user token at
the IBM Verify Token Endpoint for an Agent-bound OBO JWT, ContextForge routes
the request to the private MCP Server, and Vault authorizes a short-lived
PostgreSQL credential. Deterministic routing remains available if the planning
service is not ready.

> 사용자는 Verify로 로그인하고, Agent는 MCP를 사용하며, Vault는 필요한
> 순간에만 DB 접근 권한을 제공합니다.

## Security model

- The browser uses Authorization Code + PKCE and an encrypted HttpOnly session.
- The ECS task uses its IAM role to call KMS. The Agent private key never leaves KMS.
- Verify OBO preserves the user subject while binding the Agent workload.
- IBM ContextForge is a private ECS sidecar that exposes only the registered
  MCP virtual server; it is not attached to the public ALB.
- Verify access tokens, Vault tokens, and dynamic database credentials exist only in process memory.
- The planning boundary receives only the user message (maximum 500 characters); it never receives tokens, credentials, or tool results.
- SQL is fixed and parameterized. No generic SQL or secret-reading MCP tool exists.
- RDS and Vault have no public address. Vault administration uses Systems Manager.
- All deployment builds run in AWS CodeBuild and images are stored in ECR; Docker Desktop is not used.

## Delivery workflow

```text
Local source → S3 source artifact → CodeBuild → ECR → ECS Fargate
                                 └→ Terraform → AWS infrastructure

User → Verify login → Chat Agent → Verify OBO → ContextForge → MCP → Vault → RDS PostgreSQL
                         └→ Private intent planning (message only)
```

Deployed bootstrap endpoint:

```text
https://bob-vault-demo.byeongwook-heo.sbx.hashidemos.io
```

The chatbot and MCP runtime share one private ECS task. IBM Verify user OIDC and
STS client IDs are external tenant inputs before the OBO path can be deployed.
The planning runtime remains on a private peered network and is started only for
event preparation and live-demo windows.

Start or verify with:

```bash
make aws-preflight
make bootstrap-aws
make bootstrap-contextforge-secret
make upload-source
make ci
make tf-plan
make smoke
```

See [chatbot Verify/OBO setup](docs/CHATBOT_VERIFY_SETUP.md),
[architecture](docs/ARCHITECTURE.md), [the editable draw.io
architecture](docs/bob-vault-nhi-demo-architecture.drawio), [event team EC2
access](docs/EC2_TEAM_ACCESS.md), [the operations
runbook](docs/OPERATIONS_RUNBOOK.md), and [threat
model](docs/THREAT_MODEL.md).
