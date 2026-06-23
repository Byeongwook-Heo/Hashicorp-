#!/usr/bin/env bash
set -euo pipefail

source /opt/vault-benchmark/env.sh

install -d -o root -g root -m 0755 /opt/vault-benchmark/lua
install -d -o root -g root -m 0755 /opt/vault-benchmark/data/pdf-style
install -d -o root -g root -m 0755 /opt/vault-benchmark/results

cat >/opt/vault-benchmark/lua/static-json.lua <<'EOF_LUA'
local body_file = os.getenv("WRK_BODY_FILE")
local request_path = os.getenv("WRK_PATH")
local token = os.getenv("VAULT_TOKEN")

if body_file == nil or body_file == "" then
  error("WRK_BODY_FILE is required")
end

if request_path == nil or request_path == "" then
  error("WRK_PATH is required")
end

if token == nil or token == "" then
  error("VAULT_TOKEN is required")
end

local file = io.open(body_file, "r")
if file == nil then
  error("Unable to open body file: " .. body_file)
end

local body = file:read("*all")
file:close()

local headers = {}
headers["Content-Type"] = "application/json"
headers["X-Vault-Token"] = token

request = function()
  return wrk.format("POST", request_path, headers, body)
end
EOF_LUA

cat >/usr/local/bin/prepare-pdf-style-data <<'EOF_PREPARE'
#!/usr/bin/env bash
set -euo pipefail

source /opt/vault-benchmark/env.sh
export VAULT_TOKEN="$(vault-token)"

DATA_DIR="/opt/vault-benchmark/data/pdf-style"
install -d -o root -g root -m 0755 "$DATA_DIR"

vault secrets enable -path=transit transit 2>/dev/null || true
vault write -f transit/keys/pdf-benchmark-aes >/dev/null

vault secrets enable -path=transform transform 2>/dev/null || true
vault write transform/transformations/fpe/card-number \
  template=builtin/creditcardnumber \
  tweak_source=internal \
  allowed_roles=payments >/dev/null
vault write transform/role/payments transformations=card-number >/dev/null

python3 <<'PY'
import base64
import json
from pathlib import Path

data_dir = Path("/opt/vault-benchmark/data/pdf-style")
data_dir.mkdir(parents=True, exist_ok=True)

for count in (20, 40, 80, 160, 320):
    transit_batch = []
    fpe_batch = []
    for index in range(1, count + 1):
        plaintext = (f"hashicorp-vault-benchmark-payload-{count}-{index:04d}").encode()
        transit_batch.append({"plaintext": base64.b64encode(plaintext).decode()})
        fpe_batch.append({
            "value": f"411111{index:010d}",
            "transformation": "card-number",
        })

    (data_dir / f"transit-encrypt-{count}.json").write_text(
        json.dumps({"batch_input": transit_batch}, separators=(",", ":")),
        encoding="utf-8",
    )
    (data_dir / f"transform-fpe-encode-{count}.json").write_text(
        json.dumps({"batch_input": fpe_batch}, separators=(",", ":")),
        encoding="utf-8",
    )
PY

for count in 20 40 80 160 320; do
  curl -fsS \
    -H "X-Vault-Token: $VAULT_TOKEN" \
    -H "Content-Type: application/json" \
    --data "@/opt/vault-benchmark/data/pdf-style/transit-encrypt-${count}.json" \
    "$VAULT_ADDR/v1/transit/encrypt/pdf-benchmark-aes" \
    | jq '{batch_input: [.data.batch_results[] | {ciphertext: .ciphertext}]}' \
    >"/opt/vault-benchmark/data/pdf-style/transit-decrypt-${count}.json"
done

unset VAULT_TOKEN
echo "Prepared PDF-style benchmark request bodies in $DATA_DIR"
EOF_PREPARE
chmod 0755 /usr/local/bin/prepare-pdf-style-data

cat >/usr/local/bin/run-pdf-style-one <<'EOF_ONE'
#!/usr/bin/env bash
set -euo pipefail

source /opt/vault-benchmark/env.sh

SCENARIO="${SCENARIO:-${1:-transit-encrypt}}"
BATCH_COUNT="${BATCH_COUNT:-${2:-20}}"
THREADS="${THREADS:-${3:-2}}"
CONNECTIONS="${CONNECTIONS:-${4:-$THREADS}}"
DURATION="${DURATION:-${5:-10s}}"
RESULT_DIR="${RESULT_DIR:-/opt/vault-benchmark/results/manual-pdf-style}"
DATA_DIR="/opt/vault-benchmark/data/pdf-style"

