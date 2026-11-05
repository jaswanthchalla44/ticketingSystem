# HTTP API in front of the API Lambda. Cognito JWTs are verified by API Gateway,
# so the Lambda reads claims from requestContext.authorizer.jwt.claims.
resource "aws_cloudwatch_log_group" "api_access" {
  name              = "/aws/apigateway/helpdesk-pro-prod-api"
  retention_in_days = 30
}

resource "aws_apigatewayv2_api" "api" {
  name          = "helpdesk-pro-prod-api"
  protocol_type = "HTTP"
  description   = "Helpdesk Pro API. Reached through CloudFront at /api/*."
}

resource "aws_apigatewayv2_authorizer" "cognito" {
  api_id           = aws_apigatewayv2_api.api.id
  name             = "helpdesk-pro-prod-cognito"
  authorizer_type  = "JWT"
  identity_sources = ["$request.header.Authorization"]

  jwt_configuration {
    audience = [
      aws_cognito_user_pool_client.web.id,
      aws_cognito_user_pool_client.smoke.id,
    ]
    issuer = "https://cognito-idp.${local.region}.amazonaws.com/${aws_cognito_user_pool.users.id}"
  }
}

resource "aws_apigatewayv2_integration" "api" {
  api_id                 = aws_apigatewayv2_api.api.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.api.invoke_arn
  integration_method     = "POST"
  payload_format_version = "2.0"
  timeout_milliseconds   = 29000
}

# Every request goes to the API Lambda; the Lambda does the routing under /api/.
# CloudFront forwards the full path, so the Lambda sees paths such as /api/tickets.
resource "aws_apigatewayv2_route" "default" {
  api_id             = aws_apigatewayv2_api.api.id
  route_key          = "$default"
  target             = "integrations/${aws_apigatewayv2_integration.api.id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.api.id
  name        = "$default"
  auto_deploy = true

  default_route_settings {
    throttling_burst_limit = 200
    throttling_rate_limit  = 100
  }

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.api_access.arn
    format = jsonencode({
      requestId      = "$context.requestId"
      ip             = "$context.identity.sourceIp"
      requestTime    = "$context.requestTime"
      httpMethod     = "$context.httpMethod"
      path           = "$context.path"
      status         = "$context.status"
      responseLength = "$context.responseLength"
      integrationErr = "$context.integrationErrorMessage"
      authorizerErr  = "$context.authorizer.error"
    })
  }
}

resource "aws_lambda_permission" "api_gateway" {
  statement_id  = "AllowHttpApiInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.api.execution_arn}/*/*"
}
