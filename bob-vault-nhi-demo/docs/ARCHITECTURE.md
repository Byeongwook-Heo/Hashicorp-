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
  ├─ bounded Agent discovers and calls one of three MCP tools
  ├─ MCP re-validates the IBM Verify user JWT
  ├─ AWS KMS signs the Agent private_key_jwt assertion
  ├─ IBM Verify STS exchanges user JWT → OBO JWT
  ├─ Vault validates subject + Agent claim and evaluates policy
  └─ Vault issues a dynamic PostgreSQL login (2-minute default)
       │ TLS + fixed parameterized query
       ▼
Private RDS PostgreSQL view v_bob_order_status
```

The browser, Agent, MCP endpoint, and security trace are served by one ECS task.
The Agent still uses the MCP Streamable HTTP protocol over the task's loopback
interface; it does not call the database service directly. Vault and RDS have no
public IP.

## Identity separation

- The browser login proves the human user with IBM Verify Authorization Code
  and PKCE.
- The MCP task proves the Agent workload with an AWS KMS-backed
  `private_key_jwt`. The private key cannot be exported.
- IBM Verify token exchange preserves the user `sub` and binds the Agent client
  claim in a new OBO JWT.
- Vault authenticates the OBO JWT and authorizes only the
  `bob-orders-readonly` database role.
- The browser never receives the OBO JWT, Vault token, or database password.

## Bounded Agent

The event build uses a deterministic, bounded Agent for reliability. It
discovers the published MCP catalog and can choose only:

- `get_order_status`
- `get_failed_payment_summary`
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
