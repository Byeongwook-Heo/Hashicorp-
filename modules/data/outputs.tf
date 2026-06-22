output "identifier" {
  description = "RDS instance identifier."
  value       = aws_db_instance.this.identifier
}

output "endpoint" {
  description = "RDS endpoint."
  value       = aws_db_instance.this.endpoint
}

output "master_user_secret_arn" {
  description = "AWS Secrets Manager ARN for the managed master password."
  value       = try(aws_db_instance.this.master_user_secret[0].secret_arn, null)
  sensitive   = true
}

