#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
project_dir="$(cd "${script_dir}/.." && pwd)"
source "${script_dir}/aws-credentials.sh"
load_demo_aws_credentials

account_id="$(aws sts get-caller-identity --query Account --output text)"
principal_arn="$(aws sts get-caller-identity --query Arn --output text)"
if [[ "${account_id}" != "063455554839" ]]; then
  echo "Unexpected AWS account: ${account_id}" >&2
  exit 1
fi

aws ec2 describe-vpcs --vpc-ids vpc-0faaeb5858901d385 --query 'Vpcs[0].VpcId' --output text | grep -qx 'vpc-0faaeb5858901d385'
aws ec2 describe-subnets \
  --subnet-ids subnet-068dffa0960dbcffd subnet-068a968f3426594db subnet-026ffcc7ad4b697c6 subnet-06c50448784244f83 subnet-07e488fded4534ef2 subnet-0cd8afeeca0ace850 \
  --query 'length(Subnets)' --output text | grep -qx '6'
aws ec2 describe-images --image-ids ami-09d68fa4b57f9e888 \
  --query 'Images[0].[Architecture,Name,State]' --output text | grep -q $'x86_64\thc-security-base-ubuntu-2204-20260730033928\tavailable'
aws route53 get-hosted-zone --id Z07579811BJW2L1U58CO1 >/dev/null
aws s3api head-bucket --bucket ibm-hc-lab-tfstate-063455554839-ap-northeast-2 >/dev/null

license_file="${VAULT_LICENSE_FILE:-${HOME}/Downloads/vault_aisummit_20260902.hclic}"
test -s "${license_file}"
test -f "${project_dir}/infra/bootstrap/cloudformation.yaml"

echo "AWS preflight passed."
echo "Account: ${account_id}"
echo "Principal: ${principal_arn}"
echo "VPC, subnets, hardened AMI, DNS zone, state bucket, and local license file are available."
