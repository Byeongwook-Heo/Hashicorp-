#!/usr/bin/env bash
set -euo pipefail

if [[ "$#" -ne 3 ]]; then
  echo "usage: $0 <bucket> <key> <archive>" >&2
  exit 2
fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
project_dir="$(cd "${script_dir}/.." && pwd)"
git_root="$(git -C "${project_dir}" rev-parse --show-toplevel)"
source "${script_dir}/aws-credentials.sh"
load_demo_aws_credentials

bucket="$1"
key="$2"
archive="$3"
archive_dir="$(dirname "${archive}")"
mkdir -p "${archive_dir}"

git -C "${project_dir}" diff --quiet
git -C "${project_dir}" diff --cached --quiet
git -C "${git_root}" archive --format=zip --output="${archive}" HEAD:bob-vault-nhi-demo
aws s3 cp "${archive}" "s3://${bucket}/${key}" --only-show-errors
rm -f "${archive}"
echo "Source archive uploaded to the versioned artifact bucket."
