#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${script_dir}/aws-credentials.sh"
load_demo_aws_credentials

project_name="${PROJECT_NAME:-bob-vault-nhi-demo}"
base_url="${DEMO_URL:-https://bob-vault-demo.byeongwook-heo.sbx.hashidemos.io}"
status_json="$(curl --fail --silent --show-error "${base_url}/api/status")"
curl --fail --silent --show-error "${base_url}/healthz" >/dev/null

if [[ "$(printf '%s' "${status_json}" | jq -r '.chatbot.enabled')" == "true" ]]; then
  login_status="$(curl --silent --show-error \
    --output /dev/null \
    --write-out '%{http_code}' \
    "${base_url}/auth/login")"
  test "${login_status}" = "302"

  session_status="$(curl --silent --show-error \
    --output /dev/null \
    --write-out '%{http_code}' \
    "${base_url}/api/me")"
  test "${session_status}" = "401"

  mcp_status="$(curl --silent --show-error \
    --output /dev/null \
    --write-out '%{http_code}' \
    --header "accept: application/json, text/event-stream" \
    --header "content-type: application/json" \
    --data '{"jsonrpc":"2.0","id":"smoke-1","method":"tools/list","params":{}}' \
    "${base_url}/mcp")"
  test "${mcp_status}" = "401"
  echo "Public health, Verify login redirect, and unauthenticated deny checks passed."
  exit 0
fi

transport_token="$(aws secretsmanager get-secret-value \
  --secret-id "${project_name}/mcp/transport-token" \
  --query SecretString \
  --output text)"

response_file="$(mktemp)"
trap 'rm -f "${response_file}"' EXIT
chmod 0600 "${response_file}"
http_status="$(curl --silent --show-error \
  --output "${response_file}" \
  --write-out '%{http_code}' \
  --header "authorization: Bearer ${transport_token}" \
  --header "accept: application/json, text/event-stream" \
  --header "content-type: application/json" \
  --data '{"jsonrpc":"2.0","id":"smoke-1","method":"tools/list","params":{}}' \
  "${base_url}/mcp")"
test "${http_status}" = "200"
jq -e '.result.tools | map(.name) | sort == ["get_failed_payment_summary","get_order_status","get_sensitive_payment_data"]' "${response_file}" >/dev/null

echo "Public health and authenticated MCP tool discovery passed."
