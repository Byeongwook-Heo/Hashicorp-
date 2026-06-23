output "alb_dns_name" {
  description = "Keycloak public ALB DNS name."
  value       = aws_lb.this.dns_name
}

output "alb_arn" {
  description = "Keycloak ALB ARN."
  value       = aws_lb.this.arn
}

output "url" {
  description = "Keycloak public URL."
  value       = "http://${aws_lb.this.dns_name}"
}

output "autoscaling_group_name" {
  description = "Keycloak Auto Scaling Group name."
  value       = aws_autoscaling_group.this.name
}

output "db_endpoint" {
  description = "Keycloak RDS endpoint."
  value       = aws_db_instance.this.endpoint
}

output "admin_secret_arn" {
  description = "Secrets Manager secret ARN containing Keycloak bootstrap admin credentials."
  value       = aws_secretsmanager_secret.admin.arn
  sensitive   = true
}

output "db_secret_arn" {
  description = "Secrets Manager secret ARN containing Keycloak database credentials."
  value       = aws_db_instance.this.master_user_secret[0].secret_arn
  sensitive   = true
}

output "security_group_id" {
  description = "Keycloak instance security group ID."
  value       = aws_security_group.keycloak.id
}
