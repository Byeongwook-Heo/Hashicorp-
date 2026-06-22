variable "aws_region" {
  description = "AWS region where the EC2 lab instance will be created."
  type        = string
  default     = "ap-northeast-2"
}

variable "ami_id" {
  description = "Approved arm64 Ubuntu 24.04 AMI ID to use for the lab EC2 instance. AMI IDs are region-specific."
  type        = string
  default     = "ami-0de44fe9c10f5cac7"

  validation {
    condition     = can(regex("^ami-[0-9a-f]+$", var.ami_id))
    error_message = "ami_id must look like an AWS AMI ID, for example ami-0de44fe9c10f5cac7."
  }
}

variable "name_prefix" {
  description = "Prefix used for AWS resource names."
  type        = string
  default     = "hashicorp-lab"
}

variable "instance_type" {
  description = "EC2 instance type for the lab server. The approved AMI is arm64, so use an ARM-compatible type such as t4g.2xlarge."
  type        = string
  default     = "t4g.2xlarge"
}

variable "vpc_id" {
  description = "Existing VPC ID to use. The current AWS session policy denies creating a new VPC."
  type        = string
  default     = "vpc-085f5bb3399430e3f"
}

variable "subnet_id" {
  description = "Existing public subnet ID where the EC2 instance will be launched."
  type        = string
  default     = "subnet-0f5fc48f84768a173"
}

variable "security_group_ids" {
  description = "Existing security group IDs to attach to the EC2 instance. The current AWS session policy denies creating new security groups."
  type        = list(string)
  default     = ["sg-0c1931fccdb2d3e3c"]
}

variable "key_name" {
  description = "Existing EC2 key pair name for SSH access."
  type        = string
  default     = "Byeongwook"
}

variable "default_tags" {
  description = "Default tags applied to all supported AWS resources."
  type        = map(string)
  default = {
    Project     = "hashicorp-enterprise-lab"
    Environment = "dev"
    ManagedBy   = "terraform-enterprise"
  }
}
