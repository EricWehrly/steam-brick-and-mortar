# Output values for the Steam API Lambda infrastructure
# Phase 1: Data Source Discovery Outputs

# Domain and certificate discovery (Phase 1 baseline)
output "route53_zone_id" {
  description = "Route 53 hosted zone ID for the domain"
  value       = module.domain.route53_zone_id
}

output "route53_zone_name" {
  description = "Route 53 hosted zone name"
  value       = module.domain.route53_zone_name
}

output "certificate_arn" {
  description = "ARN of the wildcard SSL certificate"
  value       = module.domain.certificate_arn
}

output "certificate_domain" {
  description = "Domain name of the SSL certificate"
  value       = module.domain.certificate_domain
}

# Configuration outputs
output "environment" {
  description = "Environment name"
  value       = var.environment
}

output "project_name" {
  description = "Project name"
  value       = var.project_name
}

output "api_domain_name" {
  description = "Computed API domain name (will be used when modules are enabled)"
  value       = local.api_domain_name
}

# Future module outputs (commented out until modules are enabled)
# output "api_gateway_url" {
#   description = "Base URL for the API Gateway"
#   value       = module.api_gateway.stage_invoke_url
# }

# output "api_custom_domain_url" {
#   description = "Custom domain URL for the API"
#   value       = module.domain.api_domain_url
# }

# output "lambda_function_name" {
#   description = "Name of the Lambda function"
#   value       = module.lambda.function_name
# }

# output "lambda_function_arn" {
#   description = "ARN of the Lambda function"
#   value       = module.lambda.function_arn
# }

# output "lambda_log_group_name" {
#   description = "CloudWatch log group name for Lambda"
#   value       = module.lambda.log_group_name
# }

# output "secrets_manager_arn" {
#   description = "ARN of the Secrets Manager secret for Steam API key"
#   value       = module.lambda.secrets_manager_arn
# }

# output "api_gateway_id" {
#   description = "ID of the API Gateway"
#   value       = module.api_gateway.api_gateway_id
# }

# Environment-specific outputs
# output "environment" {
#   description = "Environment name"
#   value       = var.environment
# }

output "full_domain_name" {
  description = "Full domain name for the API"
  value       = "${var.api_subdomain}-${var.environment}.${var.domain_name}"
}

# # API endpoint documentation
# output "api_endpoints" {
#   description = "Available API endpoints"
#   value = {
#     health      = "${module.domain.api_domain_url}/health"
#     get_games   = "${module.domain.api_domain_url}/games/{steamid}"
#     resolve_url = "${module.domain.api_domain_url}/resolve/{vanityurl}"
#     test        = "${module.domain.api_domain_url}/test"
#   }
# }

# # Development information
# output "development_info" {
#   description = "Information for development and testing"
#   value = {
#     cors_origins_allowed = var.allowed_origins
#     rate_limit          = var.api_throttle_rate_limit
#     burst_limit         = var.api_throttle_burst_limit
#     lambda_timeout      = var.lambda_timeout
#     lambda_memory       = var.lambda_memory_size
#   }
# }
