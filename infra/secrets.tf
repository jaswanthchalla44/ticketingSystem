# Anthropic API key for AI triage. Terraform creates the secret resource only.
# The value is set once, by the person, outside Terraform and outside this repo.
# See "One-time steps" in docs/ARCHITECTURE.md for the exact command.
# Until the value is set, the triage Lambda falls back to keyword rules and the smoke test fails.
resource "aws_secretsmanager_secret" "anthropic_key" {
  name                    = local.anthropic_secret_name
  description             = "Anthropic API key for AI ticket triage (helpdesk-pro-prod-triage). Value set outside Terraform."
  recovery_window_in_days = 30

  lifecycle {
    prevent_destroy = true
  }
}
