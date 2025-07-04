# API Gateway HTTP API for Steam proxy

# API Gateway HTTP API
resource "aws_apigatewayv2_api" "steam_api" {
  name          = "${var.project_name}-${var.environment}-api"
  protocol_type = "HTTP"
  description   = "Steam Web API proxy for ${var.project_name}"

  cors_configuration {
    allow_origins     = var.allowed_origins
    allow_methods     = ["GET", "POST", "OPTIONS"]
    allow_headers     = ["content-type", "x-amz-date", "authorization", "x-api-key", "x-amz-security-token"]
    expose_headers    = ["x-amzn-requestid"]
    max_age          = 300
    allow_credentials = false
  }

  tags = var.tags
}

# Lambda integration
resource "aws_apigatewayv2_integration" "lambda_integration" {
  api_id               = aws_apigatewayv2_api.steam_api.id
  integration_type     = "AWS_PROXY"
  integration_uri      = var.lambda_invoke_arn
  integration_method   = "POST"
  payload_format_version = "2.0"
  timeout_milliseconds   = var.integration_timeout_ms
}

# Catch-all route to handle all paths
resource "aws_apigatewayv2_route" "default_route" {
  api_id    = aws_apigatewayv2_api.steam_api.id
  route_key = "ANY /{proxy+}"
  target    = "integrations/${aws_apigatewayv2_integration.lambda_integration.id}"
}

# Default stage
resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.steam_api.id
  name        = "$default"
  auto_deploy = true

  default_route_settings {
    throttling_rate_limit  = var.throttle_rate_limit
    throttling_burst_limit = var.throttle_burst_limit
  }

  tags = var.tags
}

# CloudWatch Log Group for API Gateway
resource "aws_cloudwatch_log_group" "api_logs" {
  name              = "/aws/apigateway/${aws_apigatewayv2_api.steam_api.name}"
  retention_in_days = var.log_retention_days

  tags = var.tags
}

# Lambda permission for API Gateway
resource "aws_lambda_permission" "api_gateway_invoke" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = var.lambda_function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.steam_api.execution_arn}/*/*"
}

# Custom domain integration - moved from domain module
# This is where API Gateway gets its custom domain

resource "aws_apigatewayv2_domain_name" "api_domain" {
  domain_name = var.api_domain_name

  domain_name_configuration {
    certificate_arn = var.certificate_arn
    endpoint_type   = "REGIONAL"
    security_policy = "TLS_1_2"
  }

  tags = var.tags
}

# API Gateway domain mapping
resource "aws_apigatewayv2_api_mapping" "api_mapping" {
  api_id      = aws_apigatewayv2_api.steam_api.id
  domain_name = aws_apigatewayv2_domain_name.api_domain.id
  stage       = aws_apigatewayv2_stage.default.name
}

# Route 53 record for the custom domain
resource "aws_route53_record" "api_domain" {
  name    = aws_apigatewayv2_domain_name.api_domain.domain_name
  type    = "A"
  zone_id = var.route53_zone_id

  alias {
    name                   = aws_apigatewayv2_domain_name.api_domain.domain_name_configuration[0].target_domain_name
    zone_id                = aws_apigatewayv2_domain_name.api_domain.domain_name_configuration[0].hosted_zone_id
    evaluate_target_health = false
  }
}

# Optional: AAAA record for IPv6 support
resource "aws_route53_record" "api_domain_ipv6" {
  count   = var.enable_ipv6 ? 1 : 0
  name    = aws_apigatewayv2_domain_name.api_domain.domain_name
  type    = "AAAA"
  zone_id = var.route53_zone_id

  alias {
    name                   = aws_apigatewayv2_domain_name.api_domain.domain_name_configuration[0].target_domain_name
    zone_id                = aws_apigatewayv2_domain_name.api_domain.domain_name_configuration[0].hosted_zone_id
    evaluate_target_health = false
  }
}
