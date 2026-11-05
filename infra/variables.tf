variable "notification_email" {
  description = "Email address subscribed to the ticket events topic. Leave empty for no email subscription."
  type        = string
  default     = ""
  # Keeps the address out of the plan shown in the deploy job summary.
  sensitive = true

  validation {
    condition     = var.notification_email == "" || can(regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$", var.notification_email))
    error_message = "notification_email must be empty or a valid email address."
  }
}

variable "triage_mode" {
  description = "Triage source: anthropic (AI, falls back to keyword rules on any error) or keyword (rules only)."
  type        = string
  default     = "anthropic"

  validation {
    condition     = contains(["anthropic", "keyword"], var.triage_mode)
    error_message = "triage_mode must be anthropic or keyword."
  }
}

variable "anthropic_model" {
  description = "Claude model name sent to the Anthropic Messages API by the triage Lambda. Verify it is available to the Anthropic account before the first deploy."
  type        = string
  default     = "claude-haiku-5-5"

  validation {
    condition     = can(regex("^claude-[a-z0-9.-]+$", var.anthropic_model))
    error_message = "anthropic_model must be a Claude model name such as claude-haiku-5-5."
  }
}

variable "anthropic_timeout_seconds" {
  description = "Per-call timeout for the Anthropic API. Must stay well below the triage Lambda timeout (60s)."
  type        = number
  default     = 8

  validation {
    condition     = var.anthropic_timeout_seconds >= 2 && var.anthropic_timeout_seconds <= 20
    error_message = "anthropic_timeout_seconds must be between 2 and 20."
  }
}
