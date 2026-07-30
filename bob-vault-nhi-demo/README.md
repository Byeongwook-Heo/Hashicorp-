# Bob requests. Verify authenticates. Vault authorizes.

`bob-vault-nhi-demo` is an AWS-hosted Non-Human Identity lab for local IBM Bob. Bob invokes a narrowly defined MCP tool, an ECS runtime proves the `bob-db-reader` identity to IBM Verify with an AWS KMS-signed private key JWT, Vault authorizes a short-lived PostgreSQL credential, and Amazon RDS returns only a synthetic order-status result.

> Bob이 요청하고, Verify가 Non-Human Identity를 인증하며, Vault가 필요한 순간에만 DB 접근 권한을 제공합니다.

## Security model

- Local Bob holds only the MCP endpoint configuration and a separate transport token.
- The ECS task uses its IAM role to call KMS. The private signing key never leaves KMS.
- Verify access tokens, Vault tokens, and dynamic database credentials exist only in process memory.
- SQL is fixed and parameterized. No generic SQL or secret-reading MCP tool exists.
- RDS and Vault have no public address. Vault administration uses Systems Manager.
- All deployment builds run in AWS CodeBuild and images are stored in ECR; Docker Desktop is not used.

## Delivery workflow

```text
Local source → S3 source artifact → CodeBuild → ECR → ECS Fargate
                                 └→ Terraform → AWS infrastructure

Local Bob → HTTPS ALB → MCP Runtime → IBM Verify → Vault → RDS PostgreSQL
```

Deployed bootstrap endpoint:

```text
https://bob-vault-demo.byeongwook-heo.sbx.hashidemos.io
```

The AWS build plane, base infrastructure, Vault initialization, synthetic database, immutable ECR image, and bootstrap ECS endpoint are deployed. IBM Verify tenant values are the remaining external input before the full identity path can be enabled.

Start or verify with:

```bash
make aws-preflight
make bootstrap-aws
make upload-source
make ci
make tf-plan
make smoke
```

See [the operations runbook](docs/OPERATIONS_RUNBOOK.md), [IBM Verify setup](docs/IBM_VERIFY_SETUP.md), [Bob setup](docs/BOB_SETUP.md), and [threat model](docs/THREAT_MODEL.md).
