resource "aws_sqs_queue" "triage_dlq" {
  name                      = "helpdesk-pro-prod-triage-dlq"
  message_retention_seconds = 1209600 # 14 days, the maximum, so failed triage can be inspected and replayed
  sqs_managed_sse_enabled   = true
}

# Only the triage queue may redrive into the DLQ.
resource "aws_sqs_queue_redrive_allow_policy" "triage_dlq" {
  queue_url = aws_sqs_queue.triage_dlq.id

  redrive_allow_policy = jsonencode({
    redrivePermission = "byQueue"
    sourceQueueArns   = [aws_sqs_queue.triage.arn]
  })
}

resource "aws_sqs_queue" "triage" {
  name = "helpdesk-pro-prod-triage-queue"

  # Must exceed the triage Lambda timeout (60s) by a wide margin, per SQS event source guidance: 6 x 60s.
  visibility_timeout_seconds = 360
  message_retention_seconds  = 345600 # 4 days
  receive_wait_time_seconds  = 20
  sqs_managed_sse_enabled    = true

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.triage_dlq.arn
    maxReceiveCount     = 3
  })
}

resource "aws_sns_topic" "ticket_events" {
  name = "helpdesk-pro-prod-ticket-events"
}

# Optional: only subscribed when notification_email is set.
resource "aws_sns_topic_subscription" "ticket_events_email" {
  count = var.notification_email == "" ? 0 : 1

  topic_arn = aws_sns_topic.ticket_events.arn
  protocol  = "email"
  endpoint  = var.notification_email
}
