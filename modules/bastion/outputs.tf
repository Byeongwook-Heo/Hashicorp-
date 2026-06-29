output "instance_id" {
  description = "Bastion EC2 instance ID."
  value       = aws_instance.this.id
}

output "public_ip" {
  description = "Bastion public IP address."
  value       = aws_instance.this.public_ip
}

output "private_ip" {
  description = "Bastion private IP address."
  value       = aws_instance.this.private_ip
}

output "security_group_id" {
  description = "Bastion security group ID."
  value       = aws_security_group.this.id
}

output "iam_role_name" {
  description = "Bastion IAM role name."
  value       = aws_iam_role.this.name
}

output "instance_profile_name" {
  description = "Bastion IAM instance profile name."
  value       = aws_iam_instance_profile.this.name
}
