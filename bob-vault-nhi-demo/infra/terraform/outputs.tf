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
