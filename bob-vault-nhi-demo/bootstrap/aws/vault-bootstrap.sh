#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${script_dir}/common.sh"

prepare_vault_environment
wait_for_vault
load_vault_root_token

verify_jwks_url="$(parameter_value "/${PROJECT_NAME}/verify/jwks-url")"
verify_issuer="$(parameter_value "/${PROJECT_NAME}/verify/issuer")"
verify_audience="$(parameter_value "/${PROJECT_NAME}/verify/audience")"
verify_nhi_claim="$(parameter_value "/${PROJECT_NAME}/verify/nhi-claim")"
verify_nhi_value="$(parameter_value "/${PROJECT_NAME}/verify/nhi-value")"

unset VAULT_NAMESPACE
if ! vault namespace lookup demo >/dev/null 2>&1; then
  vault namespace create demo >/dev/null
fi
if ! vault audit list -format=json | jq -e 'has("file/")' >/dev/null; then
  vault audit enable file file_path=/var/log/vault/audit.log >/dev/null
fi

export VAULT_NAMESPACE="demo"
if ! vault auth list -format=json | jq -e 'has("jwt/")' >/dev/null; then
  vault auth enable -path=jwt jwt >/dev/null
fi
if ! vault secrets list -format=json | jq -e 'has("database/")' >/dev/null; then
  vault secrets enable -path=database database >/dev/null
fi

policy_file="$(new_private_file)"
cat >"${policy_file}" <<'HCL'
path "database/creds/bob-orders-readonly" {
  capabilities = ["read"]
}
HCL
vault policy write bob-orders "${policy_file}" >/dev/null

vault write auth/jwt/config \
  jwks_url="${verify_jwks_url}" \
  bound_issuer="${verify_issuer}" \
  jwt_supported_algs=RS256 \
  default_role=bob-orders >/dev/null

bound_claims="$(jq -cn --arg claim "${verify_nhi_claim}" --arg value "${verify_nhi_value}" '{($claim):$value}')"
vault write auth/jwt/role/bob-orders \
  role_type=jwt \
  user_claim="${verify_nhi_claim}" \
  bound_audiences="${verify_audience}" \
  bound_claims="${bound_claims}" \
  token_policies=bob-orders \
  token_no_default_policy=true \
  token_ttl=2m \
  token_max_ttl=5m \
  token_explicit_max_ttl=5m >/dev/null

bootstrap_secret_name="${PROJECT_NAME}/bootstrap/vault-db-admin"
db_admin_secret="$(aws secretsmanager get-secret-value \
  --secret-id "${bootstrap_secret_name}" \
  --query SecretString \
  --output text)"
db_username="$(printf '%s' "${db_admin_secret}" | jq -er '.username')"
db_password="$(printf '%s' "${db_admin_secret}" | jq -er '.password')"
db_host="$(printf '%s' "${db_admin_secret}" | jq -er '.host')"
db_name="$(printf '%s' "${db_admin_secret}" | jq -er '.database')"

vault write database/config/shop-postgres \
  plugin_name=postgresql-database-plugin \
  allowed_roles=bob-orders-readonly \
  connection_url="postgresql://{{username}}:{{password}}@${db_host}:5432/${db_name}?sslmode=verify-full&sslrootcert=/etc/vault.d/tls/rds-ca.pem" \
  username="${db_username}" \
  password="${db_password}" \
  verify_connection=true >/dev/null

creation_statements='CREATE ROLE "{{name}}" WITH LOGIN PASSWORD '\''{{password}}'\'' VALID UNTIL '\''{{expiration}}'\''; GRANT bob_orders_reader TO "{{name}}";'
revocation_statements='REVOKE bob_orders_reader FROM "{{name}}"; DROP ROLE IF EXISTS "{{name}}";'
vault write database/roles/bob-orders-readonly \
  db_name=shop-postgres \
  creation_statements="${creation_statements}" \
  revocation_statements="${revocation_statements}" \
  default_ttl=2m \
  max_ttl=5m >/dev/null

vault write -f database/rotate-root/shop-postgres >/dev/null
aws secretsmanager delete-secret \
  --secret-id "${bootstrap_secret_name}" \
  --force-delete-without-recovery >/dev/null

echo "Vault namespace, audit, JWT policy, and rotating PostgreSQL credentials are configured."
