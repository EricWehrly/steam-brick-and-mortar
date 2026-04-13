# Lambda function for SteamSpy Hydrator

# IAM role for Lambda execution
resource "aws_iam_role" "lambda_execution" {
  name = "${var.project_name}-${var.environment}-hydrator-lambda-role"

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

# Custom policy for S3 cache access
resource "aws_iam_role_policy" "lambda_s3_policy" {
  name = "${var.project_name}-${var.environment}-hydrator-lambda-s3-policy"
  role = aws_iam_role.lambda_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject"
        ]
        Resource = "${var.cache_bucket_arn}/*"
      },
      {
        Effect = "Allow"
        Action = [
          "s3:ListBucket"
        ]
        Resource = var.cache_bucket_arn
      }
    ]
  })
}

# CloudWatch Log Group for Lambda
resource "aws_cloudwatch_log_group" "lambda_logs" {
  name              = "/aws/lambda/${var.project_name}-${var.environment}-steamspy-hydrator"
  retention_in_days = var.log_retention_days

  tags = var.tags
}

# Run yarn install before zipping
resource "null_resource" "yarn_install" {
  triggers = {
    package_json = filemd5("${var.lambda_source_dir}/package.json")
  }

  provisioner "local-exec" {
    command     = "cd ${var.lambda_source_dir}; yarn install --production"
    interpreter = ["powershell", "-Command"]
  }
}

# Create deployment package from source code
data "archive_file" "lambda_zip" {
  type        = "zip"
  source_dir  = var.lambda_source_dir
  output_path = "${path.module}/lambda_function.zip"

  depends_on = [null_resource.yarn_install]
}

# Lambda function
resource "aws_lambda_function" "steamspy_hydrator" {
  filename         = data.archive_file.lambda_zip.output_path
  function_name    = "${var.project_name}-${var.environment}-steamspy-hydrator"
  role            = aws_iam_role.lambda_execution.arn
  handler         = "index.handler"
  source_code_hash = data.archive_file.lambda_zip.output_base64sha256
  runtime         = "nodejs20.x"
  timeout         = var.timeout
  memory_size     = var.memory_size
  
  # Note: Reserved concurrency is disabled because the AWS account quota 
  # currently doesn't allow decreasing unreserved concurrency below 10.
  # We handle singleton locking within the JS handler instead.
  # reserved_concurrent_executions = 1

  environment {
    variables = {
      ENVIRONMENT                 = var.environment
      CACHE_BUCKET_NAME          = var.cache_bucket_name
    }
  }

  depends_on = [
    aws_iam_role_policy_attachment.lambda_basic_execution,
    aws_cloudwatch_log_group.lambda_logs,
  ]

  tags = var.tags
}
