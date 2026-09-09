# HashiCorp Guides

[한국어](README.md) · [English](README.en.md)

A documentation repository for Vault and Terraform installation, learning, and operations. Executable AWS infrastructure labs live in the separate `hashicorp-enterprise-aws-lab` repository.

## Documentation

| Document | Purpose |
| --- | --- |
| [Vault Guide](vault-guide.md) | Canonical Vault setup, initialization, KV, policy, and operations scenarios |
| [Vault CLI / UI / HTTP API](vault-cli-ui-api.md) | Quick reference for tokens, KV v2, UI, and HTTP API |
| [Vault Upgrade Runbook](vault-upgrade-runbook.md) | Upgrade preparation, execution, and validation |
| [Terraform Setup](TERRAFORM_SETUP.md) | Terraform installation and basic project initialization |

## Repository role

This repository is the **single source for product guides and runbooks**. AWS resources, Terraform modules, and executable Vault Enterprise infrastructure labs are maintained in [hashicorp-enterprise-aws-lab](https://github.com/Byeongwook-Heo/hashicorp-enterprise-aws-lab).

## Getting started

1. Choose the document that matches your goal.
2. Check product version, OS, permissions, networking, and licensing.
3. Adapt example addresses, paths, and inputs to your environment.
4. Validate changes in a test environment before production use.

## Scope and limitations

This is a documentation repository and does not provide automatic installation or guarantee service health. Commands and procedures can change by product version; verify the applicable official documentation and release notes before use.
