terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.80"
    }
  }

  # Bootstrap keeps its own state locally: it creates the bucket and lock
  # table that the main stack in /infra uses as its remote backend.
  backend "local" {}
}
