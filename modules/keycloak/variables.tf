variable "name_prefix" {
  description = "Name prefix for Keycloak resources."
  type        = string
}

variable "aws_region" {
  description = "AWS region."
  type        = string
}

variable "vpc_id" {
  description = "VPC ID."
  type        = string
}

variable "public_subnet_ids" {
  description = "Public subnet IDs for the Keycloak ALB."
  type        = list(string)
}

variable "app_subnet_ids" {
  description = "Private subnet IDs for Keycloak instances."
  type        = list(string)
}

variable "db_subnet_ids" {
  description = "Private database subnet IDs for Keycloak PostgreSQL."
  type        = list(string)
}

variable "ami_id" {
  description = "Approved arm64 Ubuntu AMI ID."
  type        = string
}

variable "instance_type" {
  description = "EC2 instance type for Keycloak nodes."
  type        = string
}

variable "key_name" {
  description = "Existing EC2 key pair name."
  type        = string
}

variable "node_count" {
  description = "Number of Keycloak EC2 nodes."
  type        = number
  default     = 2
}

variable "root_volume_size" {
  description = "Root EBS volume size in GiB for Keycloak nodes."
  type        = number
  default     = 100
}

variable "allowed_http_cidrs" {
  description = "CIDR blocks allowed to access the public Keycloak ALB."
  type        = list(string)
}

variable "bastion_security_group_id" {
  description = "Optional bastion security group ID allowed to SSH to Keycloak instances."
  type        = string
  default     = null
}

variable "keycloak_version" {
  description = "Keycloak container image version."
  type        = string
}

variable "admin_username" {
  description = "Initial Keycloak bootstrap admin username."
  type        = string
}

variable "db_name" {
  description = "Keycloak database name."
  type        = string
}

variable "db_username" {
  description = "Keycloak database master username."
  type        = string
}

variable "db_instance_class" {
  description = "RDS instance class for Keycloak PostgreSQL."
  type        = string
}

variable "allocated_storage" {
  description = "Initial RDS storage in GiB."
  type        = number
}

variable "max_allocated_storage" {
  description = "Maximum RDS autoscaled storage in GiB."
  type        = number
}

variable "engine_version" {
  description = "PostgreSQL engine version."
  type        = string
}

variable "parameter_group_family" {
  description = "PostgreSQL parameter group family."
  type        = string
}

variable "multi_az" {
  description = "Enable Multi-AZ RDS."
  type        = bool
}

variable "deletion_protection" {
  description = "Enable deletion protection for Keycloak RDS."
  type        = bool
}

variable "skip_final_snapshot" {
  description = "Skip final snapshot on destroy."
  type        = bool
}

variable "tags" {
  description = "Tags applied to Keycloak resources."
  type        = map(string)
  default     = {}
}
