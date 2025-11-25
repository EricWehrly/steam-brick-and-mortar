# S3 cache module variables

variable "project_name" {
  description = "Project name for resource naming"
  type        = string
}

variable "environment" {
  description = "Environment name (dev, prod, etc.)"
  type        = string
}

variable "cache_expiration_days" {
  description = "Number of days before cached data expires"
  type        = number
  default     = 90
}

variable "enable_expiration" {
  description = "Enable automatic expiration of old cache data"
  type        = bool
  default     = false
}

variable "tags" {
  description = "Tags to apply to all resources"
  type        = map(string)
  default     = {}
}
