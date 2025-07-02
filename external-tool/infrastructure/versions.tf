# Terraform version and provider requirements
terraform {
  required_version = ">= 1.0"
  
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.0"
    }
  }

  # Uncomment and configure for production deployment
  # backend "s3" {
  #   bucket = "your-terraform-state-bucket"
  #   key    = "steam-brick-and-mortar/terraform.tfstate"
  #   region = "us-east-1"
  # }
}
