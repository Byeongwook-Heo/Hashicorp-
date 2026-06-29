data "aws_iam_policy_document" "ec2_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "random_password" "admin" {
  length           = 24
  special          = true
  override_special = "!#$%&*()-_=+[]{}"
}

resource "aws_secretsmanager_secret" "admin" {
  name        = "${var.name_prefix}-keycloak-admin"
  description = "Keycloak bootstrap admin credentials"

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-keycloak-admin"
    Tier = "identity"
  })
}

resource "aws_secretsmanager_secret_version" "admin" {
  secret_id = aws_secretsmanager_secret.admin.id
  secret_string = jsonencode({
    username = var.admin_username
    password = random_password.admin.result
  })
}

resource "aws_security_group" "alb" {
  name        = "${var.name_prefix}-keycloak-alb-sg"
  description = "Allow public HTTP access to Keycloak ALB"
  vpc_id      = var.vpc_id

  ingress {
    description = "HTTP"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = var.allowed_http_cidrs
  }

  egress {
    description = "All outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-keycloak-alb-sg"
    Tier = "identity"
  })
}

resource "aws_security_group" "keycloak" {
  name        = "${var.name_prefix}-keycloak-sg"
  description = "Allow Keycloak traffic from the Keycloak ALB"
  vpc_id      = var.vpc_id

  ingress {
    description     = "Keycloak HTTP from ALB"
    from_port       = 8080
    to_port         = 8080
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  ingress {
    description = "Keycloak JGroups TCP between nodes"
    from_port   = 7800
    to_port     = 7800
    protocol    = "tcp"
    self        = true
  }

  ingress {
    description = "Keycloak JGroups FD socket between nodes"
    from_port   = 57800
    to_port     = 57800
    protocol    = "tcp"
    self        = true
  }

  dynamic "ingress" {
    for_each = var.bastion_security_group_id == null ? [] : [var.bastion_security_group_id]

    content {
      description     = "SSH from bastion"
      from_port       = 22
      to_port         = 22
      protocol        = "tcp"
      security_groups = [ingress.value]
    }
  }

  egress {
    description = "All outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-keycloak-sg"
    Tier = "identity"
  })
}

resource "aws_security_group" "db" {
  name        = "${var.name_prefix}-keycloak-db-sg"
  description = "Allow Keycloak instances to PostgreSQL"
  vpc_id      = var.vpc_id

  ingress {
    description     = "PostgreSQL from Keycloak"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.keycloak.id]
  }

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-keycloak-db-sg"
    Tier = "identity"
  })
}

resource "aws_db_subnet_group" "this" {
  name       = "${var.name_prefix}-keycloak-db-subnets"
  subnet_ids = var.db_subnet_ids

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-keycloak-db-subnets"
    Tier = "identity"
  })
}

resource "aws_db_parameter_group" "this" {
  name   = "${var.name_prefix}-keycloak-postgres"
  family = var.parameter_group_family

  parameter {
    name  = "log_connections"
    value = "1"
  }

  parameter {
    name  = "log_disconnections"
    value = "1"
  }

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-keycloak-postgres"
    Tier = "identity"
  })
}

resource "aws_db_instance" "this" {
  identifier                  = "${var.name_prefix}-keycloak-postgres"
  engine                      = "postgres"
  engine_version              = var.engine_version
  instance_class              = var.db_instance_class
  allocated_storage           = var.allocated_storage
  max_allocated_storage       = var.max_allocated_storage
  storage_type                = "gp3"
  storage_encrypted           = true
  db_name                     = var.db_name
  username                    = var.db_username
  manage_master_user_password = true
  port                        = 5432
  multi_az                    = var.multi_az
  publicly_accessible         = false
  db_subnet_group_name        = aws_db_subnet_group.this.name
  vpc_security_group_ids      = [aws_security_group.db.id]
  parameter_group_name        = aws_db_parameter_group.this.name
  backup_retention_period     = 7
  deletion_protection         = var.deletion_protection
  skip_final_snapshot         = var.skip_final_snapshot

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-keycloak-postgres"
    Tier = "identity"
  })
}

