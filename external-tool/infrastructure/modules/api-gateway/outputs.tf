# Output values for the API Gateway module

output "api_gateway_id" {
  description = "ID of the API Gateway"
  value       = aws_apigatewayv2_api.steam_api.id
}

output "api_gateway_arn" {
  description = "ARN of the API Gateway"
  value       = aws_apigatewayv2_api.steam_api.arn
}

output "api_gateway_endpoint" {
  description = "Default endpoint URL of the API Gateway"
  value       = aws_apigatewayv2_api.steam_api.api_endpoint
}

output "custom_domain_url" {
  description = "Custom domain URL for the API"
  value       = "https://${aws_apigatewayv2_domain_name.api_domain.domain_name}"
}

output "api_domain_name" {
  description = "Custom domain name"
  value       = aws_apigatewayv2_domain_name.api_domain.domain_name
}

output "stage_name" {
  description = "API Gateway stage name"
  value       = aws_apigatewayv2_stage.default.name
}

output "log_group_name" {
  description = "CloudWatch log group name"
  value       = aws_cloudwatch_log_group.api_logs.name
}

output "domain_name_configuration" {
  description = "Domain name configuration details"
  value = {
    target_domain_name = aws_apigatewayv2_domain_name.api_domain.domain_name_configuration[0].target_domain_name
    hosted_zone_id     = aws_apigatewayv2_domain_name.api_domain.domain_name_configuration[0].hosted_zone_id
    endpoint_type      = aws_apigatewayv2_domain_name.api_domain.domain_name_configuration[0].endpoint_type
  }
}
