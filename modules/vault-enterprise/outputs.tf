output "security_group_id" {
  description = "Vault security group ID."
  value       = aws_security_group.vault.id
}

output "kms_key_id" {
  description = "KMS key ID used for Vault auto-unseal."
  value       = aws_kms_key.vault_unseal.key_id
}

output "iam_role_name" {
  description = "Vault IAM role name."
  value       = aws_iam_role.vault.name
}

output "instance_ids" {
  description = "Vault EC2 instance IDs."
  value       = [for node in aws_instance.vault : node.id]
}

output "private_ips" {
  description = "Vault EC2 private IPs."
  value       = [for node in aws_instance.vault : node.private_ip]
}

output "private_api_urls" {
  description = "Vault private API URLs."
  value       = [for node in aws_instance.vault : "http://${node.private_ip}:8200"]
}

output "license_parameter_name" {
  description = "SSM SecureString parameter name containing the Vault Enterprise license."
  value       = var.vault_license_parameter_name
}

output "init_parameter_name" {
  description = "SSM SecureString parameter name containing the Vault init output."
  value       = var.vault_init_parameter_name
}