resource "aws_iam_role" "this" {
  name               = "${var.name_prefix}-keycloak-role"
  assume_role_policy = data.aws_iam_policy_document.ec2_assume_role.json

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-keycloak-role"
    Tier = "identity"
  })
}

data "aws_iam_policy_document" "this" {
  statement {
    sid = "ReadKeycloakSecrets"
    actions = [
      "secretsmanager:GetSecretValue"
    ]
    resources = [
      aws_secretsmanager_secret.admin.arn,
      aws_db_instance.this.master_user_secret[0].secret_arn
    ]
  }
}

resource "aws_iam_role_policy" "this" {
  name   = "${var.name_prefix}-keycloak-policy"
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
  name = "${var.name_prefix}-keycloak-profile"
  role = aws_iam_role.this.name

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-keycloak-profile"
    Tier = "identity"
  })
}

resource "aws_lb" "this" {
  name               = "${var.name_prefix}-keycloak-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = var.public_subnet_ids

  enable_deletion_protection = false

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-keycloak-alb"
    Tier = "identity"
  })
}

resource "aws_lb_target_group" "this" {
  name     = "${var.name_prefix}-keycloak-tg"
  port     = 8080
  protocol = "HTTP"
  vpc_id   = var.vpc_id

  health_check {
    enabled             = true
    healthy_threshold   = 2
    interval            = 30
    matcher             = "200-399"
    path                = "/realms/master"
    protocol            = "HTTP"
    timeout             = 5
    unhealthy_threshold = 5
  }

  stickiness {
    type            = "lb_cookie"
    enabled         = true
    cookie_duration = 86400
  }

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-keycloak-tg"
    Tier = "identity"
  })
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.this.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.this.arn
  }
}

resource "aws_launch_template" "this" {
  name_prefix   = "${var.name_prefix}-keycloak-"
  image_id      = var.ami_id
  instance_type = var.instance_type
  key_name      = var.key_name
  user_data = base64encode(templatefile("${path.module}/templates/user_data.sh.tftpl", {
    aws_region       = var.aws_region
    keycloak_version = var.keycloak_version
    db_secret_arn    = aws_db_instance.this.master_user_secret[0].secret_arn
    admin_secret_arn = aws_secretsmanager_secret.admin.arn
    db_host          = split(":", aws_db_instance.this.endpoint)[0]
    db_name          = var.db_name
  }))

  iam_instance_profile {
    name = aws_iam_instance_profile.this.name
  }

  metadata_options {
    http_endpoint = "enabled"
    http_tokens   = "required"
  }

  network_interfaces {
    associate_public_ip_address = false
    security_groups             = [aws_security_group.keycloak.id]
  }

  block_device_mappings {
    device_name = "/dev/sda1"

    ebs {
      delete_on_termination = true
      encrypted             = true
      volume_size           = var.root_volume_size
      volume_type           = "gp3"
    }
  }

  tag_specifications {
    resource_type = "instance"

    tags = merge(var.tags, {
      Name = "${var.name_prefix}-keycloak"
      Tier = "identity"
    })
  }

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-keycloak-lt"
    Tier = "identity"
  })

  depends_on = [
    aws_iam_role_policy.this,
    aws_iam_role_policy_attachment.ssm,
    aws_iam_role_policy_attachment.cloudwatch_agent
  ]
}

resource "aws_autoscaling_group" "this" {
  name                      = "${var.name_prefix}-keycloak-asg"
  desired_capacity          = var.node_count
  min_size                  = var.node_count
  max_size                  = var.node_count + 2
  vpc_zone_identifier       = var.app_subnet_ids
  target_group_arns         = [aws_lb_target_group.this.arn]
  health_check_type         = "ELB"
  health_check_grace_period = 900

  launch_template {
    id      = aws_launch_template.this.id
    version = aws_launch_template.this.latest_version
  }

  instance_refresh {
    strategy = "Rolling"

    preferences {
      instance_warmup        = 300
      min_healthy_percentage = 50
    }
  }

  dynamic "tag" {
    for_each = merge(var.tags, {
      Name = "${var.name_prefix}-keycloak"
      Tier = "identity"
    })

    content {
      key                 = tag.key
      value               = tag.value
      propagate_at_launch = true
    }
  }
}
