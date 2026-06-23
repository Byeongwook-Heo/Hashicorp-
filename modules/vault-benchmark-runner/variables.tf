variable "name_prefix" {
  description = "Name prefix for benchmark runner resources."
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

variable "subnet_id" {
  description = "Private subnet ID for the benchmark runner."
  type        = string
}

variable "ami_id" {
  description = "Approved arm64 Ubuntu AMI ID."
  type        = string
}

variable "instance_type" {
  description = "EC2 instance type for the benchmark runner."
  type        = string
}

variable "key_name" {
  description = "EC2 key pair name."
  type        = string
}

variable "root_volume_size" {
  description = "Root EBS volume size in GiB."
  type        = number
}

variable "vault_addr" {
  description = "Vault API address used by benchmark tests."
  type        = string
}

variable "vault_init_parameter_name" {
  description = "SSM SecureString parameter containing Vault init output."
  type        = string
}

variable "vault_benchmark_version" {
  description = "vault-benchmark Git tag to build and install."
  type        = string
}

variable "go_version" {
  description = "Go version used to build vault-benchmark."
  type        = string
}

variable "tags" {
  description = "Tags to apply to resources."
  type        = map(string)
  default     = {}
}
