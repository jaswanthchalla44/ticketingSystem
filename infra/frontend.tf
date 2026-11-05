resource "aws_s3_bucket" "frontend" {
  bucket        = local.frontend_bucket
  force_destroy = false
}

resource "aws_s3_bucket_server_side_encryption_configuration" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_cloudfront_origin_access_control" "frontend" {
  name                              = "helpdesk-pro-prod-frontend-oac"
  description                       = "Origin access to the ${local.frontend_bucket} bucket"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# Rewrites extensionless paths (client-side routes) to index.html. This replaces
# distribution-wide 403/404 custom error responses, which would also turn real
# API 403/404 responses under /api/* into HTML with a 200 status.
resource "aws_cloudfront_function" "spa_rewrite" {
  name    = "helpdesk-pro-prod-spa-rewrite"
  runtime = "cloudfront-js-2.0"
  comment = "Serve index.html for client-side routes"
  publish = true
  code    = <<-EOT
    function handler(event) {
      var request = event.request;
      var uri = request.uri;
      if (uri.indexOf('.') === -1) {
        request.uri = '/index.html';
      }
      return request;
    }
  EOT
}

# Frontend responses: the managed security headers (HSTS, nosniff, frame and referrer headers,
# XSS filter) plus a Content-Security-Policy. The values copy AWS-managed SecurityHeadersPolicy
# (67f7725c-...), which cannot be combined with a custom CSP, so keep them in step with it.
#
# script-src allows the one inline theme script in frontend/index.html by hash. The hash is of
# the script text as Vite emits it. If that script changes, update the hash here (see docs/ARCHITECTURE.md).
#
# connect-src covers the two browser-side calls that leave the origin: the Cognito SRP sign-in
# (amazon-cognito-identity-js calls cognito-idp directly) and the presigned PUT of attachments to S3.
resource "aws_cloudfront_response_headers_policy" "frontend" {
  name    = "helpdesk-pro-prod-frontend-headers"
  comment = "Managed security headers plus a Content-Security-Policy for the SPA"

  security_headers_config {
    content_security_policy {
      override = true
      content_security_policy = join("; ", [
        "default-src 'self'",
        "script-src 'self' 'sha256-BqZd2+6wsloyYcgVMyaa9k34KElueIn/095Mv0lOmG4='",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data:",
        "connect-src 'self' https://cognito-idp.${local.region}.amazonaws.com https://${local.attachments_bucket}.s3.amazonaws.com https://${local.attachments_bucket}.s3.${local.region}.amazonaws.com",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ])
    }

    strict_transport_security {
      override                   = true
      access_control_max_age_sec = 31536000
      include_subdomains         = true
      preload                    = false
    }

    content_type_options {
      override = true
    }

    frame_options {
      override     = true
      frame_option = "SAMEORIGIN"
    }

    referrer_policy {
      override        = true
      referrer_policy = "strict-origin-when-cross-origin"
    }

    xss_protection {
      override   = true
      protection = true
      mode_block = true
    }
  }
}

resource "aws_cloudfront_distribution" "frontend" {
  comment             = "helpdesk-pro-prod-frontend"
  enabled             = true
  is_ipv6_enabled     = true
  default_root_object = "index.html"
  price_class         = "PriceClass_100"
  http_version        = "http2and3"

  origin {
    origin_id                = "frontend-s3"
    domain_name              = aws_s3_bucket.frontend.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.frontend.id
  }

  origin {
    origin_id   = "api-http"
    domain_name = replace(aws_apigatewayv2_api.api.api_endpoint, "https://", "")

    custom_origin_config {
      http_port                = 80
      https_port               = 443
      origin_protocol_policy   = "https-only"
      origin_ssl_protocols     = ["TLSv1.2"]
      origin_read_timeout      = 30
      origin_keepalive_timeout = 5
    }
  }

  # Frontend: static assets, compressed, HTTPS only.
  default_cache_behavior {
    target_origin_id       = "frontend-s3"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true

    # Managed-CachingOptimized
    cache_policy_id = "658327ea-f89d-4fab-a63d-7e88639e58f6"
    # Custom: managed security headers plus the Content-Security-Policy (aws_cloudfront_response_headers_policy.frontend)
    response_headers_policy_id = aws_cloudfront_response_headers_policy.frontend.id

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.spa_rewrite.arn
    }
  }

  # API: never cached, all query strings and viewer headers (Authorization, Content-Type) forwarded.
  ordered_cache_behavior {
    path_pattern           = "/api/*"
    target_origin_id       = "api-http"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods         = ["GET", "HEAD"]
    compress               = false

    # Managed-CachingDisabled
    cache_policy_id = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad"
    # Managed-AllViewerExceptHostHeader
    origin_request_policy_id = "b689b0a8-53d0-40ab-baf2-68738e2966ac"
    # Managed-SecurityHeadersPolicy
    response_headers_policy_id = "67f7725c-6f97-4210-82d7-5512b31e9d03"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
    minimum_protocol_version       = "TLSv1.2_2021"
  }
}

data "aws_iam_policy_document" "frontend" {
  statement {
    sid       = "AllowCloudFrontReadOnly"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.frontend.arn}/*"]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.frontend.arn]
    }
  }

  # Lets CloudFront get a real 404 for missing assets instead of 403.
  statement {
    sid       = "AllowCloudFrontListBucket"
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.frontend.arn]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.frontend.arn]
    }
  }

  statement {
    sid       = "DenyInsecureTransport"
    effect    = "Deny"
    actions   = ["s3:*"]
    resources = [aws_s3_bucket.frontend.arn, "${aws_s3_bucket.frontend.arn}/*"]

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

resource "aws_s3_bucket_policy" "frontend" {
  bucket = aws_s3_bucket.frontend.id
  policy = data.aws_iam_policy_document.frontend.json

  depends_on = [aws_s3_bucket_public_access_block.frontend]
}
