data "aws_caller_identity" "current" {}
data "aws_partition" "current" {}

data "aws_vpc" "selected" {
  id = var.vpc_id
}

data "aws_ami" "vault" {
  owners      = [var.vault_ami_owner]
  most_recent = true

  filter {
    name   = "image-id"
    values = [var.vault_ami_id]
  }

  filter {
    name   = "architecture"
    values = ["x86_64"]
  }

  filter {
    name   = "name"
    values = ["hc-base-*", "hc-security-base-*"]
  }

  filter {
    name   = "state"
    values = ["available"]
  }
}

data "aws_security_group" "codebuild" {
  filter {
    name   = "tag:Name"
    values = ["${var.project_name}-codebuild"]
  }

  filter {
    name   = "vpc-id"
    values = [var.vpc_id]
  }
}

data "aws_ssm_parameter" "allowed_source_cidrs" {
  name            = "/${var.project_name}/allowed-source-cidrs"
  with_decryption = false
}

data "aws_ecr_repository" "app" {
  name = var.project_name
}

data "aws_ssm_parameter" "image_uri" {
  count           = var.deploy_service ? 1 : 0
  name            = "/${var.project_name}/image-uri"
  with_decryption = false
}

data "aws_ssm_parameter" "vault_ca" {
  count           = var.deploy_service ? 1 : 0
  name            = "/${var.project_name}/vault/ca-pem"
  with_decryption = false
}

data "aws_secretsmanager_secret" "transport_token" {
  count = var.deploy_service ? 1 : 0
  name  = "${var.project_name}/mcp/transport-token"
}

locals {
  fqdn                 = "${var.hostname}.${var.public_zone_name}"
  allowed_source_cidrs = split(",", nonsensitive(data.aws_ssm_parameter.allowed_source_cidrs.value))
  full_identity_mode   = var.deploy_service && var.app_mode == "aws"
}

data "aws_ssm_parameter" "verify_token_url" {
  count           = local.full_identity_mode ? 1 : 0
  name            = "/${var.project_name}/verify/token-url"
  with_decryption = false
}

data "aws_ssm_parameter" "verify_jwks_url" {
  count           = local.full_identity_mode ? 1 : 0
  name            = "/${var.project_name}/verify/jwks-url"
  with_decryption = false
}

data "aws_ssm_parameter" "verify_issuer" {
  count           = local.full_identity_mode ? 1 : 0
  name            = "/${var.project_name}/verify/issuer"
  with_decryption = false
}

data "aws_ssm_parameter" "verify_audience" {
  count           = local.full_identity_mode ? 1 : 0
  name            = "/${var.project_name}/verify/audience"
  with_decryption = false
}

data "aws_ssm_parameter" "verify_client_id" {
  count           = local.full_identity_mode ? 1 : 0
  name            = "/${var.project_name}/verify/client-id"
  with_decryption = false
}

data "aws_ssm_parameter" "verify_scope" {
  count           = local.full_identity_mode ? 1 : 0
  name            = "/${var.project_name}/verify/scope"
  with_decryption = false
}

data "aws_ssm_parameter" "verify_nhi_claim" {
  count           = local.full_identity_mode ? 1 : 0
  name            = "/${var.project_name}/verify/nhi-claim"
  with_decryption = false
}

data "aws_ssm_parameter" "verify_nhi_value" {
  count           = local.full_identity_mode ? 1 : 0
  name            = "/${var.project_name}/verify/nhi-value"
  with_decryption = false
}
