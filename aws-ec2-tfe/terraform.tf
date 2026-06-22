terraform {
  required_version = ">= 1.14.0"

  cloud {
    hostname     = "ec2-3-37-175-160.ap-northeast-2.compute.amazonaws.com"
    organization = "hashicorp-lab"

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
