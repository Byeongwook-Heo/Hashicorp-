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

