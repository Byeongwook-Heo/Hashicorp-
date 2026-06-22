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
EC2 Vault instances:       3 x t4g.2xlarge
RDS instance:              db.t4g.2xlarge
NAT gateways:              one per AZ by default
```

Run `terraform plan` first and review all resources before applying.

## Vault Enterprise

Vault Enterprise is bootstrapped from the approved arm64 Ubuntu AMI and runs as a 3-node integrated storage Raft cluster.

```text
Vault nodes:             i-0711d6a1adb0e1609, i-01d934cd430ab6576, i-013740958d1b26329
Vault API URLs:          http://10.40.10.202:8200, http://10.40.11.68:8200, http://10.40.10.147:8200
Auto-unseal KMS alias:   alias/hashicorp-lab-dev-vault-unseal
License parameter:       /hashicorp-lab/dev/vault/license
Init output parameter:   /hashicorp-lab/dev/vault/init
```

The original `/Users/heobyeong-ug/Downloads/vault.hclic` license was for Vault but expired on `2026-05-31`, so Vault refused to start. The active SSM license parameter was updated with `/Users/heobyeong-ug/Downloads/vault_exp20260930.hclic`.

The init output parameter contains sensitive recovery material and the initial root token. Only retrieve it when needed, and avoid sharing the terminal output.
