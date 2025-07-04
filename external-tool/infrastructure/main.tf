# Main Terraform configuration for Steam API Lambda infrastructure

# Local values for computed configurations
locals {
  api_domain_name = "${var.api_subdomain}-${var.environment}.${var.domain_name}"
  
  common_tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "Terraform"
    CreatedAt   = timestamp()
  }
}

# AWS Provider configuration
provider "aws" {
  region = var.aws_region
}

# Lambda module
# (stashed in 'lambda-infra' and 'lambda')
# module "lambda" {
#   source = "./modules/lambda"

#   project_name        = var.project_name
#   environment         = var.environment
#   steam_api_key       = var.steam_api_key
#   timeout             = var.lambda_timeout
#   memory_size         = var.lambda_memory_size
#   log_retention_days  = var.cloudwatch_log_retention_days
#   lambda_source_dir   = "${path.module}/lambda-src"
#   allowed_origins     = var.allowed_origins
#   enable_function_url = false  # We'll use API Gateway instead

#   tags = local.common_tags
# }

# # API Gateway module
# (stashed in 'gateway' and 'gateway-infra')
# module "api_gateway" {
#   source = "./modules/api-gateway"

#   project_name            = var.project_name
#   environment             = var.environment
#   allowed_origins         = var.allowed_origins
#   throttle_rate_limit     = var.api_throttle_rate_limit
#   throttle_burst_limit    = var.api_throttle_burst_limit
#   log_retention_days      = var.cloudwatch_log_retention_days
#   lambda_invoke_arn       = module.lambda.function_invoke_arn
#   lambda_function_name    = module.lambda.function_name
#   integration_timeout_ms  = var.lambda_timeout * 1000

#   tags = local.common_tags

#   depends_on = [module.lambda]
# }

# Domain module  
# (stashed in 'domain-infra')
# module "domain" {
#   source = "./modules/domain"

#   domain_name      = var.domain_name
#   api_domain_name  = local.api_domain_name
#   api_gateway_id   = module.api_gateway.api_gateway_id
#   api_stage_name   = "$default"
#   enable_ipv6      = false

#   tags = local.common_tags

#   depends_on = [module.api_gateway]
# }

# Phase 1: Enable domain module for data source testing
# This module contains the Route53 zone lookup and certificate discovery
module "domain" {
  source = "./modules/domain"

  domain_name      = var.domain_name
  api_domain_name  = local.api_domain_name
  route53_zone_id  = var.route53_zone_id
  enable_ipv6      = false

  # Note: API Gateway integration will be added in later phases
  # For now, this module only does data source discovery

  tags = local.common_tags
}
