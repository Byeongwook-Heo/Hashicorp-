#!/usr/bin/env bash
set -euo pipefail

command -v aws >/dev/null 2>&1 || {
  echo "AWS CLI is required." >&2
  exit 1
}
command -v session-manager-plugin >/dev/null 2>&1 || {
  echo "AWS Session Manager plugin is required." >&2
  exit 1
}

project_name="${PROJECT_NAME:-bob-vault-nhi-demo}"
aws_region="${AWS_REGION:-ap-northeast-2}"
account_id="${AWS_ACCOUNT_ID:-063455554839}"
operator_name="${EVENT_OPERATOR_NAME:-${USER:-operator}}"

if [[ ! "${operator_name}" =~ ^[A-Za-z0-9+=,.@_-]{2,32}$ ]]; then
  echo "EVENT_OPERATOR_NAME must be 2-32 safe role-session characters." >&2
  exit 2
fi

source_identity="event-$(printf '%s' "${operator_name}" | tr -cd 'A-Za-z0-9+=,.@_-')"
role_arn="arn:aws:iam::${account_id}:role/${project_name}-event-operator"
session_document="${project_name}-event-operator-shell"

credentials="$(
  aws sts assume-role \
    --region "${aws_region}" \
    --role-arn "${role_arn}" \
    --role-session-name "${source_identity}" \
    --duration-seconds 7200 \
    --query 'Credentials.[AccessKeyId,SecretAccessKey,SessionToken]' \
    --output text
)"

read -r access_key secret_key session_token <<<"${credentials}"
unset credentials

instance_id="$(
  AWS_ACCESS_KEY_ID="${access_key}" \
  AWS_SECRET_ACCESS_KEY="${secret_key}" \
  AWS_SESSION_TOKEN="${session_token}" \
  AWS_REGION="${aws_region}" \
  aws ec2 describe-instances \
    --region "${aws_region}" \
    --filters \
      "Name=tag:Name,Values=${project_name}-vault" \
      "Name=instance-state-name,Values=running" \
    --query 'Reservations[0].Instances[0].InstanceId' \
    --output text
)"

if [[ -z "${instance_id}" || "${instance_id}" == "None" ]]; then
  echo "The running event Vault instance was not found." >&2
  exit 1
fi

echo "Opening an audited SSM session to ${instance_id}. Idle timeout: 20 minutes; maximum: 120 minutes."
AWS_ACCESS_KEY_ID="${access_key}" \
AWS_SECRET_ACCESS_KEY="${secret_key}" \
AWS_SESSION_TOKEN="${session_token}" \
AWS_REGION="${aws_region}" \
aws ssm start-session \
  --region "${aws_region}" \
  --target "${instance_id}" \
  --document-name "${session_document}"

unset access_key secret_key session_token
