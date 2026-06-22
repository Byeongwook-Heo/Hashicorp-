output "instance_id" {
  description = "ID of the EC2 instance."
  value       = aws_instance.this.id
}

output "instance_private_ip" {
  description = "Private IP address of the EC2 instance."
  value       = aws_instance.this.private_ip
}

output "instance_public_ip" {
  description = "Public IP address of the EC2 instance."
  value       = aws_instance.this.public_ip
}

output "security_group_id" {
  description = "Security group IDs attached to the EC2 instance."
  value       = aws_instance.this.vpc_security_group_ids
}

output "ssh_command" {
  description = "SSH command for connecting from this laptop."
  value       = "ssh -i ~/Downloads/Byeongwook.pem ubuntu@${aws_instance.this.public_ip}"
}
