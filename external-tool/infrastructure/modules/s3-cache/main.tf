# S3 bucket for Steam game data caching

# S3 bucket for game cache
resource "aws_s3_bucket" "game_cache" {
  bucket = "${var.project_name}-${var.environment}-game-cache"

  tags = merge(
    var.tags,
    {
      Purpose = "Steam game data caching"
    }
  )
}

# Enable versioning for data protection
resource "aws_s3_bucket_versioning" "game_cache" {
  bucket = aws_s3_bucket.game_cache.id

  versioning_configuration {
    status = "Enabled"
  }
}

# Lifecycle rule to manage storage costs
resource "aws_s3_bucket_lifecycle_configuration" "game_cache" {
  bucket = aws_s3_bucket.game_cache.id

  rule {
    id     = "transition-old-versions"
    status = "Enabled"

    filter {}

    noncurrent_version_transition {
      noncurrent_days = 30
      storage_class   = "STANDARD_IA"
    }

    noncurrent_version_expiration {
      noncurrent_days = 90
    }
  }

  rule {
    id     = "expire-old-data"
    status = var.enable_expiration ? "Enabled" : "Disabled"

    filter {
      prefix = "appdetails/"
    }

    expiration {
      days = var.cache_expiration_days
    }
  }
}

# Server-side encryption
resource "aws_s3_bucket_server_side_encryption_configuration" "game_cache" {
  bucket = aws_s3_bucket.game_cache.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Block public access
resource "aws_s3_bucket_public_access_block" "game_cache" {
  bucket = aws_s3_bucket.game_cache.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
