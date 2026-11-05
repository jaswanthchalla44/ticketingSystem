provider "aws" {
  region = "us-east-1"

  default_tags {
    tags = {
      Project     = "helpdesk-pro"
      Environment = "prod"
    }
  }
}
