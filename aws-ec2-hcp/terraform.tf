terraform {
  required_version = ">= 1.14.0"

  cloud {
    hostname     = "app.terraform.io"
    organization = "hashicorp_lab"

    workspaces {
      name = "aws-ec2-dev"
    }
  }

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}
