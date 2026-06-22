# Operations

## HCP Terraform

Recommended workspaces:

```text
hashicorp_lab                 Existing bootstrap EC2 and agent workspace
hashicorp_lab-enterprise-dev  Enterprise-style dev environment
```

For GitHub VCS integration, set the workspace working directory to:

```text
envs/dev
```

## AWS Source IP Restriction

The current AWS credentials are restricted by a session policy. Remote plans from an EC2-hosted agent may fail if the agent public IP is not allowed by that policy.

Current agent public IP:

```text
52.79.210.204/32
```

If remote runs fail with `explicit deny in a session policy`, run from an allowed network or update the AWS credential/session policy source IP allowlist.

## Cost Control

This lab uses large defaults for enterprise testing:

```text
EC2 application instances: t4g.2xlarge
RDS instance:              db.t4g.2xlarge
NAT gateways:              one per AZ by default
```

Run `terraform plan` first and review all resources before applying.

