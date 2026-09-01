# Architecture

## Runtime path

```text
User browser
  │ IBM Verify Authorization Code + PKCE
  ▼
Public ALB (TLS 1.2/1.3, approved event CIDRs)
  │
  ▼
Private ECS Fargate chatbot + MCP task
  ├─ encrypted HttpOnly user session
  ├─ bounded Agent selects one of five fixed MCP tools
  ├─ AWS KMS signs the Agent private_key_jwt assertion
  ├─ IBM Verify STS exchanges user JWT → OBO JWT
  ├─ ContextForge private sidecar routes the registered virtual MCP server
  ├─ MCP re-validates the IBM Verify OBO JWT and fixed tool schema
  ├─ Vault validates subject + Agent claim and evaluates policy
  └─ Vault issues a dynamic PostgreSQL login (2-minute default)
       │ TLS + fixed parameterized query
       ▼
Private RDS PostgreSQL view v_bob_order_status
```

The browser, Agent, ContextForge, MCP endpoint, and security trace are served by
one ECS task. ContextForge runs as a separate open-source sidecar and has no ALB
listener. The Agent authenticates its private Gateway channel, sends the OBO JWT
as upstream authorization, and uses MCP Streamable HTTP over the task's loopback
interface. It does not call Vault or the database directly. Vault and RDS have
no public IP.

## Identity separation

- The browser login proves the human user with IBM Verify Authorization Code
  and PKCE.
- The Agent proves its workload to the Verify Token Endpoint with an AWS KMS-backed
  `private_key_jwt`. The private key cannot be exported.
- IBM Verify token exchange preserves the user `sub` and binds the Agent client
  claim in a new OBO JWT.
- ContextForge routes only the registered virtual server and passes the OBO JWT
  to the upstream MCP Server as its `Authorization` identity.
- MCP independently verifies the OBO JWT before calling Vault.
- Vault authenticates the same OBO JWT and maps its signed `access_tier` to
  either the `bob-orders-full` or `bob-orders-limited` database role.
- PostgreSQL enforces the selected tier again through separate group roles and
  fixed views; a limited identity can see only synthetic customer `CUS-1001`.
- The browser never receives the OBO JWT, Vault token, or database password.

## Bounded Agent

The event build uses a deterministic, bounded Agent for reliability. It
discovers the published MCP catalog and can choose only:

- `get_order_status`
- `get_failed_payment_summary`
- `get_recent_orders`
- `get_failed_payment_trend`
- `get_sensitive_payment_data` (expected denial)

There is no shell, file, generic HTTP, generic SQL, or arbitrary Vault-path
tool. A model-backed planner can later implement the same `ChatAgent` interface
without changing the Verify, MCP, Vault, or database trust boundaries.

## Build path

Source is committed locally, archived without secrets, and uploaded to a
versioned S3 bucket. Separate CodeBuild projects perform CI, Terraform, image
builds, and private bootstrap operations. Container layers exist in CodeBuild
only and the finished immutable image exists in ECR only.

## Identity choice: JWT, not SPIFFE

This lab uses JWT because IBM Verify issues both the user and OBO tokens, and
Vault JWT auth validates the public JWKS, issuer, audience, subject, and Agent
claim directly. SPIFFE would require a separate SPIRE control plane and a bridge
to Verify, which is outside this event scenario.

## Isolation

- Existing VPC, subnets, routes, NAT gateways, and hosted zone are data sources.
- ALB: existing public subnets and approved event source CIDRs.
- ECS and Vault: existing NAT-routed application subnets.
- RDS: existing isolated database subnets.
- Vault: single-node Raft for the event lab, not a production HA topology.
- Management: Systems Manager is the break-glass path; the restricted event
  bastion remains available for the approved CGC certificate-only login.
