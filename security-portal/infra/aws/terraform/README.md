# AWS Terraform - Portal Test Environment

This Terraform stack is intentionally separate from the existing HashiCorp lab under `envs/dev`.

Default deployment path:

- dedicated VPC
- public/private subnets
- optional NAT gateway
- ALB
- ECS Fargate frontend and backend services
- RDS PostgreSQL
- CloudWatch log groups
- optional ECR repositories
- encrypted CodeBuild source bucket
- native ARM64 CodeBuild deployment project

Phase 1 runs with `vault_mode = "mock"`. The backend can later connect to an existing Vault endpoint by setting `vault_mode = "real"` and `vault_addr`.

## Deployment Sequence

Apply the infrastructure first:

```bash
terraform init
terraform apply
```

Then run the application release from the project root:

```bash
pnpm deploy:aws
```

The local command only packages and uploads filtered source code. AWS CodeBuild performs tests, ARM64 Docker builds, ECR pushes, ECS rolling updates, stability waits, and HTTP health checks. Local Docker is not required.

Terraform intentionally ignores the ECS service `task_definition` field after bootstrap because CodeBuild owns application revision deployment. Task definition settings remain defined in Terraform, and CodeBuild clones the latest active family revision before replacing the image and build marker.

## Existing Network Mode

Use existing AWS networking without touching the current HashiCorp lab modules:

```hcl
create_new_network = false
vpc_id             = "vpc-..."
public_subnet_ids  = ["subnet-...", "subnet-..."]
private_subnet_ids = ["subnet-...", "subnet-..."]
```

## Security Notes

- Do not put real Vault root tokens in Terraform variables.
- `DATABASE_URL` is stored in AWS Secrets Manager for the backend runtime.
- Issued Vault credentials must not be stored in AWS Secrets Manager or SSM Parameter Store.
- Terraform state can contain generated database passwords and must be encrypted and access-controlled.
- Vault audit logs remain separate from portal workflow audit logs.
