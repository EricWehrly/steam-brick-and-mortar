# Lambda function for Steam API proxy

# IAM role for Lambda execution
resource "aws_iam_role" "lambda_execution" {
  name = "${var.project_name}-${var.environment}-lambda-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })

  tags = var.tags
}

# Basic Lambda execution policy
resource "aws_iam_role_policy_attachment" "lambda_basic_execution" {
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
  role       = aws_iam_role.lambda_execution.name
}

# Custom policy for Secrets Manager access
resource "aws_iam_role_policy" "lambda_secrets_policy" {
  name = "${var.project_name}-${var.environment}-lambda-secrets-policy"
  role = aws_iam_role.lambda_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue"
        ]
        Resource = aws_secretsmanager_secret.steam_api_key.arn
      }
    ]
  })
}

# Secrets Manager secret for Steam API key
resource "aws_secretsmanager_secret" "steam_api_key" {
  name        = "${var.project_name}-${var.environment}-steam-api-key"
  description = "Steam Web API key for ${var.project_name}"

  tags = var.tags
}

# Store the Steam API key value
resource "aws_secretsmanager_secret_version" "steam_api_key" {
  secret_id     = aws_secretsmanager_secret.steam_api_key.id
  secret_string = jsonencode({
    steam_api_key = var.steam_api_key
  })
}

# CloudWatch Log Group for Lambda
resource "aws_cloudwatch_log_group" "lambda_logs" {
  name              = "/aws/lambda/${var.project_name}-${var.environment}-steam-proxy"
  retention_in_days = var.log_retention_days

  tags = var.tags
}

# Create deployment package from source code
data "archive_file" "lambda_zip" {
  type        = "zip"
  source_dir  = var.lambda_source_dir
  output_path = "${path.module}/lambda_function.zip"
}

# Lambda function
resource "aws_lambda_function" "steam_proxy" {
  filename         = data.archive_file.lambda_zip.output_path
  function_name    = "${var.project_name}-${var.environment}-steam-proxy"
  role            = aws_iam_role.lambda_execution.arn
  handler         = "index.handler"
  source_code_hash = data.archive_file.lambda_zip.output_base64sha256
  runtime         = "nodejs20.x"
  timeout         = var.timeout
  memory_size     = var.memory_size

  environment {
    variables = {
      SECRETS_MANAGER_SECRET_NAME = aws_secretsmanager_secret.steam_api_key.name
      ENVIRONMENT                 = var.environment
      ALLOWED_ORIGINS            = jsonencode(var.allowed_origins)
    }
  }

  depends_on = [
    aws_iam_role_policy_attachment.lambda_basic_execution,
    aws_cloudwatch_log_group.lambda_logs,
  ]

  tags = var.tags
}

# Lambda function URL (alternative to API Gateway for simpler setups)
resource "aws_lambda_function_url" "steam_proxy_url" {
  count              = var.enable_function_url ? 1 : 0
  function_name      = aws_lambda_function.steam_proxy.function_name
  authorization_type = "NONE"

  cors {
    allow_credentials = false
    allow_headers     = ["date", "keep-alive"]
    allow_methods     = ["*"]
    allow_origins     = var.allowed_origins
    expose_headers    = ["date", "keep-alive"]
    max_age          = 86400
  }
}
