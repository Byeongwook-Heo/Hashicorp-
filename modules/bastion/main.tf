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

resource "aws_iam_role" "this" {
  name               = "${var.name_prefix}-bastion-role"
  assume_role_policy = data.aws_iam_policy_document.ec2_assume_role.json

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-bastion-role"
    Tier = "management"
  })
}

data "aws_iam_policy_document" "session_manager" {
  statement {
    sid = "DiscoverEc2Targets"
    actions = [
      "ec2:DescribeInstances",
      "ec2:DescribeTags"
    ]
    resources = ["*"]
  }

  statement {
    sid = "StartSessionToEc2Targets"
    actions = [
      "ssm:StartSession"
    ]
    resources = [
      "arn:aws:ec2:${var.aws_region}:${data.aws_caller_identity.current.account_id}:instance/*"
    ]
  }

  statement {
    sid = "StartSessionWithSessionDocuments"
    actions = [
      "ssm:StartSession"
    ]
    resources = [
      "arn:aws:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:document/SSM-SessionManagerRunShell",
      "arn:aws:ssm:${var.aws_region}::document/AWS-StartSSHSession",
      "arn:aws:ssm:${var.aws_region}::document/AWS-StartPortForwardingSession",
      "arn:aws:ssm:${var.aws_region}::document/AWS-StartPortForwardingSessionToRemoteHost"
    ]
  }

  statement {
    sid = "ManageOwnSessions"
    actions = [
      "ssm:ResumeSession",
      "ssm:TerminateSession"
    ]
    resources = [
      "arn:aws:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:session/*"
    ]
  }

  statement {
    sid = "ReadSessionManagerState"
    actions = [
      "ssm:DescribeInstanceInformation",
      "ssm:DescribeSessions",
      "ssm:GetConnectionStatus"
    ]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "session_manager" {
  name   = "${var.name_prefix}-bastion-session-manager"
  role   = aws_iam_role.this.id
  policy = data.aws_iam_policy_document.session_manager.json
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
  name = "${var.name_prefix}-bastion-profile"
  role = aws_iam_role.this.name

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-bastion-profile"
    Tier = "management"
  })
}

resource "aws_security_group" "this" {
  name        = "${var.name_prefix}-bastion-sg"
  description = "Security group for SSH bastion host"
  vpc_id      = var.vpc_id

  ingress {
    description = "SSH from admin CIDRs"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = var.allowed_ssh_cidrs
  }

  egress {
    description = "All outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-bastion-sg"
    Tier = "management"
  })
}

resource "aws_instance" "this" {
  ami                         = var.ami_id
  instance_type               = var.instance_type
  subnet_id                   = var.subnet_id
  vpc_security_group_ids      = [aws_security_group.this.id]
  associate_public_ip_address = true
  key_name                    = var.key_name
  iam_instance_profile        = aws_iam_instance_profile.this.name
  user_data                   = templatefile("${path.module}/templates/user_data.sh.tftpl", {
    aws_region  = var.aws_region
    name_prefix = var.name_prefix
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
    Name = "${var.name_prefix}-bastion"
    Tier = "management"
    Role = "bastion"
  })

  depends_on = [
    aws_iam_role_policy.session_manager,
    aws_iam_role_policy_attachment.ssm,
    aws_iam_role_policy_attachment.cloudwatch_agent
  ]
}
