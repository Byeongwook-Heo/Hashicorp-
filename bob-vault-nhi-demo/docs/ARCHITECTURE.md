# Architecture

## Runtime path

```text
IBM Bob on the laptop
  │ HTTPS + bearer token + laptop/VPN source CIDR
  ▼
Public ALB (TLS 1.2/1.3)
  │ port 8080, security-group reference
  ▼
Private ECS Fargate MCP task
  ├─ AWS KMS Sign: RS256 private_key_jwt (private key is not exportable)
  ├─ IBM Verify: client authentication and bound NHI JWT
  ├─ Vault JWT login: issuer, audience, NHI claim, and policy checks
  └─ Dynamic PostgreSQL credential: 2-minute default, 5-minute maximum
       │ TLS + fixed parameterized query
       ▼
Private RDS PostgreSQL view v_bob_order_status
```

Bob is local by design. It does not need private VPC connectivity because it talks to an HTTPS ALB restricted to the configured public `/32` or VPN CIDR. The MCP task, Vault, and RDS have no public IP.

## Build path

Source is committed locally, archived without secrets, and uploaded to a versioned S3 bucket. Separate CodeBuild projects perform CI, Terraform, image builds, and private bootstrap operations. Container layers exist in CodeBuild only and the finished immutable image exists in ECR only.

## Identity choice: JWT, not SPIFFE

This lab uses JWT because IBM Verify issues the NHI token and Vault JWT auth can validate its public JWKS, issuer, audience, and bound claim directly. AWS KMS supplies a non-exportable key for `private_key_jwt`. SPIFFE would require a SPIRE server, workload attestation, trust-domain operations, and an additional Verify integration without improving this event's Verify-to-Vault demonstration. SPIFFE remains a reasonable future option for a larger internal workload mesh.

## Isolation

- Existing VPC, subnets, routes, NAT gateways, and hosted zone are data sources only.
- ALB: existing public subnets.
- Event bastion: one approved `hc-security-base-*` EC2 instance in the public subnet; SSH is limited to approved `/32` sources and can forward only to the Vault host.
- ECS and Vault: existing NAT-routed application subnets.
- RDS: existing isolated database subnets.
- Management: AWS Systems Manager remains the owner break-glass path. CGC has a dedicated, expiring `.pem` key through the restricted event bastion.
- Vault: single-node Raft for the event lab. This is not an HA production topology.
