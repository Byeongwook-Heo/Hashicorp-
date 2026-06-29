resource "aws_security_group" "vpc_link" {
  name        = "${var.name_prefix}-mcp-apigw-vpc-link-sg"
  description = "API Gateway VPC link security group for MCP private integration"
  vpc_id      = var.vpc_id

  egress {
    description = "All outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-mcp-apigw-vpc-link-sg"
    Tier = "ai-integration"
  })
}

resource "aws_security_group" "alb" {
  name        = "${var.name_prefix}-mcp-alb-sg"
  description = "Allow API Gateway VPC link to MCP internal ALB"
  vpc_id      = var.vpc_id

  ingress {
    description     = "HTTP from API Gateway VPC link"
    from_port       = 80
    to_port         = 80
    protocol        = "tcp"
    security_groups = [aws_security_group.vpc_link.id]
  }

  egress {
    description = "All outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-mcp-alb-sg"
    Tier = "ai-integration"
  })
}

resource "aws_security_group" "server" {
  name        = "${var.name_prefix}-mcp-server-sg"
  description = "Allow MCP traffic from the internal ALB"
  vpc_id      = var.vpc_id

  ingress {
    description     = "MCP HTTP from internal ALB"
    from_port       = var.port
    to_port         = var.port
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

  egress {
    description = "All outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-mcp-server-sg"
    Tier = "ai-integration"
  })
}

resource "aws_lb" "this" {
  name               = "${var.name_prefix}-mcp-alb"
  internal           = true
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = var.subnet_ids

  enable_deletion_protection = false

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-mcp-alb"
    Tier = "ai-integration"
  })
}

resource "aws_lb_target_group" "this" {
  name     = "${var.name_prefix}-mcp-tg"
  port     = var.port
  protocol = "HTTP"
  vpc_id   = var.vpc_id

  health_check {
    enabled             = true
    healthy_threshold   = 2
    interval            = 30
    matcher             = "200-399"
    path                = "/health"
    protocol            = "HTTP"
    timeout             = 5
    unhealthy_threshold = 3
  }

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-mcp-tg"
    Tier = "ai-integration"
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
  name_prefix   = "${var.name_prefix}-mcp-"
  image_id      = var.ami_id
  instance_type = var.instance_type
  key_name      = var.key_name
  user_data = base64encode(templatefile("${path.module}/templates/user_data.sh.tftpl", {
    port        = var.port
    name_prefix = var.name_prefix
  }))

  iam_instance_profile {
    name = var.iam_instance_profile_name
  }

  metadata_options {
    http_endpoint = "enabled"
    http_tokens   = "required"
  }

  network_interfaces {
    associate_public_ip_address = false
    security_groups             = [aws_security_group.server.id]
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
      Name = "${var.name_prefix}-mcp"
      Tier = "ai-integration"
    })
  }

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-mcp-lt"
    Tier = "ai-integration"
  })
}

resource "aws_autoscaling_group" "this" {
  name                      = "${var.name_prefix}-mcp-asg"
  desired_capacity          = var.node_count
  min_size                  = var.node_count
  max_size                  = var.node_count + 2
  vpc_zone_identifier       = var.subnet_ids
  target_group_arns         = [aws_lb_target_group.this.arn]
  health_check_type         = "ELB"
  health_check_grace_period = 300

  launch_template {
    id      = aws_launch_template.this.id
    version = "$Latest"
  }

  dynamic "tag" {
    for_each = merge(var.tags, {
      Name = "${var.name_prefix}-mcp"
      Tier = "ai-integration"
    })

    content {
      key                 = tag.key
      value               = tag.value
      propagate_at_launch = true
    }
  }
}

resource "aws_apigatewayv2_vpc_link" "this" {
  name               = "${var.name_prefix}-mcp-vpc-link"
  security_group_ids = [aws_security_group.vpc_link.id]
  subnet_ids         = var.subnet_ids

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-mcp-vpc-link"
    Tier = "ai-integration"
  })
}

resource "aws_apigatewayv2_api" "this" {
  name          = "${var.name_prefix}-mcp-api"
  protocol_type = "HTTP"

  cors_configuration {
    allow_headers = ["authorization", "content-type", "mcp-session-id"]
    allow_methods = ["GET", "POST", "OPTIONS"]
    allow_origins = ["*"]
    max_age       = 300
  }

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-mcp-api"
    Tier = "ai-integration"
  })
}

resource "aws_apigatewayv2_integration" "this" {
  api_id                 = aws_apigatewayv2_api.this.id
  connection_id          = aws_apigatewayv2_vpc_link.this.id
  connection_type        = "VPC_LINK"
  integration_method     = "ANY"
  integration_type       = "HTTP_PROXY"
  integration_uri        = aws_lb_listener.http.arn
  payload_format_version = "1.0"
}

resource "aws_apigatewayv2_route" "root" {
  api_id    = aws_apigatewayv2_api.this.id
  route_key = "ANY /"
  target    = "integrations/${aws_apigatewayv2_integration.this.id}"
}

resource "aws_apigatewayv2_route" "proxy" {
  api_id    = aws_apigatewayv2_api.this.id
  route_key = "ANY /{proxy+}"
  target    = "integrations/${aws_apigatewayv2_integration.this.id}"
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.this.id
  name        = "$default"
  auto_deploy = true

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-mcp-default-stage"
    Tier = "ai-integration"
  })
}
