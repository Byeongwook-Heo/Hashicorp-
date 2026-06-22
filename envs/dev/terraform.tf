terraform {
  required_version = ">= 1.14.0"

  cloud {
    hostname     = "app.terraform.io"
    organization = "hashicorp_lab"

    workspaces {
      name = "hashicorp_lab-enterprise-dev"
    }
  }

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

