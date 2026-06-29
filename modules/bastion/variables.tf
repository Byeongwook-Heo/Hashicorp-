variable "name_prefix" {
  description = "Name prefix for bastion resources."
  type        = string
}

variable "aws_region" {
  description = "AWS region."
  type        = string
}

variable "ami_id" {
  description = "Approved AMI ID for the bastion host."
  type        = string
}

variable "instance_type" {
  description = "EC2 instance type for the bastion host."
  type        = string
}

variable "key_name" {
  description = "Existing EC2 key pair name."
  type        = string
}

variable "subnet_id" {
  description = "Public subnet ID for the bastion host."
  type        = string
}

variable "vpc_id" {
  description = "VPC ID."
  type        = string
}

variable "allowed_ssh_cidrs" {
  description = "CIDR blocks allowed to SSH to the bastion host."
  type        = list(string)
}

variable "root_volume_size" {
  description = "Root EBS volume size in GiB."
  type        = number
  default     = 100
}

variable "tags" {
  description = "Tags applied to bastion resources."
  type        = map(string)
  default     = {}
}
