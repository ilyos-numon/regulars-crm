#!/usr/bin/env bash
# README 데모 GIF 재생성: 데모 서버(8796) → scripts/record-demo.ts 녹화(webm)·화면 10장 → ffmpeg → assets/demo.gif.
# 전제: ffmpeg, Playwright chromium 설치. .env 는 읽지 않는다 (LLM_API_KEY 는 빈 값).
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
PORT=8796
WEBM="test-results/demo/demo.webm"
PAL="test-results/demo/pal.png"
GIF="assets/demo.gif"
FFMPEG="$(command -v ffmpeg || true)"
if [ -z "$FFMPEG" ] && [ -x /opt/homebrew/bin/ffmpeg ]; then FFMPEG=/opt/homebrew/bin/ffmpeg; fi

if [ -z "$FFMPEG" ]; then
  echo "ffmpeg not found; install it first (brew install ffmpeg)" >&2
  exit 1
fi

if lsof -ti "tcp:$PORT" >/dev/null 2>&1; then
  echo "port $PORT is busy; stop the process using it first" >&2
  exit 1
fi

DATA_DIR="$(mktemp -d "${TMPDIR:-/tmp}/regulars-demo.XXXXXX")"
SERVER_PID=""
cleanup() {
  if [ -n "$SERVER_PID" ]; then kill "$SERVER_PID" 2>/dev/null || true; fi
  lsof -ti "tcp:$PORT" | xargs kill 2>/dev/null || true
  rm -rf "$DATA_DIR"
}
trap cleanup EXIT

PORT="$PORT" REGULARS_DATA_DIR="$DATA_DIR" REGULARS_HASH_SALT=demo-salt REGULARS_TODAY=2026-10-27 \
  LLM_API_KEY= STORE_NAME="동네 카페" PUSH_CHANNEL= PUSH_WEBHOOK_URL= \
  npx tsx src/main.ts &
SERVER_PID=$!

ready=0
for _ in $(seq 1 60); do
  if curl -sf "http://localhost:$PORT/health" >/dev/null 2>&1; then ready=1; break; fi
  sleep 1
done
if [ "$ready" != 1 ]; then
  echo "demo server not ready within 60s" >&2
  exit 1
fi

DEMO_BASE_URL="http://localhost:$PORT" npx tsx scripts/record-demo.ts
test -s "$WEBM"

mkdir -p "$(dirname "$GIF")"
# 하늘 점무늬 바탕과 webm 잡티 때문에 960폭·10fps 는 8MB 를 넘는다: 8fps·800폭, 거의 같은 프레임은 버리고(mpdecimate) 96색 팔레트로 줄인다. 버린 뒤 마지막 장면이 짧아지지 않게 끝 프레임을 2초 늘린다(tpad).
FFPROBE="$(dirname "$FFMPEG")/ffprobe"
if [ ! -x "$FFPROBE" ]; then FFPROBE="$(command -v ffprobe)"; fi
# 끝 패딩 2초 포함 33초를 넘으면 전체를 균일하게 빠르게 해 33초에 맞춘다 (부하로 녹화가 늘어나는 경우).
DUR="$("$FFPROBE" -v error -show_entries format=duration -of csv=p=0 "$WEBM")"
SPEED="$(awk -v d="$DUR" 'BEGIN { t = 31; if (d > t) printf "%.6f", t / d; else printf "1" }')"
echo "webm ${DUR}s, setpts factor ${SPEED}"
PRE="setpts=${SPEED}*PTS,fps=8,scale=800:-1:flags=lanczos,mpdecimate=hi=64*24:lo=64*8:frac=0.5,tpad=stop_mode=clone:stop_duration=2"
"$FFMPEG" -y -i "$WEBM" -vf "$PRE,palettegen=stats_mode=diff:max_colors=96" "$PAL"
"$FFMPEG" -y -i "$WEBM" -i "$PAL" -lavfi "${PRE}[x];[x][1:v]paletteuse=dither=none:diff_mode=rectangle" -fps_mode vfr "$GIF"
echo "GIF $ROOT/$GIF"
