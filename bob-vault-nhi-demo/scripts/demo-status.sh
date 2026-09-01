#!/usr/bin/env bash
set -euo pipefail

base_url="${DEMO_URL:-https://bob-vault-demo.byeongwook-heo.sbx.hashidemos.io}"
curl --fail --silent --show-error "${base_url}/api/status" \
  | jq '{mode,configured,version,protocol,controls}'
