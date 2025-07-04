# Input variables for the domain module

variable "domain_name" {
  description = "Base domain name (must already exist in Route 53)"
  type        = string
}

variable "route53_zone_id" {
  description = "Route 53 hosted zone ID (to avoid ambiguity with multiple zones)"
  type        = string
}

variable "api_domain_name" {
  description = "Full API domain name (e.g., steam-api-dev.example.com)"
  type        = string
}

variable "api_gateway_id" {
  description = "API Gateway ID (optional for data source testing)"
  type        = string
  default     = null
}

variable "api_stage_name" {
  description = "API Gateway stage name"
  type        = string
  default     = "$default"
}

variable "enable_ipv6" {
  description = "Whether to create IPv6 (AAAA) DNS records"
  type        = bool
  default     = false
}

variable "tags" {
  description = "Tags to apply to resources"
  type        = map(string)
  default     = {}
}
