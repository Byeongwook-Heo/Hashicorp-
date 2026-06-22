variable "name_prefix" {
  description = "Name prefix for security resources."
  type        = string
}

variable "vpc_id" {
  description = "VPC ID."
  type        = string
}

variable "app_port" {
  description = "Application port."
  type        = number
}

variable "db_port" {
  description = "Database port."
  type        = number
}

variable "allowed_http_cidrs" {
  description = "CIDRs allowed to access the ALB."
  type        = list(string)
}

variable "allow_app_egress" {
  description = "Allow outbound traffic from application instances."
  type        = bool
  default     = true
}

variable "allow_database_egress" {
  description = "Allow outbound traffic from database security group."
  type        = bool
  default     = false
}

variable "tags" {
  description = "Tags applied to security resources."
  type        = map(string)
  default     = {}
}

