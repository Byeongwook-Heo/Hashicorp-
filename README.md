# HashiCorp Enterprise AWS Lab

Terraform code for a HashiCorp enterprise-style AWS lab environment.

## Current Status

The existing bootstrap EC2 instance has already been resized to `t4g.2xlarge`.

```text
Instance ID: i-070379b67ec9730c1
Public IP:   52.79.210.204
Private IP:  172.31.15.102
SSH:         ssh -i ~/Downloads/Byeongwook.pem ubuntu@52.79.210.204
```

The active HCP Terraform agent runs on this instance and is registered in the `aws-agent-pool` pool.

## Repository Layout

```text
envs/dev/                 Dev environment root module
modules/network/          VPC, subnets, routing, NAT gateways
modules/security/         Security groups for ALB, application, and RDS
modules/alb/              Application Load Balancer and target group
modules/compute/          Launch template and Auto Scaling Group
modules/data/             RDS PostgreSQL subnet group and instance
modules/iam/              EC2 instance profile for SSM and CloudWatch
modules/vault-enterprise/ Vault Enterprise Raft cluster
modules/keycloak/         Keycloak HA nodes, ALB, PostgreSQL, admin secret
modules/mcp-server/       Private MCP server, internal ALB, API Gateway VPC Link
docs/                     Operating notes
aws-ec2-*/                Earlier bootstrap and one-instance lab code
```

## Target Architecture

```text
Internet
  -> Public ALBs
  -> App Auto Scaling Group, EC2 t4g.2xlarge
  -> Keycloak Auto Scaling Group, EC2 t4g.2xlarge
  -> API Gateway HTTP API
  -> VPC Link
  -> Internal MCP ALB
  -> MCP Auto Scaling Group, EC2 t4g.2xlarge
  -> Vault Enterprise Raft cluster, 3 x EC2 t4g.2xlarge
  -> PostgreSQL RDS Multi-AZ databases, db.t4g.2xlarge
```

The default design uses two Availability Zones, public subnets for public ALBs and NAT gateways, private application subnets for EC2 workloads, and isolated private database subnets for RDS.

## Workflows

Use `envs/dev` as the Terraform working directory.

```bash
cd envs/dev
terraform init
terraform fmt -recursive
terraform validate
terraform plan
```

The code is prepared for HCP Terraform organization `hashicorp_lab` and workspace `hashicorp_lab-enterprise-dev`.

## Secrets

Do not commit AWS credentials, `.tfvars`, Terraform state, private keys, or license files. Those are excluded by `.gitignore`.
