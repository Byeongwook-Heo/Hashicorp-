# AWS EC2 · HCP Terraform

[한국어](README.md) · [English](README.en.md)

## Purpose

An EC2 example using existing networking and security groups to practice remote Terraform runs.

## Benefits

- Understand remote workspace inputs, plans, and state.

## Features and structure

- EC2 instance with existing subnet, security group, and key pair inputs
- An instance type compatible with the ARM64 AMI

## Getting started

In this directory, review `variables.tf` and backend/cloud settings, then configure resources you can access.

```bash
terraform init
terraform validate
terraform plan
```

## Scope and limitations

AMI availability depends on region and account access. Restrict SSH CIDRs and use workspace dynamic credentials or an approved secret delivery mechanism. Applying creates billable EC2/storage resources.
