variable "name_prefix" {
  description = "Name prefix for IAM resources."
  type        = string
}

variable "tags" {
  description = "Tags applied to IAM resources."
  type        = map(string)
  default     = {}
}

