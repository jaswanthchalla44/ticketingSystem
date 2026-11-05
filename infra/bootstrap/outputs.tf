output "tfstate_bucket" {
  description = "Remote state bucket used by the backend block in /infra"
  value       = aws_s3_bucket.tfstate.id
}

output "tflock_table" {
  description = "Lock table used by the backend block in /infra"
  value       = aws_dynamodb_table.tflock.name
}

output "account_id" {
  description = "AWS account the bootstrap stack was applied to"
  value       = local.account_id
}
