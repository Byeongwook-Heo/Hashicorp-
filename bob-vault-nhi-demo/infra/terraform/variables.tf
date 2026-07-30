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

variable "service_version" {
  description = "Reader-facing release identifier."
  type        = string
  default     = "0.1.0"
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
