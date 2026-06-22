data "aws_caller_identity" "current" {}

data "aws_iam_policy_document" "ec2_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_kms_key" "vault_unseal" {
  description             = "${var.name_prefix} Vault auto-unseal key"
  deletion_window_in_days = 7
  enable_key_rotation     = true

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-vault-unseal"
    Tier = "security"
  })
}

resource "aws_kms_alias" "vault_unseal" {
  name          = "alias/${var.name_prefix}-vault-unseal"
  target_key_id = aws_kms_key.vault_unseal.key_id
}

resource "aws_iam_role" "vault" {
  name               = "${var.name_prefix}-vault-role"
  assume_role_policy = data.aws_iam_policy_document.ec2_assume_role.json

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-vault-role"
    Tier = "security"
  })
}

data "aws_iam_policy_document" "vault" {
  statement {
    sid = "VaultAwsDiscovery"
    actions = [
      "ec2:DescribeInstances",
      "ec2:DescribeTags"
    ]
    resources = ["*"]
  }

  statement {
    sid = "ReadVaultLicense"
    actions = [
      "ssm:GetParameter"
    ]
    resources = [
      "arn:aws:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter${var.vault_license_parameter_name}"
    ]
  }

  statement {
    sid = "WriteVaultInitOutput"
    actions = [
      "ssm:PutParameter"
    ]
    resources = [
      "arn:aws:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter${var.vault_init_parameter_name}"
    ]
  }

  statement {
    sid = "VaultAutoUnseal"
    actions = [
      "kms:Decrypt",
      "kms:DescribeKey",
      "kms:Encrypt",
      "kms:GenerateDataKey"
    ]
    resources = [aws_kms_key.vault_unseal.arn]
  }
}

resource "aws_iam_role_policy" "vault" {
  name   = "${var.name_prefix}-vault-policy"
  role   = aws_iam_role.vault.id
  policy = data.aws_iam_policy_document.vault.json
}

resource "aws_iam_role_policy_attachment" "ssm" {
  role       = aws_iam_role.vault.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_role_policy_attachment" "cloudwatch_agent" {
  role       = aws_iam_role.vault.name
  policy_arn = "arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy"
}

resource "aws_iam_instance_profile" "vault" {
  name = "${var.name_prefix}-vault-profile"
  role = aws_iam_role.vault.name

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-vault-profile"
    Tier = "security"
  })
}

resource "aws_security_group" "vault" {
  name        = "${var.name_prefix}-vault-sg"
  description = "Vault Enterprise cluster security group"
  vpc_id      = var.vpc_id

  ingress {
    description = "Vault API from allowed CIDRs"
    from_port   = 8200
    to_port     = 8200
    protocol    = "tcp"
    cidr_blocks = var.vault_api_allowed_cidrs
  }

  ingress {
    description = "Vault cluster traffic between nodes"
    from_port   = 8201
    to_port     = 8201
    protocol    = "tcp"
    self        = true
  }

  egress {
    description = "All outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-vault-sg"
    Tier = "security"
  })
}

locals {
  vault_cluster_tag = "${var.name_prefix}-vault"

  nodes = {
    for idx in range(var.node_count) :
    format("%02d", idx + 1) => {
      index     = idx
      subnet_id = var.subnet_ids[idx % length(var.subnet_ids)]
      name      = "${var.name_prefix}-vault-${format("%02d", idx + 1)}"
    }
  }
}

resource "aws_instance" "vault" {
  for_each = local.nodes

  ami                         = var.ami_id
  instance_type               = var.instance_type
  subnet_id                   = each.value.subnet_id
  vpc_security_group_ids      = [aws_security_group.vault.id]
  associate_public_ip_address = false
  key_name                    = var.key_name
  iam_instance_profile        = aws_iam_instance_profile.vault.name
  user_data_replace_on_change = true

  user_data = templatefile("${path.module}/templates/user_data.sh.tftpl", {
    aws_region                   = var.aws_region
    node_index                   = each.value.index
    vault_cluster_tag            = local.vault_cluster_tag
    vault_license_parameter_name = var.vault_license_parameter_name
    vault_init_parameter_name    = var.vault_init_parameter_name
    kms_key_id                   = aws_kms_key.vault_unseal.key_id
  })

  metadata_options {
    http_endpoint = "enabled"
    http_tokens   = "required"
  }

  root_block_device {
    encrypted   = true
    volume_size = var.root_volume_size
    volume_type = "gp3"
  }

  tags = merge(var.tags, {
    Name         = each.value.name
    Tier         = "security"
    Role         = "vault-enterprise"
    VaultCluster = local.vault_cluster_tag
    VaultNode    = each.key
  })

  depends_on = [
    aws_iam_role_policy.vault,
    aws_iam_role_policy_attachment.ssm,
    aws_iam_role_policy_attachment.cloudwatch_agent
  ]
}

