#!/usr/bin/env bash
set -euo pipefail

load_demo_aws_credentials() {
  if [[ -n "${AWS_ACCESS_KEY_ID:-}" && -n "${AWS_SECRET_ACCESS_KEY:-}" && -n "${AWS_SESSION_TOKEN:-}" ]]; then
    return
  fi

  local credentials_file="${AWS_CREDENTIALS_FILE:-${HOME}/Downloads/AWS credentials.rtf}"
  if [[ ! -r "${credentials_file}" ]]; then
    echo "AWS credentials file is not readable: ${credentials_file}" >&2
    return 1
  fi

  local credentials_text
  if command -v textutil >/dev/null 2>&1; then
    credentials_text="$(textutil -convert txt -stdout "${credentials_file}")"
  else
    credentials_text="$(sed -e 's/\\\\par/\
/g' -e 's/[{}]//g' "${credentials_file}")"
  fi

  export AWS_ACCESS_KEY_ID
  export AWS_SECRET_ACCESS_KEY
  export AWS_SESSION_TOKEN
  AWS_ACCESS_KEY_ID="$(printf '%s\n' "${credentials_text}" | sed -nE 's/^[[:space:]]*aws_access_key_id[[:space:]]*=[[:space:]]*([^[:space:]]+).*/\1/p' | head -1)"
  AWS_SECRET_ACCESS_KEY="$(printf '%s\n' "${credentials_text}" | sed -nE 's/^[[:space:]]*aws_secret_access_key[[:space:]]*=[[:space:]]*([^[:space:]]+).*/\1/p' | head -1)"
  AWS_SESSION_TOKEN="$(printf '%s\n' "${credentials_text}" | sed -nE 's/^[[:space:]]*aws_session_token[[:space:]]*=[[:space:]]*([^[:space:]]+).*/\1/p' | head -1)"

  if [[ -z "${AWS_ACCESS_KEY_ID}" || -z "${AWS_SECRET_ACCESS_KEY}" || -z "${AWS_SESSION_TOKEN}" ]]; then
    echo "The AWS credential fields could not be parsed." >&2
    return 1
  fi
  export AWS_REGION="${AWS_REGION:-ap-northeast-2}"
  export AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-${AWS_REGION}}"
}
