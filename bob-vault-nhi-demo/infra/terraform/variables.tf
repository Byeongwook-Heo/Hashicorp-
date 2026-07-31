variable "project_name" {
  description = "Stable project prefix."
  type        = string
  default     = "bob-vault-nhi-demo"
}

variable "aws_region" {
  description = "AWS region for all resources."
  type        = string
  default     = "ap-northeast-2"
}

variable "vpc_id" {
  description = "Existing lab VPC."
  type        = string
  default     = "vpc-0faaeb5858901d385"
}

variable "public_subnet_ids" {
  description = "Existing public subnets for the ALB."
  type        = list(string)
  default     = ["subnet-068dffa0960dbcffd", "subnet-068a968f3426594db"]
}

variable "app_subnet_ids" {
  description = "Existing NAT-routed private subnets for ECS and Vault."
  type        = list(string)
  default     = ["subnet-026ffcc7ad4b697c6", "subnet-06c50448784244f83"]
}

variable "database_subnet_ids" {
  description = "Existing isolated database subnets."
  type        = list(string)
  default     = ["subnet-07e488fded4534ef2", "subnet-0cd8afeeca0ace850"]
}

variable "hosted_zone_id" {
  description = "Existing public Route 53 hosted zone."
  type        = string
  default     = "Z07579811BJW2L1U58CO1"
}

variable "public_zone_name" {
  description = "Existing public DNS zone."
  type        = string
  default     = "byeongwook-heo.sbx.hashidemos.io"
}

variable "hostname" {
  description = "Public hostname label for Bob and the dashboard."
  type        = string
  default     = "bob-vault-demo"
}

variable "vault_ami_id" {
  description = "Approved x86_64 hardened base AMI."
  type        = string
  default     = "ami-09d68fa4b57f9e888"
}

variable "vault_ami_owner" {
  description = "Trusted owner of the approved base AMI."
  type        = string
  default     = "888995627335"
}

variable "vault_instance_type" {
  description = "Single-node demo Vault instance size."
  type        = string
  default     = "t3.medium"
}

variable "deploy_service" {
  description = "Whether to deploy the ECS task and service."
  type        = bool
  default     = false
}

variable "app_mode" {
  description = "Bootstrap exposes health, dashboard, and public JWK; aws enforces the complete identity flow."
  type        = string
  default     = "bootstrap"

  validation {
    condition     = contains(["bootstrap", "aws"], var.app_mode)
    error_message = "app_mode must be bootstrap or aws."
  }
}

variable "chatbot_enabled" {
  description = "Enable IBM Verify user login, OBO token exchange, and the sample chatbot."
  type        = bool
  default     = false
}

variable "inference_enabled" {
  description = "Enable the private intent-planning service with deterministic fallback."
  type        = bool
  default     = false
}

variable "inference_base_url" {
  description = "Private URL for the intent-planning service."
  type        = string
  default     = "http://10.70.20.182:11434"

  validation {
    condition     = can(regex("^http://10\\.[0-9]{1,3}\\.[0-9]{1,3}\\.[0-9]{1,3}:[0-9]{2,5}$", var.inference_base_url))
    error_message = "inference_base_url must be an explicit private 10/8 HTTP endpoint with a port."
  }
}

variable "inference_model" {
  description = "Server-side intent-planning model identifier; never returned by the public API."
  type        = string
  default     = "qwen3:8b"
  sensitive   = true
}

variable "inference_security_group_id" {
  description = "Existing security group on the private intent-planning instance."
  type        = string
  default     = "sg-089073fb16b9c197b"

  validation {
    condition     = can(regex("^sg-[0-9a-f]{8,17}$", var.inference_security_group_id))
    error_message = "inference_security_group_id must be a security group ID."
  }
}

variable "service_version" {
  description = "Reader-facing release identifier."
  type        = string
  default     = "0.1.0"
}

variable "verify_jwks_source_cidrs" {
  description = "Official IBM Verify Europe egress CIDRs allowed to retrieve only the public client JWKS."
  type        = list(string)
  default = [
    "159.122.122.57/32",
    "159.122.122.60/32",
    "169.50.174.103/32",
    "169.50.174.14/32",
    "35.180.161.22/32",
    "15.188.92.17/32",
    "13.36.19.201/32",
    "52.29.222.95/32",
    "3.66.207.203/32",
    "18.184.196.56/32",
  ]

  validation {
    condition = length(var.verify_jwks_source_cidrs) > 0 && alltrue([
      for cidr in var.verify_jwks_source_cidrs :
      can(cidrnetmask(cidr)) && endswith(cidr, "/32")
    ])
    error_message = "verify_jwks_source_cidrs must contain explicit IPv4 /32 addresses."
  }
}

