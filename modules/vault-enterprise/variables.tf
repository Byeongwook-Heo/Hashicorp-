variable "name_prefix" {
  description = "Name prefix for Vault Enterprise resources."
  type        = string
}

variable "aws_region" {
  description = "AWS region for Vault resources."
  type        = string
}

variable "vpc_id" {
  description = "VPC ID."
  type        = string
}

variable "vpc_cidr" {
  description = "VPC CIDR allowed to reach Vault."
  type        = string
}

variable "subnet_ids" {
  description = "Private subnet IDs for Vault nodes."
  type        = list(string)
}

variable "ami_id" {
  description = "AMI ID for Vault nodes."
  type        = string
}

variable "instance_type" {
  description = "EC2 instance type for Vault nodes."
  type        = string
  default     = "t4g.2xlarge"
}

variable "key_name" {
  description = "EC2 key pair name."
  type        = string
  default     = null
}

variable "node_count" {
  description = "Number of Vault nodes."
  type        = number
  default     = 3

  validation {
    condition     = var.node_count >= 3
    error_message = "node_count must be at least 3 for a Vault HA lab cluster."
  }
}

variable "root_volume_size" {
  description = "Root EBS volume size in GiB."
  type        = number
  default     = 100
}

variable "vault_license_parameter_name" {
  description = "SSM SecureString parameter name containing the Vault Enterprise license."
  type        = string
}

variable "vault_init_parameter_name" {
  description = "SSM SecureString parameter name where the first node stores init output."
  type        = string
}

variable "vault_api_allowed_cidrs" {
  description = "CIDRs allowed to access Vault API port 8200."
  type        = list(string)
}

variable "tags" {
  description = "Tags applied to Vault resources."
  type        = map(string)
  default     = {}
}

