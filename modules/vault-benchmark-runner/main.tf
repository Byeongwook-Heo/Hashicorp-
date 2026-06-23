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

resource "aws_security_group" "this" {
  name        = "${var.name_prefix}-vault-benchmark-runner-sg"
  description = "Security group for Vault benchmark runner"
  vpc_id      = var.vpc_id

  egress {
    description = "All outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-vault-benchmark-runner-sg"
    Tier = "benchmark"
  })
}

resource "aws_iam_role" "this" {
  name               = "${var.name_prefix}-vault-benchmark-runner-role"
  assume_role_policy = data.aws_iam_policy_document.ec2_assume_role.json

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-vault-benchmark-runner-role"
    Tier = "benchmark"
  })
}

data "aws_iam_policy_document" "this" {
  statement {
    sid = "ReadVaultInitParameter"
    actions = [
      "ssm:GetParameter"
    ]
    resources = [
      "arn:aws:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter${var.vault_init_parameter_name}"
    ]
  }
}

resource "aws_iam_role_policy" "this" {
  name   = "${var.name_prefix}-vault-benchmark-runner-policy"
  role   = aws_iam_role.this.id
  policy = data.aws_iam_policy_document.this.json
}

resource "aws_iam_role_policy_attachment" "ssm" {
  role       = aws_iam_role.this.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_role_policy_attachment" "cloudwatch_agent" {
  role       = aws_iam_role.this.name
  policy_arn = "arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy"
}

resource "aws_iam_instance_profile" "this" {
  name = "${var.name_prefix}-vault-benchmark-runner-profile"
  role = aws_iam_role.this.name

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-vault-benchmark-runner-profile"
    Tier = "benchmark"
  })
}

resource "aws_instance" "this" {
  ami                         = var.ami_id
  instance_type               = var.instance_type
  subnet_id                   = var.subnet_id
  vpc_security_group_ids      = [aws_security_group.this.id]
  associate_public_ip_address = false
  key_name                    = var.key_name
  iam_instance_profile        = aws_iam_instance_profile.this.name
  user_data_replace_on_change = true

  user_data = templatefile("${path.module}/templates/user_data.sh.tftpl", {
    aws_region                = var.aws_region
    vault_addr                = var.vault_addr
    vault_init_parameter_name = var.vault_init_parameter_name
    vault_benchmark_version   = var.vault_benchmark_version
    go_version                = var.go_version
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
    Name = "${var.name_prefix}-vault-benchmark-runner"
    Tier = "benchmark"
    Role = "vault-benchmark-runner"
  })

  depends_on = [
    aws_iam_role_policy.this,
    aws_iam_role_policy_attachment.ssm,
    aws_iam_role_policy_attachment.cloudwatch_agent
  ]
}
