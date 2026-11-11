#!/usr/bin/env bash
# 주간 워크플로를 로컬에서 1회 수동 실행해 알림 문구가 나오는지 확인한다.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

LOG_DIR="${SMOKE_LOG_DIR:-test-results/workflow-smoke}"
LOG_FILE="$LOG_DIR/workflow-smoke.log"
PUSH_FILE="$LOG_DIR/push-received.json"
mkdir -p "$LOG_DIR"

APP_PID=""
RECEIVER_PID=""
DATA_DIR="$(mktemp -d)"

cleanup() {
  if [ -n "$APP_PID" ] && kill -0 "$APP_PID" 2>/dev/null; then
    kill "$APP_PID" 2>/dev/null || true
    wait "$APP_PID" 2>/dev/null || true
  fi
  if [ -n "$RECEIVER_PID" ] && kill -0 "$RECEIVER_PID" 2>/dev/null; then
    kill "$RECEIVER_PID" 2>/dev/null || true
    wait "$RECEIVER_PID" 2>/dev/null || true
  fi
  docker compose down >/dev/null 2>&1 || true
  rm -rf "$DATA_DIR"
}
trap cleanup EXIT

fail() {
  echo "$1" >&2
  echo "WORKFLOW SMOKE FAIL"
  exit 1
}

# 브리핑을 받을 로컬 수신기 (8798). POST /push 본문을 파일로 남긴다.
rm -f "$PUSH_FILE"
if curl -s -o /dev/null http://localhost:8798/ 2>/dev/null; then
  fail "port 8798 is already in use"
fi
node -e '
const http = require("node:http");
const fs = require("node:fs");
const out = process.argv[1];
http.createServer((req, res) => {
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    if (req.method === "POST" && req.url === "/push") {
      fs.writeFileSync(out, Buffer.concat(chunks).toString("utf8"));
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end("{\"ok\":true}");
  });
}).listen(8798, "localhost");
' "$PUSH_FILE" >"$LOG_DIR/workflow-smoke-receiver.log" 2>&1 &
RECEIVER_PID=$!

ready=0
for _ in $(seq 1 20); do
  if curl -sf http://localhost:8798/ >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 0.5
done
[ "$ready" -eq 1 ] || fail "push receiver not ready on 8798"

docker compose up -d workflow-engine

ready=0
for _ in $(seq 1 60); do
  if docker compose exec -T workflow-engine n8n --version >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 1
done
[ "$ready" -eq 1 ] || fail "workflow engine not ready"

# CLI 가 같은 DB 를 쓰므로 엔진의 첫 기동(DB 준비)이 끝날 때까지 기다린다.
ready=0
for _ in $(seq 1 60); do
  if curl -sf http://localhost:5688/healthz/readiness >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 1
done
[ "$ready" -eq 1 ] || fail "workflow engine database not ready"

PORT=8790 REGULARS_TODAY=2026-10-27 REGULARS_DATA_DIR="$DATA_DIR" REGULARS_HASH_SALT="smoke-salt" \
  PUSH_CHANNEL=webhook PUSH_WEBHOOK_URL=http://localhost:8798/push \
  ./node_modules/.bin/tsx src/main.ts >"$LOG_DIR/workflow-smoke-app.log" 2>&1 &
APP_PID=$!

ready=0
for _ in $(seq 1 30); do
  if curl -sf http://localhost:8790/health >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 1
done
[ "$ready" -eq 1 ] || fail "app not ready on 8790"

curl -sf -X POST --data-binary @tests/fixtures/sales-sample.csv \
  -H 'Content-Type: text/csv; charset=utf-8' \
  http://localhost:8790/api/upload >/dev/null || fail "upload failed"

docker compose exec -T workflow-engine n8n import:workflow --input=/workflows/weekly-churn.json

set +e
# 엔진 본체가 작업 실행기 포트를 쓰고 있으므로 CLI 실행은 다른 포트를 쓴다.
docker compose exec -T -e N8N_RUNNERS_BROKER_PORT=5680 workflow-engine n8n execute --id=rcWeeklyChurn001 >"$LOG_FILE" 2>&1
set -e

if grep -q '이번 주 챙길 단골' "$LOG_FILE" && grep -q '카드 ··31' "$LOG_FILE" \
  && [ -f "$PUSH_FILE" ] && grep -q '지난주 돌아온 단골' "$PUSH_FILE"; then
  echo "WORKFLOW SMOKE OK"
  exit 0
fi
tail -20 "$LOG_FILE" >&2 || true
echo "WORKFLOW SMOKE FAIL"
exit 1
