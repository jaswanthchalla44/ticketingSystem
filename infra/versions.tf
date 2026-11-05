terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.80"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.4"
    }
  }

  # Backend settings cannot use variables, and the state bucket name carries the
  # AWS account ID. Pass them with -backend-config at init (see docs/ARCHITECTURE.md).
  # The state bucket and lock table are created by /infra/bootstrap (create-state.sh).
  backend "s3" {}
}