variable "rds_engine_version" {
  description = "PostgreSQL version available in ap-northeast-2."
  type        = string
  default     = "16.14"
}

variable "rds_instance_class" {
  description = "Demo database instance class."
  type        = string
  default     = "db.t4g.micro"
}

variable "event_operator_principal_arns" {
  description = "Exact IAM role ARNs allowed to assume the time-bounded EC2 event operator role. Never use account root or wildcard principals."
  type        = list(string)
  default = [
    "arn:aws:iam::063455554839:role/aws_byeongwook.heo_test-developer"
  ]

  validation {
    condition = length(var.event_operator_principal_arns) > 0 && alltrue([
      for arn in var.event_operator_principal_arns :
      can(regex("^arn:[a-z0-9-]+:iam::[0-9]{12}:role/[A-Za-z0-9+=,.@_/-]+$", arn))
    ])
    error_message = "event_operator_principal_arns must contain exact IAM role ARNs; STS session ARNs, account root principals, and wildcards are not allowed."
  }
}

variable "event_access_expires_at" {
  description = "UTC time after which new event operator role assumptions and SSM sessions are denied."
  type        = string
  default     = "2026-09-02T00:00:00Z"

  validation {
    condition     = can(regex("^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$", var.event_access_expires_at))
    error_message = "event_access_expires_at must be an RFC 3339 UTC timestamp ending in Z."
  }
}

variable "event_ssh_users" {
  description = "Per-person public SSH keys allowed through the event bastion. Private .pem files must never be committed or uploaded."
  type = map(object({
    public_key = string
  }))
  default = {
    cgc = {
      public_key = "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABgQC4PH7BKTKDVnLtlfrs0zq/j4SezGWishYOYV66wRXDuLZ3IZNpMa4Br60/EZUKU64IHMNBMkDxInWV0gTsS4ANaTPDDlWMl7b/9XbnWP2ZXZ685OTJhGkSqogRrMQAeK5Z8wTUHWkrIGtLvnLVm7HANPnzDpTPZ+dt1z4dF1OJ51gEaR7lQGL9qwS74/Va5KDjonZreUwWNUjqpZUnYH/hvpJo0tt4tMp5X0GEiNAdmFCTrlXf3H28LFppX61QtcCcCKQZaHz5Mbj/axou95ZQKkS+d1VJnWQ+EymLpB6ouV75d4lTfyZbvTqoZUczzNjbyJjxu1VtOd+Xb2tMiMa4+JBj2M7AbIZDevIx4xVLxajwgWmqM5fbkVs95FuJHIUGr7zwgQqf5xVph8/QN1QV+70goh8eY5oghVWdFHWK1WygiGqvcbuhf0wrpjcl16NIhgK0b8GMBmmHwN+fQwJHiBX/MYR3IM+LmwEe84ng1cDTKJfOb4r7Oa26liSJcY0= CGC bob-vault event access expires 2026-09-02"
    }
  }

  validation {
    condition = length(var.event_ssh_users) > 0 && alltrue([
      for username, config in var.event_ssh_users :
      can(regex("^[a-z][a-z0-9_-]{1,30}$", username)) &&
      can(regex("^ssh-(rsa|ed25519) [A-Za-z0-9+/=]+( [A-Za-z0-9 .@_-]+)?$", trimspace(config.public_key)))
    ])
    error_message = "event_ssh_users must use safe Linux usernames and valid RSA or Ed25519 public keys with safe comments."
  }
}

variable "event_ssh_expires_at" {
  description = "OpenSSH 8.9-compatible authorized_keys expiry in UTC for event access."
  type        = string
  default     = "20260902000000"

  validation {
    condition     = can(regex("^[0-9]{14}$", var.event_ssh_expires_at))
    error_message = "event_ssh_expires_at must use OpenSSH 8.9-compatible UTC format YYYYMMDDHHMMSS."
  }
}

variable "event_ssh_expiry_calendar" {
  description = "Systemd UTC calendar expression that terminates existing event SSH sessions."
  type        = string
  default     = "2026-09-02 00:00:00 UTC"

  validation {
    condition     = can(regex("^[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2} UTC$", var.event_ssh_expiry_calendar))
    error_message = "event_ssh_expiry_calendar must use YYYY-MM-DD HH:MM:SS UTC."
  }
}
