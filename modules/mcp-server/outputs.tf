output "api_endpoint" {
  description = "Public API Gateway endpoint for the MCP server."
  value       = aws_apigatewayv2_api.this.api_endpoint
}

output "api_id" {
  description = "API Gateway HTTP API ID."
  value       = aws_apigatewayv2_api.this.id
}

output "internal_alb_dns_name" {
  description = "Internal ALB DNS name for MCP server traffic."
  value       = aws_lb.this.dns_name
}

output "autoscaling_group_name" {
  description = "MCP server Auto Scaling Group name."
  value       = aws_autoscaling_group.this.name
}

output "target_group_arn" {
  description = "MCP server target group ARN."
  value       = aws_lb_target_group.this.arn
}
