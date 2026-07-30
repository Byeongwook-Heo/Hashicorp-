# bob-vault-nhi-demo delivery plan

## Objective

Build and deploy a secure demonstration in which local IBM Bob requests a fixed MCP tool, IBM Verify authenticates the `bob-db-reader` non-human identity, Vault authorizes a narrowly scoped dynamic PostgreSQL credential, and only a sanitized business result returns to Bob.

## Non-negotiable boundaries

- Bob and the model context never receive the Verify access token, KMS client assertion, Vault token, database password, RDS master password, recovery key, root token, full dynamic username, or MCP transport token.
- AWS mode signs every private key JWT with an asymmetric AWS KMS key. No private signing key is exported or stored.
- MCP exposes only fixed, parameterized business tools. It does not expose generic SQL, secret, filesystem, or administrative tools.
- Existing VPC, subnet, route, NAT, and DNS resources are referenced read-only.
- Terraform state, plans, task definitions, user data, logs, and source control contain no secret values.
- No local Docker, Terraform, Vault, or Node installation is required for delivery. AWS CodeBuild performs CI, image builds, and Terraform operations.

## Execution phases

1. **Repository and CI**
   - TypeScript workspace, lockfile, tests, secure dashboard, build specifications.
   - CloudFormation bootstrap for S3 artifacts, ECR, CodeBuild, and CodePipeline-ready roles.
2. **Base infrastructure**
   - Existing VPC inputs, dedicated security groups, KMS keys, RDS, Vault EC2, ALB, ECS cluster, CloudWatch.
3. **Bootstrap runtime**
   - Build immutable MCP image in CodeBuild and push by digest to ECR.
   - Deploy health, readiness, JWKS, and demo endpoints before Verify is configured.
4. **Verify configuration**
   - Register KMS-backed public JWKS, enable private key JWT and JTI validation, issue JWT access tokens, inspect real claims.
5. **Vault and database bootstrap**
   - Initialize Vault, store recovery material in KMS-protected Secrets Manager, create namespace, audit, JWT auth, policy, database engine, schema, and dynamic role.
6. **Application and Bob**
   - Deploy full task definition, configure local Bob Streamable HTTP endpoint, execute allow and deny demonstrations.
7. **Verification and publication**
   - CI, Terraform validation, secret scanning, AWS smoke tests, source commit, push, and draft pull request.

## Selected environment

- Region: `ap-northeast-2`
- VPC: `vpc-0faaeb5858901d385`
- Public subnets: `subnet-068dffa0960dbcffd`, `subnet-068a968f3426594db`
- Application subnets: `subnet-026ffcc7ad4b697c6`, `subnet-06c50448784244f83`
- Database subnets: `subnet-07e488fded4534ef2`, `subnet-0cd8afeeca0ace850`
- Vault AMI: `ami-09d68fa4b57f9e888` (`hc-security-base-ubuntu-2204-20260730033928`, x86_64)
- Vault version: `2.0.3+ent`
- Terraform version: `1.15.8`
- Node.js version: `22.23.1`
- MCP SDK: `1.30.0`
- MCP protocol target: `2025-11-25`
