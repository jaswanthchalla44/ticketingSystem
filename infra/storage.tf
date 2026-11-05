resource "aws_dynamodb_table" "tickets" {
  name         = "helpdesk-pro-prod-tickets"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"

  attribute {
    name = "id"
    type = "S"
  }

  attribute {
    name = "requester_sub"
    type = "S"
  }

  attribute {
    name = "created_at"
    type = "S"
  }

  attribute {
    name = "assignee_id"
    type = "S"
  }

  attribute {
    name = "updated_at"
    type = "S"
  }

  attribute {
    name = "status"
    type = "S"
  }

  # Customers list their own tickets, newest first.
  global_secondary_index {
    name            = "by_requester"
    hash_key        = "requester_sub"
    range_key       = "created_at"
    projection_type = "ALL"
  }

  # Agent queues: tickets assigned to one agent, most recently updated first.
  global_secondary_index {
    name            = "by_assignee"
    hash_key        = "assignee_id"
    range_key       = "updated_at"
    projection_type = "ALL"
  }

  # Kanban columns and status filters, most recently updated first.
  global_secondary_index {
    name            = "by_status"
    hash_key        = "status"
    range_key       = "updated_at"
    projection_type = "ALL"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_dynamodb_table" "comments" {
  name         = "helpdesk-pro-prod-comments"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "ticket_id"
  range_key    = "sort_key"

  attribute {
    name = "ticket_id"
    type = "S"
  }

  attribute {
    name = "sort_key"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_dynamodb_table" "users" {
  name         = "helpdesk-pro-prod-users"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "user_id"

  attribute {
    name = "user_id"
    type = "S"
  }

  attribute {
    name = "role"
    type = "S"
  }

  # Lists the users in one role, for user management.
  global_secondary_index {
    name            = "by_role"
    hash_key        = "role"
    range_key       = "user_id"
    projection_type = "ALL"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket" "attachments" {
  bucket = local.attachments_bucket

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_versioning" "attachments" {
  bucket = aws_s3_bucket.attachments.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "attachments" {
  bucket = aws_s3_bucket.attachments.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "attachments" {
  bucket = aws_s3_bucket.attachments.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "attachments" {
  bucket = aws_s3_bucket.attachments.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "attachments" {
  bucket = aws_s3_bucket.attachments.id

  rule {
    id     = "expire-noncurrent-versions"
    status = "Enabled"

    filter {}

    noncurrent_version_expiration {
      noncurrent_days = 30
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }

  depends_on = [aws_s3_bucket_versioning.attachments]
}

# Browser uploads go straight to S3 with presigned PUT URLs. Only the
# CloudFront domain may call the bucket from a browser.
resource "aws_s3_bucket_cors_configuration" "attachments" {
  bucket = aws_s3_bucket.attachments.id

  cors_rule {
    allowed_origins = ["https://${aws_cloudfront_distribution.frontend.domain_name}"]
    allowed_methods = ["GET", "PUT"]
    allowed_headers = ["Content-Type"]
    expose_headers  = ["ETag"]
    max_age_seconds = 600
  }
}

data "aws_iam_policy_document" "attachments" {
  statement {
    sid       = "DenyInsecureTransport"
    effect    = "Deny"
    actions   = ["s3:*"]
    resources = [aws_s3_bucket.attachments.arn, "${aws_s3_bucket.attachments.arn}/*"]

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "attachments" {
  bucket = aws_s3_bucket.attachments.id
  policy = data.aws_iam_policy_document.attachments.json

  depends_on = [aws_s3_bucket_public_access_block.attachments]
}
