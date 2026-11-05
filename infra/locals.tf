data "aws_caller_identity" "current" {}

data "aws_region" "current" {}

locals {
  account_id = data.aws_caller_identity.current.account_id
  region     = data.aws_region.current.name

  # Keys under this prefix are the only S3 objects the API may read or write.
  attachment_key_prefix = "attachments/"

  # Local build output never goes into the Lambda zip.
  lambda_package_excludes = ["**/__pycache__/**", "**/*.pyc", "**/.pytest_cache/**"]

  # S3 bucket names are global, so they carry the AWS account ID. Lengths stay under 63 characters.
  attachments_bucket = "helpdesk-pro-prod-attachments-${local.account_id}"
  frontend_bucket    = "helpdesk-pro-prod-frontend-${local.account_id}"

  # The API key lives in this secret. Terraform creates the secret but never its value.
  anthropic_secret_name = "helpdesk-pro-prod-anthropic-key"
}
