output "deployed_url" {
  description = "Public URL of the app (CloudFront)"
  value       = "https://${aws_cloudfront_distribution.frontend.domain_name}"
}

output "api_endpoint" {
  description = "HTTP API endpoint behind CloudFront /api/*"
  value       = aws_apigatewayv2_api.api.api_endpoint
}

output "user_pool_id" {
  description = "Cognito user pool ID"
  value       = aws_cognito_user_pool.users.id
}

output "user_pool_client_id" {
  description = "Cognito app client ID for the web SPA"
  value       = aws_cognito_user_pool_client.web.id
}

output "smoke_user_pool_client_id" {
  description = "Cognito app client ID for the deploy smoke test (password sign-in, smoke user only)"
  value       = aws_cognito_user_pool_client.smoke.id
}

output "attachments_bucket" {
  description = "Private S3 bucket for ticket screenshots"
  value       = aws_s3_bucket.attachments.bucket
}

output "frontend_bucket" {
  description = "Private S3 bucket holding the built SPA"
  value       = aws_s3_bucket.frontend.bucket
}

output "cloudfront_distribution_id" {
  description = "Used by the deploy workflow to invalidate the cache"
  value       = aws_cloudfront_distribution.frontend.id
}

output "triage_queue_url" {
  description = "SQS queue that triggers AI triage on ticket creation"
  value       = aws_sqs_queue.triage.url
}

output "ticket_events_topic_arn" {
  description = "SNS topic for assignment and reply notifications"
  value       = aws_sns_topic.ticket_events.arn
}
