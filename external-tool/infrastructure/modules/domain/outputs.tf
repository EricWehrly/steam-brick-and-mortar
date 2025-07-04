# Output values for the domain module

output "certificate_arn" {
  description = "ARN of the wildcard SSL certificate"
  value       = data.aws_acm_certificate.wildcard.arn
}

output "certificate_domain" {
  description = "Domain name of the SSL certificate"
  value       = data.aws_acm_certificate.wildcard.domain
}

output "route53_zone_id" {
  description = "Route 53 hosted zone ID"
  value       = data.aws_route53_zone.main.zone_id
}

output "route53_zone_name" {
  description = "Route 53 hosted zone name"
  value       = data.aws_route53_zone.main.name
}

# API Gateway outputs (Phase 2+ - commented out for now)
# These will be uncommented when API Gateway resources are added

# output "api_domain_url" {
#   description = "Full HTTPS URL for the API domain (if API Gateway is configured)"
#   value       = var.api_gateway_id != null ? "https://${aws_apigatewayv2_domain_name.api_domain[0].domain_name}" : null
# }

# output "api_domain_name" {
#   description = "API domain name (if API Gateway is configured)"
#   value       = var.api_gateway_id != null ? aws_apigatewayv2_domain_name.api_domain[0].domain_name : null
# }

# output "domain_name_configuration" {
#   description = "Domain name configuration details (if API Gateway is configured)"
#   value = var.api_gateway_id != null ? {
#     target_domain_name = aws_apigatewayv2_domain_name.api_domain[0].domain_name_configuration[0].target_domain_name
#     hosted_zone_id     = aws_apigatewayv2_domain_name.api_domain[0].domain_name_configuration[0].hosted_zone_id
#     endpoint_type      = aws_apigatewayv2_domain_name.api_domain[0].domain_name_configuration[0].endpoint_type
#   } : null
# }
