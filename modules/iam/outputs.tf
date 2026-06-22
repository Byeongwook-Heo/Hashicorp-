output "instance_profile_name" {
  description = "EC2 IAM instance profile name."
  value       = aws_iam_instance_profile.ec2.name
}

output "role_name" {
  description = "EC2 IAM role name."
  value       = aws_iam_role.ec2.name
}

