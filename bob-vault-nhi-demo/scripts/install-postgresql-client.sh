#!/usr/bin/env bash
set -euo pipefail

if command -v psql >/dev/null 2>&1; then
  exit 0
fi
if [[ -f /etc/apt/sources.list ]]; then
  sed -i \
    -e 's|http://archive.ubuntu.com|https://archive.ubuntu.com|g' \
    -e 's|http://security.ubuntu.com|https://security.ubuntu.com|g' \
    /etc/apt/sources.list
fi
if [[ -d /etc/apt/sources.list.d ]]; then
  sed -i \
    -e 's|http://archive.ubuntu.com|https://archive.ubuntu.com|g' \
    -e 's|http://security.ubuntu.com|https://security.ubuntu.com|g' \
    /etc/apt/sources.list.d/*.list /etc/apt/sources.list.d/*.sources 2>/dev/null || true
fi
apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq postgresql-client ca-certificates
