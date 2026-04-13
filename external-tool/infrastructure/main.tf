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

# S3 cache module - Phase 2.5: Storage for game data caching
module "s3_cache" {
  source = "./modules/s3-cache"

  project_name           = var.project_name
  environment            = var.environment
  cache_expiration_days  = 90
  enable_expiration      = false  # Keep cache indefinitely for now

  tags = local.common_tags
}

# Lambda module - Phase 2: Lambda function
module "lambda" {
  source = "./modules/lambda"

  project_name        = var.project_name
  environment         = var.environment
  steam_api_key       = var.steam_api_key
  timeout             = var.lambda_timeout
  memory_size         = var.lambda_memory_size
  log_retention_days  = var.cloudwatch_log_retention_days
  lambda_source_dir   = "${path.module}/lambda-src"
  allowed_origins     = var.allowed_origins
  enable_function_url = false  # We'll use API Gateway instead
  cache_bucket_name   = module.s3_cache.bucket_name
  cache_bucket_arn    = module.s3_cache.bucket_arn
  hydrator_lambda_name = module.lambda_hydrator.function_name

  tags = local.common_tags

  depends_on = [module.s3_cache, module.lambda_hydrator]
}

# Hydrator Lambda module - Background task for SteamSpy data
module "lambda_hydrator" {
  source = "./modules/lambda-hydrator"

  project_name        = var.project_name
  environment         = var.environment
  timeout             = 300 # 5 minutes for batch mode headroom
  memory_size         = var.lambda_memory_size
  log_retention_days  = var.cloudwatch_log_retention_days
  lambda_source_dir   = "${path.module}/lambda-hydrator-src"
  cache_bucket_name   = module.s3_cache.bucket_name
  cache_bucket_arn    = module.s3_cache.bucket_arn

  tags = local.common_tags

  depends_on = [module.s3_cache]
}

# API Gateway module - Phase 3: API Gateway integration
module "api_gateway" {
  source = "./modules/api-gateway"

  project_name            = var.project_name
  environment             = var.environment
  api_domain_name         = local.api_domain_name
  certificate_arn         = module.domain.certificate_arn
  route53_zone_id         = var.route53_zone_id
  allowed_origins         = var.allowed_origins
  throttle_rate_limit     = var.api_throttle_rate_limit
  throttle_burst_limit    = var.api_throttle_burst_limit
  log_retention_days      = var.cloudwatch_log_retention_days
  lambda_invoke_arn       = module.lambda.function_invoke_arn
  lambda_function_name    = module.lambda.function_name
  integration_timeout_ms  = var.lambda_timeout * 1000

  tags = local.common_tags

  depends_on = [module.lambda]
}

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
