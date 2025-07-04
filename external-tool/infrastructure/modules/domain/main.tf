# Domain and SSL certificate management for Steam API

# Data source to get the existing hosted zone
data "aws_route53_zone" "main" {
  zone_id = var.route53_zone_id
}

# Use existing wildcard certificate
data "aws_acm_certificate" "wildcard" {
  domain      = "*.${var.domain_name}"
  types       = ["AMAZON_ISSUED"]
  most_recent = true
  statuses    = ["ISSUED"]
}

# Local value for certificate ARN
locals {
  certificate_arn = data.aws_acm_certificate.wildcard.arn
}

# API Gateway integration resources - Phase 2+ (commented out for Phase 1)
# These will be uncommented when we add API Gateway module integration

# # API Gateway custom domain name (only create if api_gateway_id is provided)
# resource "aws_apigatewayv2_domain_name" "api_domain" {
#   count       = var.api_gateway_id != null ? 1 : 0
#   domain_name = var.api_domain_name

#   domain_name_configuration {
#     certificate_arn = local.certificate_arn
#     endpoint_type   = "REGIONAL"
#     security_policy = "TLS_1_2"
#   }

#   depends_on = [
#     data.aws_acm_certificate.wildcard
#   ]

#   tags = var.tags
# }

# # API Gateway domain mapping (only create if api_gateway_id is provided)
# resource "aws_apigatewayv2_api_mapping" "api_mapping" {
#   count       = var.api_gateway_id != null ? 1 : 0
#   api_id      = var.api_gateway_id
#   domain_name = aws_apigatewayv2_domain_name.api_domain[0].id
#   stage       = var.api_stage_name
# }

# # Route 53 record for the custom domain (only create if api_gateway_id is provided)
# resource "aws_route53_record" "api_domain" {
#   count   = var.api_gateway_id != null ? 1 : 0
#   name    = aws_apigatewayv2_domain_name.api_domain[0].domain_name
#   type    = "A"
#   zone_id = data.aws_route53_zone.main.zone_id

#   alias {
#     name                   = aws_apigatewayv2_domain_name.api_domain[0].target_domain_name
#     zone_id                = aws_apigatewayv2_domain_name.api_domain[0].hosted_zone_id
#     evaluate_target_health = false
#   }
# }

# # Optional: AAAA record for IPv6 support (only create if api_gateway_id is provided)
# resource "aws_route53_record" "api_domain_ipv6" {
#   count   = var.api_gateway_id != null && var.enable_ipv6 ? 1 : 0
#   name    = aws_apigatewayv2_domain_name.api_domain[0].domain_name
#   type    = "AAAA"
#   zone_id = data.aws_route53_zone.main.zone_id

#   alias {
#     name                   = aws_apigatewayv2_domain_name.api_domain[0].target_domain_name
#     zone_id                = aws_apigatewayv2_domain_name.api_domain[0].hosted_zone_id
#     evaluate_target_health = false
#   }
# }