case "$SCENARIO" in
  transit-encrypt)
    WRK_PATH="/v1/transit/encrypt/pdf-benchmark-aes"
    WRK_BODY_FILE="$DATA_DIR/transit-encrypt-${BATCH_COUNT}.json"
    ;;
  transit-decrypt)
    WRK_PATH="/v1/transit/decrypt/pdf-benchmark-aes"
    WRK_BODY_FILE="$DATA_DIR/transit-decrypt-${BATCH_COUNT}.json"
    ;;
  transform-fpe-encode)
    WRK_PATH="/v1/transform/encode/payments"
    WRK_BODY_FILE="$DATA_DIR/transform-fpe-encode-${BATCH_COUNT}.json"
    ;;
  *)
    echo "Unknown SCENARIO: $SCENARIO" >&2
    exit 1
    ;;
esac

if [ ! -f "$WRK_BODY_FILE" ]; then
  echo "Missing request body: $WRK_BODY_FILE" >&2
  echo "Run prepare-pdf-style-data first." >&2
  exit 1
fi

install -d -o root -g root -m 0755 "$RESULT_DIR/raw"
export VAULT_TOKEN="$(vault-token)"
export WRK_PATH WRK_BODY_FILE

OUT="$RESULT_DIR/raw/${SCENARIO}-${BATCH_COUNT}-t${THREADS}-c${CONNECTIONS}.txt"

set +e
wrk --latency \
  -t"$THREADS" \
  -c"$CONNECTIONS" \
  -d"$DURATION" \
  -s /opt/vault-benchmark/lua/static-json.lua \
  "$VAULT_ADDR" >"$OUT" 2>&1
rc=$?
set -e

unset VAULT_TOKEN

python3 - "$OUT" "$RESULT_DIR/summary.csv" "$SCENARIO" "$BATCH_COUNT" "$THREADS" "$CONNECTIONS" "$DURATION" <<'PY'
import csv
import re
import sys
from pathlib import Path

out, summary, scenario, batch_count, threads, connections, duration = sys.argv[1:]
text = Path(out).read_text(encoding="utf-8", errors="replace")

def match(pattern, default=""):
    found = re.search(pattern, text, re.MULTILINE)
    return found.group(1) if found else default

lat = re.search(r"Latency\s+([0-9.]+[a-z]+)\s+([0-9.]+[a-z]+)\s+([0-9.]+[a-z]+)", text)
requests = match(r"^\s*([0-9]+)\s+requests in")
rps = match(r"Requests/sec:\s+([0-9.]+)")
transfer = match(r"Transfer/sec:\s+([0-9.]+[A-Za-z/]+)")

row = {
    "scenario": scenario,
    "batch_count": batch_count,
    "threads": threads,
    "connections": connections,
    "duration": duration,
    "requests": requests,
    "requests_per_sec": rps,
    "items_per_sec": f"{float(rps) * int(batch_count):.2f}" if rps else "",
    "avg_latency": lat.group(1) if lat else "",
    "stdev_latency": lat.group(2) if lat else "",
    "max_latency": lat.group(3) if lat else "",
    "transfer_per_sec": transfer,
    "exit_code": "0",
}

summary_path = Path(summary)
write_header = not summary_path.exists()
with summary_path.open("a", newline="", encoding="utf-8") as fh:
    writer = csv.DictWriter(fh, fieldnames=list(row))
    if write_header:
        writer.writeheader()
    writer.writerow(row)
PY

cat "$OUT"
exit "$rc"
EOF_ONE
chmod 0755 /usr/local/bin/run-pdf-style-one

cat >/usr/local/bin/run-pdf-style-matrix <<'EOF_MATRIX'
#!/usr/bin/env bash
set -euo pipefail

DURATION="${DURATION:-10s}"
SCENARIOS="${SCENARIOS:-transit-encrypt transit-decrypt transform-fpe-encode}"
COUNTS="${COUNTS:-20 40 80 160 320}"
THREAD_MATRIX="${THREAD_MATRIX:-2 4 8 16 32 64 128}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
RESULT_DIR="/opt/vault-benchmark/results/${TIMESTAMP}-pdf-style-matrix"

prepare-pdf-style-data
install -d -o root -g root -m 0755 "$RESULT_DIR"

