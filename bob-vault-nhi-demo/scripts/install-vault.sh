#!/usr/bin/env bash
set -euo pipefail

vault_version="2.0.3+ent"
archive="vault_${vault_version}_linux_amd64.zip"
encoded_version="${vault_version/+/%2Bent}"
base_url="https://releases.hashicorp.com/vault/${vault_version}"
work_dir="$(mktemp -d)"
trap 'rm -rf "${work_dir}"' EXIT

curl --fail --silent --show-error --location "${base_url}/${archive}" --output "${work_dir}/${archive}"
curl --fail --silent --show-error --location "${base_url}/vault_${vault_version}_SHA256SUMS" --output "${work_dir}/SHA256SUMS"
(
  cd "${work_dir}"
  grep " ${archive}$" SHA256SUMS | sha256sum --check --status
)
unzip -q "${work_dir}/${archive}" -d "${work_dir}"
install -m 0755 "${work_dir}/vault" /usr/local/bin/vault
vault version
