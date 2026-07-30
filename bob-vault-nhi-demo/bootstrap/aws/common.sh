#!/usr/bin/env bash
set -euo pipefail
umask 077

PROJECT_NAME="${PROJECT_NAME:-bob-vault-nhi-demo}"
AWS_REGION="${AWS_REGION:-ap-northeast-2}"
export AWS_REGION AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-${AWS_REGION}}"

temporary_files=()
cleanup_bootstrap_files() {
  if ((${#temporary_files[@]} > 0)); then
    rm -f "${temporary_files[@]}"
  fi
}
trap cleanup_bootstrap_files EXIT

new_private_file() {
  local file
  file="$(mktemp)"
  chmod 0600 "${file}"
  temporary_files+=("${file}")
  printf '%s' "${file}"
}

parameter_value() {
  aws ssm get-parameter \
    --name "$1" \
    --with-decryption \
    --query 'Parameter.Value' \
    --output text
}

prepare_vault_environment() {
  local ca_file
  ca_file="$(new_private_file)"
  parameter_value "/${PROJECT_NAME}/vault/ca-pem" >"${ca_file}"
  export VAULT_ADDR
  export VAULT_CACERT="${ca_file}"
  VAULT_ADDR="$(parameter_value "/${PROJECT_NAME}/vault/address")"
}

load_vault_root_token() {
  local recovery_secret
  recovery_secret="$(aws secretsmanager get-secret-value \
    --secret-id "${PROJECT_NAME}/vault/recovery" \
    --query SecretString \
    --output text)"
  export VAULT_TOKEN
  VAULT_TOKEN="$(printf '%s' "${recovery_secret}" | jq -er '.root_token')"
}

wait_for_vault() {
  local attempt status_code
  for attempt in {1..36}; do
    status_code="$(curl --silent --output /dev/null --write-out '%{http_code}' \
      --cacert "${VAULT_CACERT}" "${VAULT_ADDR}/v1/sys/health" || true)"
    if [[ "${status_code}" =~ ^(200|429|472|473|501|503)$ ]]; then
      return 0
    fi
    sleep 5
  done
  echo "Vault did not become reachable." >&2
  return 1
}

download_rds_ca() {
  local ca_file
  ca_file="$(new_private_file)"
  curl --fail --silent --show-error --location \
    "https://truststore.pki.rds.amazonaws.com/${AWS_REGION}/${AWS_REGION}-bundle.pem" \
    --output "${ca_file}"
  openssl crl2pkcs7 -nocrl -certfile "${ca_file}" \
    | openssl pkcs7 -print_certs -noout >/dev/null
  printf '%s' "${ca_file}"
}
