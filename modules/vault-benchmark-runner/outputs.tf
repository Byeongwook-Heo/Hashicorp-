output "instance_id" {
  description = "Benchmark runner EC2 instance ID."
  value       = aws_instance.this.id
}

output "private_ip" {
  description = "Benchmark runner private IP."
  value       = aws_instance.this.private_ip
}

output "security_group_id" {
  description = "Benchmark runner security group ID."
  value       = aws_security_group.this.id
}

output "instance_profile_name" {
  description = "Benchmark runner IAM instance profile name."
  value       = aws_iam_instance_profile.this.name
}
