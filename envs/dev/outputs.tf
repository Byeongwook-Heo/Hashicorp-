output "vpc_id" {
  description = "VPC ID."
  value       = module.network.vpc_id
}

output "alb_dns_name" {
  description = "Application Load Balancer DNS name."
  value       = module.alb.dns_name
}

output "app_autoscaling_group_name" {
  description = "Application Auto Scaling Group name."
  value       = module.compute.autoscaling_group_name
}

output "rds_endpoint" {
  description = "RDS endpoint."
  value       = module.data.endpoint
}

output "rds_secret_arn" {
  description = "AWS Secrets Manager secret ARN for the managed RDS master password."
  value       = module.data.master_user_secret_arn
  sensitive   = true
}

output "vault_instance_ids" {
  description = "Vault Enterprise EC2 instance IDs."
  value       = module.vault_enterprise.instance_ids
}

output "vault_private_ips" {
  description = "Vault Enterprise private IPs."
  value       = module.vault_enterprise.private_ips
}

output "vault_private_api_urls" {
  description = "Vault Enterprise private API URLs."
  value       = module.vault_enterprise.private_api_urls
}

output "vault_init_parameter_name" {
  description = "SSM SecureString parameter name containing Vault init output."
  value       = module.vault_enterprise.init_parameter_name
}

output "keycloak_url" {
  description = "Keycloak public URL."
  value       = module.keycloak.url
}

output "keycloak_autoscaling_group_name" {
  description = "Keycloak Auto Scaling Group name."
  value       = module.keycloak.autoscaling_group_name
}

output "keycloak_db_endpoint" {
  description = "Keycloak PostgreSQL endpoint."
  value       = module.keycloak.db_endpoint
}

output "keycloak_admin_secret_arn" {
  description = "Secrets Manager secret ARN containing Keycloak bootstrap admin credentials."
  value       = module.keycloak.admin_secret_arn
  sensitive   = true
}

output "mcp_api_endpoint" {
  description = "Public API Gateway endpoint for MCP server."
  value       = module.mcp_server.api_endpoint
}

output "mcp_internal_alb_dns_name" {
  description = "Internal ALB DNS name for MCP server."
  value       = module.mcp_server.internal_alb_dns_name
}

output "mcp_autoscaling_group_name" {
  description = "MCP server Auto Scaling Group name."
  value       = module.mcp_server.autoscaling_group_name
}