for scenario in $SCENARIOS; do
  for count in $COUNTS; do
    for tc in $THREAD_MATRIX; do
      SCENARIO="$scenario" \
      BATCH_COUNT="$count" \
      THREADS="$tc" \
      CONNECTIONS="$tc" \
      DURATION="$DURATION" \
      RESULT_DIR="$RESULT_DIR" \
      run-pdf-style-one >/dev/null
      echo "completed scenario=$scenario batch=$count threads=$tc duration=$DURATION"
    done
  done
done

echo "$RESULT_DIR" > /opt/vault-benchmark/results/latest-pdf-style-matrix
echo "result_dir=$RESULT_DIR"
cat "$RESULT_DIR/summary.csv"
EOF_MATRIX
chmod 0755 /usr/local/bin/run-pdf-style-matrix

cat >/usr/local/bin/run-ten-million-load <<'EOF_10M'
#!/usr/bin/env bash
set -euo pipefail

SCENARIO="${SCENARIO:-transit-encrypt}"
BATCH_COUNT="${BATCH_COUNT:-320}"
TARGET_ITEMS="${TARGET_ITEMS:-10000000}"
THREADS="${THREADS:-128}"
CONNECTIONS="${CONNECTIONS:-128}"
CHUNK_DURATION="${CHUNK_DURATION:-20s}"
MAX_CHUNKS="${MAX_CHUNKS:-60}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
RESULT_DIR="/opt/vault-benchmark/results/${TIMESTAMP}-ten-million-${SCENARIO}-${BATCH_COUNT}"

prepare-pdf-style-data
install -d -o root -g root -m 0755 "$RESULT_DIR"

total_requests=0
total_items=0
chunk=0

while [ "$total_items" -lt "$TARGET_ITEMS" ] && [ "$chunk" -lt "$MAX_CHUNKS" ]; do
  chunk=$((chunk + 1))
  SCENARIO="$SCENARIO" \
  BATCH_COUNT="$BATCH_COUNT" \
  THREADS="$THREADS" \
  CONNECTIONS="$CONNECTIONS" \
  DURATION="$CHUNK_DURATION" \
  RESULT_DIR="$RESULT_DIR" \
  run-pdf-style-one >/dev/null

  last_requests="$(tail -n 1 "$RESULT_DIR/summary.csv" | awk -F, '{print $6}')"
  if [ -z "$last_requests" ]; then
    last_requests=0
  fi
  total_requests=$((total_requests + last_requests))
  total_items=$((total_requests * BATCH_COUNT))
  echo "chunk=$chunk requests=$last_requests total_requests=$total_requests total_items=$total_items target_items=$TARGET_ITEMS"
done

python3 - "$RESULT_DIR/summary.csv" "$RESULT_DIR/ten-million-summary.md" "$SCENARIO" "$BATCH_COUNT" "$TARGET_ITEMS" "$THREADS" "$CONNECTIONS" "$CHUNK_DURATION" "$total_requests" "$total_items" <<'PY'
import csv
import sys
from pathlib import Path

summary_csv, out_md, scenario, batch_count, target_items, threads, connections, chunk_duration, total_requests, total_items = sys.argv[1:]
rows = list(csv.DictReader(Path(summary_csv).open(encoding="utf-8")))
rps = [float(row["requests_per_sec"]) for row in rows if row.get("requests_per_sec")]
ips = [float(row["items_per_sec"]) for row in rows if row.get("items_per_sec")]

md = f"""# Ten Million Load Result

| Field | Value |
| --- | --- |
| Scenario | `{scenario}` |
| Batch count | {batch_count} |
| Target items | {int(target_items):,} |
| Total requests | {int(total_requests):,} |
| Total items | {int(total_items):,} |
| Threads | {threads} |
| Connections | {connections} |
| Chunk duration | {chunk_duration} |
| Chunks | {len(rows)} |
| Avg requests/sec | {sum(rps) / len(rps):,.2f} |
| Avg items/sec | {sum(ips) / len(ips):,.2f} |

"""
Path(out_md).write_text(md, encoding="utf-8")
print(md)
PY

echo "$RESULT_DIR" > /opt/vault-benchmark/results/latest-ten-million
echo "result_dir=$RESULT_DIR"
cat "$RESULT_DIR/summary.csv"
EOF_10M
chmod 0755 /usr/local/bin/run-ten-million-load

echo "Installed PDF-style Vault benchmark suite"
