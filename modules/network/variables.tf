variable "name_prefix" {
  description = "Name prefix for network resources."
  type        = string
}

variable "vpc_cidr" {
  description = "VPC CIDR block."
  type        = string
}

variable "azs" {
  description = "Availability Zones."
  type        = list(string)
}

variable "public_subnet_cidrs" {
  description = "Public subnet CIDRs."
  type        = list(string)
}

variable "app_private_subnet_cidrs" {
  description = "Application private subnet CIDRs."
  type        = list(string)
}

variable "db_private_subnet_cidrs" {
  description = "Database private subnet CIDRs."
  type        = list(string)
}

variable "create_nat_gateways" {
  description = "Create NAT gateways for application private subnets."
  type        = bool
  default     = true
}

variable "tags" {
  description = "Tags applied to network resources."
  type        = map(string)
  default     = {}
}

