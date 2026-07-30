#!/usr/bin/env bash
set -euo pipefail

if command -v psql >/dev/null 2>&1; then
  exit 0
fi
apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq postgresql-client ca-certificates
