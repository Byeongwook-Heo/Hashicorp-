# Cost drivers

The main running costs are:

- one `t3.medium` Vault EC2 instance and 30 GiB gp3 root volume
- one `db.t4g.micro` RDS PostgreSQL instance and 20 GiB gp3 storage
- one public ALB
- one Fargate task at 0.5 vCPU / 1 GiB after bootstrap deployment
- NAT data processing and internet egress
- CodeBuild minutes, CloudWatch logs, KMS requests, Secrets Manager secrets, and Route 53 queries

CodeBuild is on-demand. ECR keeps only the 20 newest images and the artifact bucket expires build objects after 30 days. Stop or tear down the project after the event only with explicit approval and the runbook safeguards.
