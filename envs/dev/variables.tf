variable "aws_region" {
  description = "AWS region for the enterprise lab."
  type        = string
  default     = "ap-northeast-2"
}

variable "project" {
  description = "Project name used in resource names and tags."
  type        = string
  default     = "hashicorp-lab"
}

variable "environment" {
  description = "Environment name."
  type        = string
  default     = "dev"
}

variable "default_tags" {
  description = "Additional tags applied to all supported resources."
  type        = map(string)
  default     = {}
}

variable "ami_id" {
  description = "Approved arm64 Ubuntu 24.04 AMI ID."
  type        = string
  default     = "ami-0de44fe9c10f5cac7"
}

variable "key_name" {
  description = "Existing EC2 key pair name."
  type        = string
  default     = "Byeongwook"
}

variable "azs" {
  description = "Availability Zones used by the lab."
  type        = list(string)
  default     = ["ap-northeast-2a", "ap-northeast-2c"]
}

variable "vpc_cidr" {
  description = "CIDR block for the lab VPC."
  type        = string
  default     = "10.40.0.0/16"
}

variable "public_subnet_cidrs" {
  description = "Public subnet CIDRs for ALB and NAT gateways."
  type        = list(string)
  default     = ["10.40.0.0/24", "10.40.1.0/24"]
}

variable "app_private_subnet_cidrs" {
  description = "Private subnet CIDRs for application EC2 instances."
  type        = list(string)
  default     = ["10.40.10.0/24", "10.40.11.0/24"]
}

variable "db_private_subnet_cidrs" {
  description = "Private subnet CIDRs for RDS."
  type        = list(string)
  default     = ["10.40.20.0/24", "10.40.21.0/24"]
}

variable "create_nat_gateways" {
  description = "Create one NAT gateway per public subnet for private application egress."
  type        = bool
  default     = true
}

variable "allowed_http_cidrs" {
  description = "CIDR blocks allowed to access the public ALB."
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

variable "app_port" {
  description = "Application port served by EC2 instances."
  type        = number
  default     = 8080
}

variable "health_check_path" {
  description = "ALB target group health check path."
  type        = string
  default     = "/"
}

variable "app_instance_type" {
  description = "EC2 instance type for application nodes."
  type        = string
  default     = "t4g.2xlarge"
}

variable "app_desired_capacity" {
  description = "Desired number of application instances."
  type        = number
  default     = 2
}

variable "app_min_size" {
  description = "Minimum number of application instances."
  type        = number
  default     = 2
}

variable "app_max_size" {
  description = "Maximum number of application instances."
  type        = number
  default     = 4
}

variable "app_root_volume_size" {
  description = "Root EBS volume size in GiB for application instances."
  type        = number
  default     = 100
}

variable "db_port" {
  description = "Database listener port."
  type        = number
  default     = 5432
}

variable "db_name" {
  description = "Initial database name."
  type        = string
  default     = "hashicorplab"
}

variable "db_username" {
  description = "RDS master username. Password is managed by AWS Secrets Manager."
  type        = string
  default     = "hashicorpadmin"
}

variable "db_instance_class" {
  description = "RDS instance class."
  type        = string
  default     = "db.t4g.2xlarge"
}

variable "db_allocated_storage" {
  description = "Initial RDS storage in GiB."
  type        = number
  default     = 100
}

variable "db_max_allocated_storage" {
  description = "Maximum RDS autoscaled storage in GiB."
  type        = number
  default     = 500
}

variable "db_engine_version" {
  description = "PostgreSQL engine version."
  type        = string
  default     = "16.14"
}

variable "db_parameter_group_family" {
  description = "RDS parameter group family."
  type        = string
  default     = "postgres16"
}

variable "db_multi_az" {
  description = "Enable Multi-AZ RDS deployment."
  type        = bool
  default     = true
}

variable "db_deletion_protection" {
  description = "Protect the RDS instance from accidental deletion."
  type        = bool
  default     = false
}

variable "db_skip_final_snapshot" {
  description = "Skip final snapshot when destroying the lab database."
  type        = bool
  default     = true
}

variable "vault_node_count" {
  description = "Number of Vault Enterprise EC2 nodes."
  type        = number
  default     = 3
}

variable "vault_instance_type" {
  description = "EC2 instance type for Vault Enterprise nodes."
  type        = string
  default     = "t4g.2xlarge"
}

variable "vault_root_volume_size" {
  description = "Root EBS volume size in GiB for Vault Enterprise nodes."
  type        = number
  default     = 100
}

variable "vault_license_parameter_name" {
  description = "SSM SecureString parameter name containing the Vault Enterprise license."
  type        = string
  default     = "/hashicorp-lab/dev/vault/license"
}

variable "vault_init_parameter_name" {
  description = "SSM SecureString parameter name for storing Vault init output."
  type        = string
  default     = "/hashicorp-lab/dev/vault/init"
}

variable "vault_api_allowed_cidrs" {
  description = "CIDR blocks allowed to access Vault API port 8200."
  type        = list(string)
  default     = ["10.40.0.0/16"]
}
