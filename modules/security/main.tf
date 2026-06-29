resource "aws_security_group" "alb" {
  name        = "${var.name_prefix}-alb-sg"
  description = "Allow public HTTP access to the ALB"
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
    Name = "${var.name_prefix}-alb-sg"
  })
}

resource "aws_security_group" "app" {
  name        = "${var.name_prefix}-app-sg"
  description = "Allow ALB to application instances"
  vpc_id      = var.vpc_id

  ingress {
    description     = "Application from ALB"
    from_port       = var.app_port
    to_port         = var.app_port
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
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

  dynamic "egress" {
    for_each = var.allow_app_egress ? [1] : []

    content {
      description = "All outbound"
      from_port   = 0
      to_port     = 0
      protocol    = "-1"
      cidr_blocks = ["0.0.0.0/0"]
    }
  }

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-app-sg"
  })
}

resource "aws_security_group" "db" {
  name        = "${var.name_prefix}-db-sg"
  description = "Allow application instances to RDS"
  vpc_id      = var.vpc_id

  ingress {
    description     = "PostgreSQL from app"
    from_port       = var.db_port
    to_port         = var.db_port
    protocol        = "tcp"
    security_groups = [aws_security_group.app.id]
  }

  dynamic "egress" {
    for_each = var.allow_database_egress ? [1] : []

    content {
      description = "All outbound"
      from_port   = 0
      to_port     = 0
      protocol    = "-1"
      cidr_blocks = ["0.0.0.0/0"]
    }
  }

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-db-sg"
  })
}
