#!/usr/bin/env bash
# Creates the Terraform remote state bucket and lock table for /infra.
#
# Usage:
#   EXPECTED_ACCOUNT_ID=123456789012 ./create-state.sh          # prints what would be created, exits 1
#   EXPECTED_ACCOUNT_ID=123456789012 ./create-state.sh --yes    # applies
#
# The script refuses to run unless --yes is given, the active AWS account
# matches EXPECTED_ACCOUNT_ID and the region is us-east-1.

set -euo pipefail

REQUIRED_REGION="us-east-1"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

APPLY=false
for arg in "$@"; do
  case "$arg" in
    --yes) APPLY=true ;;
    -h|--help)
      sed -n '2,11p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown argument: $arg" >&2
      exit 2
      ;;
  esac
done

if ! command -v aws >/dev/null 2>&1; then
  echo "aws CLI not found in PATH" >&2
  exit 1
fi
if ! command -v terraform >/dev/null 2>&1; then
  echo "terraform not found in PATH" >&2
  exit 1
fi

if [[ -z "${EXPECTED_ACCOUNT_ID:-}" ]]; then
  echo "Set EXPECTED_ACCOUNT_ID to the AWS account the state bucket belongs to." >&2
  exit 1
fi

REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-$(aws configure get region || true)}}"
if [[ "$REGION" != "$REQUIRED_REGION" ]]; then
  echo "Region is '${REGION:-unset}'; this stack must run in ${REQUIRED_REGION}." >&2
  echo "Set AWS_REGION=${REQUIRED_REGION} and run again." >&2
  exit 1
fi

ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
CALLER_ARN="$(aws sts get-caller-identity --query Arn --output text)"

echo "AWS account : ${ACCOUNT_ID}"
echo "Caller      : ${CALLER_ARN}"
echo "Region      : ${REGION}"

if [[ "$ACCOUNT_ID" != "$EXPECTED_ACCOUNT_ID" ]]; then
  echo "Account ${ACCOUNT_ID} does not match EXPECTED_ACCOUNT_ID=${EXPECTED_ACCOUNT_ID}. Refusing to run." >&2
  exit 1
fi

STATE_BUCKET="helpdesk-pro-prod-tfstate-${ACCOUNT_ID}"

cat <<SUMMARY

This will create the following in account ${ACCOUNT_ID}, region ${REGION}:
  - S3 bucket   ${STATE_BUCKET}  (versioning on, AES256 encryption,
                public access blocked, TLS-only bucket policy, noncurrent
                version expiry after 90 days, keeping the newest 10)
  - DynamoDB    helpdesk-pro-prod-tflock   (on-demand, hash key LockID, PITR on,
                encryption on)

Terraform state for this bootstrap stack is kept locally in
${SCRIPT_DIR}/terraform.tfstate. Keep that file safe.

SUMMARY

if [[ "$APPLY" != true ]]; then
  echo "Refusing to apply without --yes. Nothing was changed."
  exit 1
fi

cd "$SCRIPT_DIR"
terraform init -input=false
terraform apply -input=false -auto-approve
