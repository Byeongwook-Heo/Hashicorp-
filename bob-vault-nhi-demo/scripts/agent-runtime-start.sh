#!/usr/bin/env bash
set -euo pipefail

AWS_REGION="${AWS_REGION:-ap-northeast-2}"
INSTANCE_ID="${AGENT_RUNTIME_INSTANCE_ID:-i-0d5f6e9e55891b9ac}"
EXPECTED_PRIVATE_IP="${AGENT_RUNTIME_PRIVATE_IP:-10.70.20.182}"

read -r actual_private_ip state < <(
  aws ec2 describe-instances \
    --region "${AWS_REGION}" \
    --instance-ids "${INSTANCE_ID}" \
    --query "Reservations[0].Instances[0].[PrivateIpAddress,State.Name]" \
    --output text
)

if [[ "${actual_private_ip}" != "${EXPECTED_PRIVATE_IP}" ]]; then
  echo "Refusing to start an unexpected instance." >&2
  exit 2
fi

case "${state}" in
  stopped)
    aws ec2 start-instances --region "${AWS_REGION}" --instance-ids "${INSTANCE_ID}" >/dev/null
    ;;
  running)
    ;;
  *)
    echo "The private planning runtime is currently ${state}; try again after the transition completes." >&2
    exit 2
    ;;
esac

aws ec2 wait instance-status-ok --region "${AWS_REGION}" --instance-ids "${INSTANCE_ID}"
echo "Private agent planning runtime is ready."
