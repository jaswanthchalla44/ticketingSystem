# Both functions are packaged from the same backend source tree. The handler
# name selects the entry point. The source directory is filled in by the backend work.
data "archive_file" "api" {
  type        = "zip"
  source_dir  = "${path.module}/../backend/src"
  output_path = "${path.module}/.build/api.zip"
  excludes    = local.lambda_package_excludes
}

data "archive_file" "triage" {
  type        = "zip"
  source_dir  = "${path.module}/../backend/src"
  output_path = "${path.module}/.build/triage.zip"
  excludes    = local.lambda_package_excludes
}

resource "aws_cloudwatch_log_group" "api" {
  name              = "/aws/lambda/helpdesk-pro-prod-api"
  retention_in_days = 30
}

resource "aws_cloudwatch_log_group" "triage" {
  name              = "/aws/lambda/helpdesk-pro-prod-triage"
  retention_in_days = 30
}

data "aws_iam_policy_document" "lambda_assume" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

# ---------------------------------------------------------------------------
# API Lambda
# ---------------------------------------------------------------------------

resource "aws_iam_role" "api" {
  name               = "helpdesk-pro-prod-api-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

data "aws_iam_policy_document" "api" {
  statement {
    sid       = "WriteOwnLogs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.api.arn}:*"]
  }

  statement {
    sid = "TicketData"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
      "dynamodb:Query",
      "dynamodb:Scan",
      "dynamodb:BatchGetItem",
      "dynamodb:BatchWriteItem",
    ]
    resources = [
      aws_dynamodb_table.tickets.arn,
      "${aws_dynamodb_table.tickets.arn}/index/*",
      aws_dynamodb_table.comments.arn,
      "${aws_dynamodb_table.comments.arn}/index/*",
      aws_dynamodb_table.users.arn,
      "${aws_dynamodb_table.users.arn}/index/*",
    ]
  }

  statement {
    sid       = "AttachmentObjects"
    actions   = ["s3:GetObject", "s3:PutObject"]
    resources = ["${aws_s3_bucket.attachments.arn}/${local.attachment_key_prefix}*"]
  }

  statement {
    sid       = "EnqueueTriage"
    actions   = ["sqs:SendMessage"]
    resources = [aws_sqs_queue.triage.arn]
  }

  statement {
    sid       = "PublishTicketEvents"
    actions   = ["sns:Publish"]
    resources = [aws_sns_topic.ticket_events.arn]
  }

  # Role management for the Admin user screen. Scoped to this user pool only.
  # Demotion signs the user out everywhere so the old role stops working at once.
  statement {
    sid = "ManageUserRoles"
    actions = [
      "cognito-idp:ListUsers",
      "cognito-idp:AdminListGroupsForUser",
      "cognito-idp:AdminAddUserToGroup",
      "cognito-idp:AdminRemoveUserFromGroup",
      "cognito-idp:AdminUserGlobalSignOut",
    ]
    resources = [aws_cognito_user_pool.users.arn]
  }
}

resource "aws_iam_role_policy" "api" {
  name   = "helpdesk-pro-prod-api-policy"
  role   = aws_iam_role.api.id
  policy = data.aws_iam_policy_document.api.json
}

resource "aws_lambda_function" "api" {
  function_name    = "helpdesk-pro-prod-api"
  role             = aws_iam_role.api.arn
  runtime          = "python3.12"
  handler          = "helpdesk.api_handler.handler"
  filename         = data.archive_file.api.output_path
  source_code_hash = data.archive_file.api.output_base64sha256

  timeout     = 30
  memory_size = 512

  environment {
    variables = {
      AUTH_MODE               = "cognito"
      TABLE_TICKETS           = aws_dynamodb_table.tickets.name
      TABLE_COMMENTS          = aws_dynamodb_table.comments.name
      TABLE_USERS             = aws_dynamodb_table.users.name
      ATTACHMENTS_BUCKET      = aws_s3_bucket.attachments.bucket
      TRIAGE_QUEUE_URL        = aws_sqs_queue.triage.url
      TICKET_EVENTS_TOPIC_ARN = aws_sns_topic.ticket_events.arn
      SIGNED_URL_TTL_SECONDS  = "300"
      MAX_UPLOAD_BYTES        = "5242880"
    }
  }

  depends_on = [aws_iam_role_policy.api, aws_cloudwatch_log_group.api]
}

# ---------------------------------------------------------------------------
# Triage Lambda (SQS consumer, Anthropic API with keyword fallback)
# ---------------------------------------------------------------------------

resource "aws_iam_role" "triage" {
  name               = "helpdesk-pro-prod-triage-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

data "aws_iam_policy_document" "triage" {
  statement {
    sid       = "WriteOwnLogs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.triage.arn}:*"]
  }

  statement {
    sid       = "ConsumeTriageQueue"
    actions   = ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:GetQueueAttributes", "sqs:ChangeMessageVisibility"]
    resources = [aws_sqs_queue.triage.arn]
  }

  statement {
    sid     = "TriageTicketData"
    actions = ["dynamodb:GetItem", "dynamodb:UpdateItem", "dynamodb:Query"]
    resources = [
      aws_dynamodb_table.tickets.arn,
      aws_dynamodb_table.comments.arn,
    ]
  }

  statement {
    sid       = "WriteTriageComments"
    actions   = ["dynamodb:PutItem"]
    resources = [aws_dynamodb_table.comments.arn]
  }

  statement {
    sid       = "ReadAnthropicKey"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [aws_secretsmanager_secret.anthropic_key.arn]
  }
}

resource "aws_iam_role_policy" "triage" {
  name   = "helpdesk-pro-prod-triage-policy"
  role   = aws_iam_role.triage.id
  policy = data.aws_iam_policy_document.triage.json
}

resource "aws_lambda_function" "triage" {
  function_name    = "helpdesk-pro-prod-triage"
  role             = aws_iam_role.triage.arn
  runtime          = "python3.12"
  handler          = "helpdesk.triage_handler.handler"
  filename         = data.archive_file.triage.output_path
  source_code_hash = data.archive_file.triage.output_base64sha256

  # Keep below the queue visibility timeout (360s); the Anthropic call has its own shorter timeout.
  timeout     = 60
  memory_size = 512

  environment {
    variables = {
      TRIAGE_MODE               = var.triage_mode
      ANTHROPIC_MODEL           = var.anthropic_model
      ANTHROPIC_TIMEOUT_SECONDS = tostring(var.anthropic_timeout_seconds)
      ANTHROPIC_SECRET_ID       = aws_secretsmanager_secret.anthropic_key.name
      TABLE_TICKETS             = aws_dynamodb_table.tickets.name
      TABLE_COMMENTS            = aws_dynamodb_table.comments.name
    }
  }

  depends_on = [aws_iam_role_policy.triage, aws_cloudwatch_log_group.triage]
}

# One message per invocation. Partial batch responses let SQS retry only failed records.
resource "aws_lambda_event_source_mapping" "triage" {
  event_source_arn        = aws_sqs_queue.triage.arn
  function_name           = aws_lambda_function.triage.arn
  batch_size              = 1
  function_response_types = ["ReportBatchItemFailures"]
  enabled                 = true
}
