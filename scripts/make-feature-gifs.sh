#!/usr/bin/env bash
# README 기능별 GIF 재생성: 장면마다 빈 데이터 폴더로 서버(8796)를 새로 띄우고 scripts/record-features.ts 로 녹화(webm) → ffmpeg → assets/gifs/<장면>.gif.
# 'steps' 장면은 3단계 화면 3장(assets/screenshots/step-*.png)만 저장한다. webm 은 test-results/feature-gifs/ 에만 둔다.
# 전제: ffmpeg, Playwright chromium 설치. .env 는 읽지 않는다 (LLM_API_KEY 는 빈 값).
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
PORT=8796
OUT_DIR="test-results/feature-gifs"
GIF_DIR="assets/gifs"
MAX_BYTES=2097152
FFMPEG="$(command -v ffmpeg || true)"
if [ -z "$FFMPEG" ] && [ -x /opt/homebrew/bin/ffmpeg ]; then FFMPEG=/opt/homebrew/bin/ffmpeg; fi

if [ -z "$FFMPEG" ]; then
  echo "ffmpeg not found; install it first (brew install ffmpeg)" >&2
  exit 1
fi
FFPROBE="$(dirname "$FFMPEG")/ffprobe"
if [ ! -x "$FFPROBE" ]; then FFPROBE="$(command -v ffprobe)"; fi

if lsof -ti "tcp:$PORT" >/dev/null 2>&1; then
  echo "port $PORT is busy; stop the process using it first" >&2
  exit 1
fi

# 장면 이름과 목표 길이(초, 끝 프레임 1초 포함)
SCENES=(tour why devview store-sample briefing landing-story)
target_of() {
  case "$1" in
    tour) echo 9 ;;
    why) echo 7 ;;
    devview) echo 7 ;;
    store-sample) echo 8 ;;
    briefing) echo 6 ;;
    landing-story) echo 10 ;;
  esac
}

DATA_DIR=""
SERVER_PID=""
stop_server() {
  if [ -n "$SERVER_PID" ]; then kill "$SERVER_PID" 2>/dev/null || true; wait "$SERVER_PID" 2>/dev/null || true; fi
  SERVER_PID=""
  lsof -ti "tcp:$PORT" | xargs kill 2>/dev/null || true
  if [ -n "$DATA_DIR" ]; then rm -rf "$DATA_DIR"; fi
  DATA_DIR=""
}
trap stop_server EXIT

# 빈 데이터 폴더로 서버를 띄운다 (장면끼리 올린 매출·날씨가 섞이지 않게)
start_server() {
  DATA_DIR="$(mktemp -d "${TMPDIR:-/tmp}/regulars-features.XXXXXX")"
  PORT="$PORT" REGULARS_DATA_DIR="$DATA_DIR" REGULARS_HASH_SALT=demo-salt REGULARS_TODAY=2026-10-27 \
    LLM_API_KEY= STORE_NAME="동네 카페" PUSH_CHANNEL= PUSH_WEBHOOK_URL= \
    npx tsx src/main.ts >/dev/null 2>&1 &
  SERVER_PID=$!
  local ready=0
  for _ in $(seq 1 60); do
    if curl -sf "http://localhost:$PORT/health" >/dev/null 2>&1; then ready=1; break; fi
    sleep 1
  done
  if [ "$ready" != 1 ]; then
    echo "server not ready within 60s" >&2
    exit 1
  fi
}

record() {
  start_server
  FEATURE_BASE_URL="http://localhost:$PORT" npx tsx scripts/record-features.ts "$1"
  stop_server
}

# 한 장면을 GIF 로: 첫 화면 앞은 잘라내고, (목표 − 1초)를 넘으면 균일하게 빠르게 해 맞춘 뒤 끝 프레임 1초.
# 2MB 를 넘으면 색 64 → 6fps → 폭 560 순으로 줄인다.
encode() {
  local scene="$1" colors="$2" fps="$3" width="$4"
  local webm="$OUT_DIR/$scene.webm" pal="$OUT_DIR/$scene.pal.png" gif="$GIF_DIR/$scene.gif"
  local pre="trim=start=${LEAD},setpts=PTS-STARTPTS,setpts=${SPEED}*PTS,fps=${fps},scale=${width}:-1:flags=lanczos,mpdecimate=hi=64*24:lo=64*8:frac=0.5,tpad=stop_mode=clone:stop_duration=1"
  "$FFMPEG" -v error -y -i "$webm" -vf "$pre,palettegen=stats_mode=diff:max_colors=${colors}" "$pal"
  "$FFMPEG" -v error -y -i "$webm" -i "$pal" -lavfi "${pre}[x];[x][1:v]paletteuse=dither=none:diff_mode=rectangle" -fps_mode vfr "$gif"
}

rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR" "$GIF_DIR"

echo "== steps"
record steps

for scene in "${SCENES[@]}"; do
  echo "== $scene"
  record "$scene"
  WEBM="$OUT_DIR/$scene.webm"
  test -s "$WEBM"
  LEAD="$(cat "$OUT_DIR/$scene.lead")"
  TARGET="$(target_of "$scene")"
  DUR="$("$FFPROBE" -v error -show_entries format=duration -of csv=p=0 "$WEBM")"
  BODY="$(awk -v d="$DUR" -v l="$LEAD" 'BEGIN { printf "%.3f", d - l }')"
  SPEED="$(awk -v b="$BODY" -v t="$TARGET" 'BEGIN { m = t - 1; if (b > m) printf "%.6f", m / b; else printf "1" }')"
  GIF="$GIF_DIR/$scene.gif"
  STEP=0
  for ladder in "96 8 640" "64 8 640" "64 6 640" "64 6 560"; do
    read -r COLORS FPS WIDTH <<<"$ladder"
    encode "$scene" "$COLORS" "$FPS" "$WIDTH"
    SIZE="$(stat -f%z "$GIF" 2>/dev/null || stat -c%s "$GIF")"
    if [ "$SIZE" -le "$MAX_BYTES" ]; then break; fi
    STEP=$((STEP + 1))
  done
  if [ "$SIZE" -gt "$MAX_BYTES" ]; then
    echo "$scene: GIF ${SIZE} bytes is over ${MAX_BYTES} after the size ladder" >&2
    exit 1
  fi
  GDUR="$("$FFPROBE" -v error -show_entries format=duration -of csv=p=0 "$GIF")"
  echo "$scene: webm ${DUR}s lead ${LEAD}s body ${BODY}s setpts ${SPEED} -> gif ${GDUR}s ${SIZE} bytes (${COLORS} colors ${FPS}fps ${WIDTH}px, ladder step ${STEP})"
done
echo "GIFs $ROOT/$GIF_DIR"
