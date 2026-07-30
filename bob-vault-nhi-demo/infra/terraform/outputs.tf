output "public_url" {
  description = "Bob MCP endpoint and operations dashboard."
  value       = "https://${local.fqdn}"
}

output "mcp_endpoint" {
  value = "https://${local.fqdn}/mcp"
}

output "vault_instance_id" {
  value = aws_instance.vault.id
}

output "vault_private_address" {
  value = "https://${aws_route53_record.vault_private.fqdn}:8200"
}

output "rds_endpoint" {
  value = aws_db_instance.orders.address
}

output "verify_signing_key_arn" {
  value = aws_kms_key.verify_signing.arn
}

output "verify_public_jwks_url" {
  value = "https://${local.fqdn}/.well-known/jwks.json"
}

output "event_operator_role_arn" {
  description = "Time-bounded role for audited Session Manager access to the Vault EC2 instance."
  value       = aws_iam_role.event_operator.arn
}

output "event_operator_session_document" {
  description = "Required Session Manager document; SSH and port-forward documents are intentionally not granted."
  value       = aws_ssm_document.event_operator_shell.name
}

output "event_operator_access_expires_at" {
  value = var.event_access_expires_at
}

output "event_operator_session_log_group" {
  value = aws_cloudwatch_log_group.ssm_sessions.name
}
