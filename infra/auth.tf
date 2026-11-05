resource "aws_cognito_user_pool" "users" {
  name = "helpdesk-pro-prod-users"

  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]
  deletion_protection      = "ACTIVE"

  password_policy {
    minimum_length                   = 12
    require_lowercase                = true
    require_uppercase                = true
    require_numbers                  = true
    require_symbols                  = false
    temporary_password_validity_days = 7
  }

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  admin_create_user_config {
    allow_admin_create_user_only = true
  }

  schema {
    name                = "email"
    attribute_data_type = "String"
    required            = true
    mutable             = true

    string_attribute_constraints {
      min_length = 5
      max_length = 254
    }
  }
}

# Browser client for the SPA: SRP sign-in and refresh tokens only, no client secret.
resource "aws_cognito_user_pool_client" "web" {
  name         = "helpdesk-pro-prod-web"
  user_pool_id = aws_cognito_user_pool.users.id

  generate_secret               = false
  prevent_user_existence_errors = "ENABLED"
  enable_token_revocation       = true

  explicit_auth_flows = [
    "ALLOW_USER_SRP_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
  ]

  access_token_validity  = 60
  id_token_validity      = 60
  refresh_token_validity = 30

  token_validity_units {
    access_token  = "minutes"
    id_token      = "minutes"
    refresh_token = "days"
  }

  read_attributes = ["email", "email_verified", "name"]
  # "name" is admin-managed only: a customer must not set the name shown as their comment author.
  write_attributes = ["email"]
}

resource "aws_cognito_user_group" "customer" {
  name         = "Customer"
  user_pool_id = aws_cognito_user_pool.users.id
  description  = "Customers: see only their own tickets"
  precedence   = 30
}

resource "aws_cognito_user_group" "agent" {
  name         = "Agent"
  user_pool_id = aws_cognito_user_pool.users.id
  description  = "Support agents: see and work all tickets"
  precedence   = 20
}

resource "aws_cognito_user_group" "admin" {
  name         = "Admin"
  user_pool_id = aws_cognito_user_pool.users.id
  description  = "Admins: agent rights plus dashboard and user management"
  precedence   = 10
}

# Smoke-test client: password sign-in for the one smoke customer, used only by the deploy
# workflow. No client secret. Short-lived tokens. Only this client allows USER_PASSWORD_AUTH.
resource "aws_cognito_user_pool_client" "smoke" {
  name         = "helpdesk-pro-prod-smoke"
  user_pool_id = aws_cognito_user_pool.users.id

  generate_secret               = false
  prevent_user_existence_errors = "ENABLED"
  enable_token_revocation       = true

  explicit_auth_flows = [
    "ALLOW_USER_PASSWORD_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
  ]

  access_token_validity  = 60
  id_token_validity      = 60
  refresh_token_validity = 1

  token_validity_units {
    access_token  = "minutes"
    id_token      = "minutes"
    refresh_token = "days"
  }

  read_attributes = ["email", "email_verified", "name"]
  # "name" is admin-managed only: a customer must not set the name shown as their comment author.
  write_attributes = ["email"]
}
