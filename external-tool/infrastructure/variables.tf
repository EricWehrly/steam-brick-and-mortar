# Input variables for the Steam API Lambda infrastructure

variable "environment" {
  description = "Environment name (dev, prod)"
  type        = string
  default     = "dev"

  validation {
    condition     = contains(["dev", "prod"], var.environment)
    error_message = "Environment must be either 'dev' or 'prod'."
  }
}

variable "project_name" {
  description = "Name of the project"
  type        = string
  default     = "steam-brick-and-mortar"
}

variable "aws_region" {
  description = "AWS region for resources"
  type        = string
  default     = "us-east-1"
}

variable "domain_name" {
  description = "Base domain name for the API (must already exist in Route 53)"
  type        = string
  # Example: "example.com" - will create "steam-api.example.com"
}

variable "route53_zone_id" {
  description = "Route 53 hosted zone ID for the domain (to avoid conflicts when multiple zones exist)"
  type        = string
  # Example: "Z338L3MCT403SF" - the specific zone ID to use
}

variable "api_subdomain" {
  description = "Subdomain for the Steam API"
  type        = string
  default     = "steam-api"
}

variable "allowed_origins" {
  description = "List of allowed CORS origins"
  type        = list(string)
  default = [
    "http://localhost:3000",
    "http://localhost:5173"
  ]
}

variable "lambda_timeout" {
  description = "Lambda function timeout in seconds"
  type        = number
  default     = 30

  validation {
    condition     = var.lambda_timeout >= 3 && var.lambda_timeout <= 900
    error_message = "Lambda timeout must be between 3 and 900 seconds."
  }
}

variable "lambda_memory_size" {
  description = "Lambda function memory size in MB"
  type        = number
  default     = 256

  validation {
    condition     = var.lambda_memory_size >= 128 && var.lambda_memory_size <= 10240
    error_message = "Lambda memory size must be between 128 and 10240 MB."
  }
}

variable "api_throttle_rate_limit" {
  description = "API Gateway throttle rate limit (requests per second)"
  type        = number
  default     = 1000
}

variable "api_throttle_burst_limit" {
  description = "API Gateway throttle burst limit"
  type        = number
  default     = 2000
}

# used for lambda
# variable "steam_api_key" {
#   description = "Steam Web API key (will be stored in Secrets Manager)"
#   type        = string
#   sensitive   = true
#   # This should be provided via environment variable or terraform.tfvars
# }

variable "cloudwatch_log_retention_days" {
  description = "CloudWatch log retention in days"
  type        = number
  default     = 14

  validation {
    condition = contains([
      1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1827, 3653
    ], var.cloudwatch_log_retention_days)
    error_message = "Log retention days must be a valid CloudWatch retention period."
  }
}
