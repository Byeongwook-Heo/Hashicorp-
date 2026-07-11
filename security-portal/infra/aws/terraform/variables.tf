variable "aws_region" {
  description = "AWS region."
  type        = string
  default     = "ap-northeast-2"
}

variable "project_name" {
  description = "Project name."
  type        = string
  default     = "security-portal"
}

variable "environment" {
  description = "Environment name."
  type        = string
  default     = "test"
}

variable "availability_zones" {
  description = "Availability zones. Explicit values avoid requiring ec2:DescribeAvailabilityZones."
  type        = list(string)
  default     = ["ap-northeast-2a", "ap-northeast-2c"]
}

variable "create_new_network" {
  description = "Create a dedicated VPC/subnet stack. If false, provide existing VPC and subnet IDs."
  type        = bool
  default     = true
}

variable "vpc_cidr" {
  description = "CIDR for the dedicated test VPC."
  type        = string
  default     = "10.70.0.0/16"
}

variable "vpc_id" {
  description = "Existing VPC ID when create_new_network=false."
  type        = string
  default     = ""
}

variable "public_subnet_ids" {
  description = "Existing public subnet IDs when create_new_network=false."
  type        = list(string)
  default     = []
}

variable "private_subnet_ids" {
  description = "Existing private subnet IDs when create_new_network=false."
  type        = list(string)
  default     = []
}

variable "enable_nat_gateway" {
  description = "Create one NAT gateway for private ECS tasks."
  type        = bool
  default     = true
}

variable "allowed_ingress_cidrs" {
  description = "CIDRs allowed to reach the portal ALB."
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

variable "alb_internal" {
  description = "Whether the ALB should be internal."
  type        = bool
  default     = false
}

variable "frontend_image_uri" {
  description = "Frontend container image URI. If empty and enable_ecr=true, ECR latest URI is used."
  type        = string
  default     = ""
}

variable "backend_image_uri" {
  description = "Backend container image URI. If empty and enable_ecr=true, ECR latest URI is used."
  type        = string
  default     = ""
}

variable "frontend_container_port" {
  description = "Frontend container port."
  type        = number
  default     = 3000
}

variable "backend_container_port" {
  description = "Backend container port."
  type        = number
  default     = 4000
}

variable "desired_count" {
  description = "ECS desired task count. Keep 0 until images are pushed."
  type        = number
  default     = 0
}

variable "cpu" {
  description = "Fargate task CPU units."
  type        = number
  default     = 512
}

variable "memory" {
  description = "Fargate task memory."
  type        = number
  default     = 1024
}

variable "enable_ollama" {
  description = "Create a private GPU-backed Ollama inference instance and connect the backend to it."
  type        = bool
  default     = false
}

variable "ollama_ami_id" {
  description = "Approved x86_64 hc-base AMI used by the Ollama instance."
  type        = string
  default     = ""

  validation {
    condition     = !var.enable_ollama || can(regex("^ami-[0-9a-f]+$", var.ollama_ami_id))
    error_message = "ollama_ami_id must be an AMI ID when enable_ollama=true."
  }
}

variable "ollama_instance_type" {
  description = "GPU EC2 instance type for Ollama."
  type        = string
  default     = "g6.xlarge"
}

variable "ollama_model" {
  description = "Ollama model pulled during instance bootstrap."
  type        = string
  default     = "qwen3:8b"
}

variable "ollama_api_port" {
  description = "Authenticated private Ollama API port exposed to the backend."
  type        = number
  default     = 11434
}

variable "ollama_internal_port" {
  description = "Loopback-only Ollama service port behind the authenticated proxy."
  type        = number
  default     = 11435
}

variable "ollama_root_volume_size" {
  description = "Encrypted gp3 root volume size for drivers, Ollama, and model data."
  type        = number
  default     = 100
}

variable "ollama_subnet_index" {
  description = "Index of the private subnet used by the single-instance Ollama PoC."
  type        = number
  default     = 0
}

variable "ollama_request_timeout_ms" {
  description = "Backend timeout for a non-streaming Ollama chat request."
  type        = number
  default     = 90000
}

variable "rds_instance_class" {
  description = "RDS PostgreSQL instance class."
  type        = string
  default     = "db.t4g.micro"
}

variable "rds_allocated_storage" {
  description = "RDS allocated storage in GiB."
  type        = number
  default     = 20
}

variable "rds_engine_version" {
  description = "RDS PostgreSQL engine version."
  type        = string
  default     = "16.14"
}

variable "rds_username" {
  description = "RDS master username."
  type        = string
  default     = "security_portal"
}

variable "rds_database_name" {
  description = "Application database name."
  type        = string
  default     = "security_portal"
}

variable "backup_retention_days" {
  description = "RDS backup retention."
  type        = number
  default     = 1
}

variable "deletion_protection" {
  description = "Enable RDS deletion protection."
  type        = bool
  default     = false
}

variable "vault_mode" {
  description = "Vault mode for backend runtime."
  type        = string
  default     = "mock"
}

variable "vault_addr" {
  description = "Existing Vault endpoint. Empty for mock mode."
  type        = string
  default     = ""
}

variable "vault_namespace" {
  description = "Vault namespace for real mode."
  type        = string
  default     = ""
}

variable "vault_auth_mode" {
  description = "Vault auth mode."
  type        = string
  default     = "mock"
}

variable "vault_approle_auth_mount" {
  description = "Vault AppRole auth mount name."
  type        = string
  default     = "approle"
}

variable "vault_use_system_namespace" {
  description = "Use each system's namespace mapping when VAULT_NAMESPACE is empty."
  type        = bool
  default     = false
}

variable "vault_request_timeout_ms" {
  description = "Vault HTTP request timeout in milliseconds."
  type        = number
  default     = 10000
}

variable "vault_token_secret_arn" {
  description = "Optional Secrets Manager ARN containing a tightly scoped Vault token."
  type        = string
  default     = ""
}

variable "vault_role_id_secret_arn" {
  description = "Optional Secrets Manager ARN containing Vault AppRole role_id."
  type        = string
  default     = ""
}

variable "vault_secret_id_secret_arn" {
  description = "Optional Secrets Manager ARN containing Vault AppRole secret_id."
  type        = string
  default     = ""
}

variable "log_retention_days" {
  description = "CloudWatch log retention days."
  type        = number
  default     = 14
}

variable "enable_ecr" {
  description = "Create ECR repositories."
  type        = bool
  default     = true
}

variable "acm_certificate_arn" {
  description = "Optional ACM certificate ARN for HTTPS listener."
  type        = string
  default     = ""
}

variable "domain_name" {
  description = "Optional Route53 record name."
  type        = string
  default     = ""
}

variable "route53_zone_id" {
  description = "Optional Route53 zone ID."
  type        = string
  default     = ""
}
