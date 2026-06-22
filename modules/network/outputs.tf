output "vpc_id" {
  description = "VPC ID."
  value       = aws_vpc.this.id
}

output "public_subnet_ids" {
  description = "Public subnet IDs."
  value       = values(aws_subnet.public)[*].id
}

output "app_private_subnet_ids" {
  description = "Application private subnet IDs."
  value       = values(aws_subnet.app_private)[*].id
}

output "db_private_subnet_ids" {
  description = "Database private subnet IDs."
  value       = values(aws_subnet.db_private)[*].id
}

