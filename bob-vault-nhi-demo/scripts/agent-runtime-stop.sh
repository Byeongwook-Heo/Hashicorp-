#!/usr/bin/env bash
set -euo pipefail

AWS_REGION="${AWS_REGION:-ap-northeast-2}"
INSTANCE_ID="${AGENT_RUNTIME_INSTANCE_ID:-i-0d5f6e9e55891b9ac}"
EXPECTED_PRIVATE_IP="${AGENT_RUNTIME_PRIVATE_IP:-10.70.20.182}"

actual_private_ip="$(aws ec2 describe-instances \
  --region "${AWS_REGION}" \
  --instance-ids "${INSTANCE_ID}" \
  --query "Reservations[0].Instances[0].PrivateIpAddress" \
  --output text)"

if [[ "${actual_private_ip}" != "${EXPECTED_PRIVATE_IP}" ]]; then
  echo "Refusing to stop an unexpected instance." >&2
  exit 2
fi

aws ec2 stop-instances --region "${AWS_REGION}" --instance-ids "${INSTANCE_ID}" >/dev/null
echo "Private agent planning runtime stop requested."
