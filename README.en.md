# HashiCorp Enterprise AWS Lab

[한국어](README.md) · [English](README.en.md)

## Purpose

An infrastructure lab for provisioning AWS networking, applications, Vault Enterprise, identity services, and databases with Terraform, then practicing their operation.

## Benefits

- Understand resource dependencies through code and reviewed execution plans.
- Explore Vault Raft, machine identity, and database integration in one environment.
- Use environment-specific inputs and state for repeatable exercises.

## Features and structure

- `envs/dev/`: integrated Terraform environment
- `modules/`: VPC, ALB, EC2, Vault, Keycloak, MCP, and RDS components
- `aws-ec2-hcp/` and `aws-ec2-hcp-hashicorp_lab/`: HCP Terraform EC2 exercises
- `aws-ec2-tfe/`: Terraform Enterprise EC2 exercise
- `scripts/` and `docs/`: operations, benchmarking, and architecture

## Getting started

Use the Terraform version in `.terraform-version`. Prepare AWS authentication, HCP Terraform or Terraform Enterprise access, suitable AMIs/networking/key pairs, and a Vault Enterprise license.

1. Choose an example directory and review its `variables.tf`.
2. Configure environment inputs and the remote backend.
3. Initialize, validate, and review the plan and estimated costs.

```bash
terraform -chdir=envs/dev init
terraform -chdir=envs/dev validate
terraform -chdir=envs/dev plan
```

Example addresses and resource IDs are placeholders. Keep credentials and Terraform state/plan files out of Git.

## Documentation

- [Architecture](docs/architecture.md)
- [Operations](docs/operations.md)
- [Vault benchmarks](docs/vault-benchmark.md)
- [Terraform setup](TERRAFORM_SETUP.md)

## Scope and limitations

This is a learning environment. EC2, RDS, NAT gateways, load balancers, storage, and logs incur costs. Review the large instance defaults before applying. Licensing, TLS, backups, and network policy require environment-specific configuration; production availability or performance is not guaranteed.
