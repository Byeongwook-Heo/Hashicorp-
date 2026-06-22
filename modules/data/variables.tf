variable "name_prefix" {
  description = "Name prefix for data resources."
  type        = string
}

variable "subnet_ids" {
  description = "Database subnet IDs."
  type        = list(string)
}

variable "security_group_ids" {
  description = "Database security group IDs."
  type        = list(string)
}

variable "db_name" {
  description = "Initial database name."
  type        = string
}

variable "db_username" {
  description = "Master username."
  type        = string
}

variable "db_instance_class" {
  description = "RDS instance class."
  type        = string
}

variable "allocated_storage" {
  description = "Initial storage in GiB."
  type        = number
}

variable "max_allocated_storage" {
  description = "Maximum autoscaled storage in GiB."
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
  description = "Enable deletion protection."
  type        = bool
}

variable "skip_final_snapshot" {
  description = "Skip final snapshot on destroy."
  type        = bool
}

variable "tags" {
  description = "Tags applied to data resources."
  type        = map(string)
  default     = {}
}

