# S3 cache module outputs

output "bucket_name" {
  description = "Name of the S3 bucket for game cache"
  value       = aws_s3_bucket.game_cache.id
}

output "bucket_arn" {
  description = "ARN of the S3 bucket"
  value       = aws_s3_bucket.game_cache.arn
}

output "bucket_domain_name" {
  description = "Domain name of the S3 bucket"
  value       = aws_s3_bucket.game_cache.bucket_domain_name
}
