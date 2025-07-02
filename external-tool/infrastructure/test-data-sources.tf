# Minimal Terraform test for data lookups only
# This file tests Route 53 zone and ACM certificate discovery without creating resources

# Note: Provider configuration is in versions.tf

# Test: Find existing Route 53 hosted zone (public only, by zone ID to avoid ambiguity)
data "aws_route53_zone" "main" {
  zone_id = var.route53_zone_id
}

# Test: Find existing wildcard certificate (if it exists)
data "aws_acm_certificate" "wildcard" {
  count       = var.test_wildcard_cert ? 1 : 0
  domain      = "*.${var.domain_name}"
  types       = ["AMAZON_ISSUED"]
  most_recent = true
  statuses    = ["ISSUED"]
}

# Alternative: Find certificate by exact domain match  
data "aws_acm_certificate" "exact_domain" {
  count       = var.test_exact_cert ? 1 : 0
  domain      = var.domain_name
  types       = ["AMAZON_ISSUED"]
  most_recent = true
  statuses    = ["ISSUED"]
}

# Variables for testing
variable "domain_name" {
  description = "Your existing domain name"
  type        = string
  # Will be provided via command line or tfvars
}

variable "route53_zone_id" {
  description = "Route 53 hosted zone ID to use (to avoid ambiguity with multiple zones)"
  type        = string
  # Will be provided via command line or tfvars
}

variable "test_wildcard_cert" {
  description = "Whether to test for wildcard certificate"
  type        = bool
  default     = true
}

variable "test_exact_cert" {
  description = "Whether to test for exact domain certificate"
  type        = bool
  default     = false
}

# Outputs to verify what we found
output "route53_zone_info" {
  description = "Information about the found Route 53 zone"
  value = {
    zone_id = data.aws_route53_zone.main.zone_id
    name    = data.aws_route53_zone.main.name
    comment = data.aws_route53_zone.main.comment
  }
}

output "wildcard_certificate_info" {
  description = "Information about the wildcard certificate (if found)"
  value = length(data.aws_acm_certificate.wildcard) > 0 ? {
    arn    = data.aws_acm_certificate.wildcard[0].arn
    domain = data.aws_acm_certificate.wildcard[0].domain
    status = data.aws_acm_certificate.wildcard[0].status
  } : {
    arn    = "NOT_SEARCHED"
    domain = "NOT_SEARCHED" 
    status = "NOT_SEARCHED"
  }
  sensitive = false
}

output "exact_domain_certificate_info" {
  description = "Information about the exact domain certificate (if found)"
  value = length(data.aws_acm_certificate.exact_domain) > 0 ? {
    arn    = data.aws_acm_certificate.exact_domain[0].arn
    domain = data.aws_acm_certificate.exact_domain[0].domain
    status = data.aws_acm_certificate.exact_domain[0].status
  } : {
    arn    = "NOT_SEARCHED"
    domain = "NOT_SEARCHED"
    status = "NOT_SEARCHED"
  }
  sensitive = false
}

output "suggested_api_domain" {
  description = "What the API domain would be"
  value       = "steam-api-dev.${var.domain_name}"
}
