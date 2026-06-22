# AWS EC2 with Terraform Enterprise

This configuration creates a small AWS lab EC2 instance through a Terraform Enterprise workspace.

## What It Creates

- Existing security group attached to the EC2 instance
- EC2 instance from the approved Ubuntu 24.04 arm64 AMI

The current AWS sandbox session policy explicitly denies creating new VPC, IAM role, and security group resources, so this configuration uses the existing default VPC/subnet, existing security group, and existing EC2 key pair.

## Approved AMI

The instance uses the approved AMI from the screenshot:

```text
AMI ID: ami-0de44fe9c10f5cac7
AMI name: hc-base-ubuntu-2404-arm64-20260622041515
Owner account: 888995627335
Architecture: arm64
Platform: Linux/UNIX
Virtualization: hvm
Root device: /dev/sda1
Root device type: EBS
```

Because this AMI is `arm64`, the default instance type is `t4g.2xlarge`. Do not use `t3.micro` or other x86_64-only instance types with this AMI.

AMI IDs are region-specific. If `ami-0de44fe9c10f5cac7` is not in `ap-northeast-2`, set `aws_region` and `ami_id` to the matching region and copied AMI ID.

## Terraform Enterprise Connection

The workspace is configured for Terraform Enterprise:

```text
hostname: ec2-3-37-175-160.ap-northeast-2.compute.amazonaws.com
organization: hashicorp-lab
workspace: aws-ec2-dev
```

## AWS Authentication for Runs

For the first test, the fastest option is to add these as sensitive environment variables in the Terraform Enterprise workspace:

```text
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
AWS_SESSION_TOKEN    # only if using temporary credentials
```

For Enterprise-style operation, prefer AWS dynamic provider credentials or Vault-backed dynamic credentials instead of long-lived access keys.

## Run

```bash
terraform -chdir=aws-ec2-tfe plan
terraform -chdir=aws-ec2-tfe apply
```

The plan and apply run in Terraform Enterprise, and the CLI streams the result locally.

After apply, connect with SSH:

```bash
ssh -i ~/Downloads/Byeongwook.pem ubuntu@<instance-public-ip>
```

## Clean Up

```bash
terraform -chdir=aws-ec2-tfe destroy
```
