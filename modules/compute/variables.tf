variable "name_prefix" {
  description = "Name prefix for compute resources."
  type        = string
}

variable "ami_id" {
  description = "AMI ID for application instances."
  type        = string
}

variable "instance_type" {
  description = "EC2 instance type."
  type        = string
}

variable "key_name" {
  description = "EC2 key pair name."
  type        = string
  default     = null
}

variable "subnet_ids" {
  description = "Private subnet IDs for the Auto Scaling Group."
  type        = list(string)
}

variable "security_group_ids" {
  description = "Security group IDs attached to application instances."
  type        = list(string)
}

variable "iam_instance_profile_name" {
  description = "IAM instance profile name."
  type        = string
}

variable "target_group_arns" {
  description = "ALB target group ARNs."
  type        = list(string)
}

variable "desired_capacity" {
  description = "Desired capacity."
  type        = number
}

variable "min_size" {
  description = "Minimum capacity."
  type        = number
}

variable "max_size" {
  description = "Maximum capacity."
  type        = number
}

variable "root_volume_size" {
  description = "Root EBS volume size in GiB."
  type        = number
  default     = 100
}

variable "user_data" {
  description = "Cloud-init user data."
  type        = string
  default     = ""
}

variable "tags" {
  description = "Tags applied to compute resources."
  type        = map(string)
  default     = {}
}

