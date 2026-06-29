variable "name_prefix" {
  description = "Name prefix for MCP server resources."
  type        = string
}

variable "vpc_id" {
  description = "VPC ID."
  type        = string
}

variable "subnet_ids" {
  description = "Private subnet IDs for MCP server instances, internal ALB, and API Gateway VPC link."
  type        = list(string)
}

variable "ami_id" {
  description = "Approved arm64 Ubuntu AMI ID."
  type        = string
}

variable "instance_type" {
  description = "EC2 instance type for MCP server nodes."
  type        = string
}

variable "key_name" {
  description = "Existing EC2 key pair name."
  type        = string
}

variable "iam_instance_profile_name" {
  description = "IAM instance profile name for MCP server EC2 nodes."
  type        = string
}

variable "node_count" {
  description = "Number of MCP server EC2 nodes."
  type        = number
  default     = 2
}

variable "root_volume_size" {
  description = "Root EBS volume size in GiB for MCP server nodes."
  type        = number
  default     = 100
}

variable "port" {
  description = "MCP server listener port."
  type        = number
  default     = 8081
}

variable "bastion_security_group_id" {
  description = "Optional bastion security group ID allowed to SSH to MCP server instances."
  type        = string
  default     = null
}

variable "tags" {
  description = "Tags applied to MCP server resources."
  type        = map(string)
  default     = {}
}
