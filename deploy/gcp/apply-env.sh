#!/usr/bin/env bash
# regulars-crm 첫 배포·설정 반영: 비밀 값 준비 → service.yaml 렌더(임시 파일) → gcloud run services replace → /health 확인.
#   환경 파일은 읽지 않는다. 비밀 REGULARS_HASH_SALT 는 활성 버전이 없을 때만 무작위 값을 넣는다 (값은 출력하지 않는다).
#   코드 변경 배포는 GitHub Actions(.github/workflows/deploy.yml)가 이미지만 바꾼다.
#   setup.sh 를 먼저 실행해 서비스 계정·비밀·IAM 이 있어야 한다.
#
# 사용: GCP_PROJECT_ID=illy-portfolio [GCP_REGION=asia-northeast3] IMAGE=<이미지> bash deploy/gcp/apply-env.sh [--dry-run] [--allow-public-iam]
#   --dry-run           gcloud·curl 을 실행하지 않고 할 일만 출력
#   --allow-public-iam  서비스에 allUsers run.invoker 도 부여 (invoker-iam-disabled 가 막힐 때만)
# 이미지: IMAGE 환경변수, 없으면 지금 서비스가 쓰는 이미지. 둘 다 없으면 안내하고 끝낸다.
set -euo pipefail

DRY_RUN=0
ALLOW_PUBLIC_IAM=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --allow-public-iam) ALLOW_PUBLIC_IAM=1 ;;
    -h|--help) sed -n '2,10p' "$0"; exit 0 ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

if [ -z "${GCP_PROJECT_ID:-}" ]; then
  echo "✗ GCP_PROJECT_ID 가 비어 있습니다" >&2
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
P="$GCP_PROJECT_ID"
R="${GCP_REGION:-asia-northeast3}"
SVC="regulars-crm"
SECRET="REGULARS_HASH_SALT"
TEMPLATE="$ROOT/deploy/gcp/service.yaml"

run() {
  echo "+ $*"
  if [ "$DRY_RUN" -eq 0 ]; then "$@"; fi
}

if [ "$DRY_RUN" -eq 1 ]; then echo "(dry-run: 외부 명령을 실행하지 않습니다)"; fi
echo "프로젝트 $P · 리전 $R · 서비스 $SVC"

echo "1/8 gcloud 계정·프로젝트 접근 확인"
if [ "$DRY_RUN" -eq 1 ]; then
  echo "+ gcloud auth list --filter=status:ACTIVE --format=value(account)"
  echo "+ gcloud projects describe $P --format=value(projectNumber)"
  PROJECT_NUMBER="${GCP_PROJECT_NUMBER:-<PROJECT_NUMBER>}"
else
  account="$(gcloud auth list --filter=status:ACTIVE --format='value(account)' 2>/dev/null | head -1 || true)"
  if [ -z "$account" ]; then
    echo "✗ 활성 gcloud 계정이 없습니다. gcloud auth login 후 다시 돌리세요" >&2
    exit 1
  fi
  if ! PROJECT_NUMBER="$(gcloud projects describe "$P" --format='value(projectNumber)' 2>/dev/null)" \
    || [ -z "$PROJECT_NUMBER" ]; then
    echo "✗ 계정 $account 로 프로젝트 $P 에 접근할 수 없습니다" >&2
    exit 1
  fi
  echo "  ✓ 계정 $account · 프로젝트 번호 $PROJECT_NUMBER"
fi
BASE_URL="https://${SVC}-${PROJECT_NUMBER}.${R}.run.app"

echo "2/8 비밀 $SECRET (활성 버전이 없을 때만 새 무작위 값)"
if [ "$DRY_RUN" -eq 1 ]; then
  echo "+ gcloud secrets versions list $SECRET --filter=state=ENABLED --limit=1 --project=$P"
  echo "+ (버전이 없을 때만) openssl rand -hex 32 | gcloud secrets versions add $SECRET --data-file=- --project=$P"
else
  if ! gcloud secrets describe "$SECRET" --project="$P" >/dev/null 2>&1; then
    echo "✗ 비밀 $SECRET 이 없습니다. deploy/gcp/setup.sh 를 먼저 돌리세요" >&2
    exit 1
  fi
  if [ -n "$(gcloud secrets versions list "$SECRET" --filter='state=ENABLED' --format='value(name)' \
    --limit=1 --project="$P" 2>/dev/null)" ]; then
    echo "  · $SECRET 유지 (활성 버전 있음)"
  else
    openssl rand -hex 32 | tr -d '\n' | gcloud secrets versions add "$SECRET" --data-file=- --project="$P" >/dev/null
    echo "  ✓ $SECRET 새 버전 추가 (값은 출력하지 않음)"
  fi
fi

echo "3/8 이미지"
if [ -n "${IMAGE:-}" ]; then
  IMG="$IMAGE"
elif [ "$DRY_RUN" -eq 1 ]; then
  IMG="<현재 서비스 이미지>"
  echo "+ gcloud run services describe $SVC --region=$R --project=$P --format=value(spec.template.spec.containers[0].image)"
else
  IMG="$(gcloud run services describe "$SVC" --region="$R" --project="$P" \
    --format='value(spec.template.spec.containers[0].image)' 2>/dev/null || true)"
fi
if [ -z "$IMG" ]; then
  echo "✗ 배포할 이미지가 없습니다. 서비스가 아직 없으면 이미지를 먼저 빌드·push 하고 IMAGE 로 주세요:" >&2
  echo "  IMAGE=$R-docker.pkg.dev/$P/regulars-crm/regulars-crm:<tag> GCP_PROJECT_ID=$P bash deploy/gcp/apply-env.sh" >&2
  exit 1
fi
echo "  이미지: $IMG"

echo "4/8 service.yaml 렌더 (저장소 파일은 바꾸지 않음)"
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/regulars-crm-service.XXXXXX")"
trap 'rm -rf "$TMP_DIR"' EXIT
OUT="$TMP_DIR/service.yaml"
# 주석 줄은 빼고 자리표시만 채운다 (sed 구분자 | — 이미지 주소·프로젝트 ID 에 | 가 없다)
grep -v '^[[:space:]]*#' "$TEMPLATE" \
  | sed -e "s|\${IMAGE}|${IMG}|g" -e "s|\${PROJECT_ID}|${P}|g" > "$OUT"
if grep -q '[$]{' "$OUT"; then
  echo "✗ service.yaml 에 자리표시가 남았습니다: $(grep -o '[$]{[A-Z_]*}' "$OUT" | sort -u | tr '\n' ' ')" >&2
  exit 1
fi
echo "  렌더: $OUT"

echo "5/8 Cloud Run 반영"
run gcloud run services replace "$OUT" --region="$R" --project="$P"

echo "6/8 공개 IAM"
if [ "$ALLOW_PUBLIC_IAM" -eq 1 ]; then
  run gcloud run services add-iam-policy-binding "$SVC" --region="$R" --project="$P" \
    --member=allUsers --role=roles/run.invoker
else
  echo "  · 건너뜀 (invoker-iam-disabled 로 공개. 403 이면 --allow-public-iam 으로 다시 돌리세요)"
fi

echo "7/8 서비스 주소"
if [ "$DRY_RUN" -eq 1 ]; then
  echo "+ gcloud run services describe $SVC --region=$R --project=$P --format=value(metadata.annotations.\"run.googleapis.com/urls\")"
else
  gcloud run services describe "$SVC" --region="$R" --project="$P" \
    --format='value(metadata.annotations."run.googleapis.com/urls")' | tr -d '[]"' | tr ',' '\n' | sed 's/^/  /'
fi

echo "8/8 확인 $BASE_URL/health"
if [ "$DRY_RUN" -eq 1 ]; then
  echo "+ curl -sf --retry 6 --retry-delay 10 --retry-all-errors $BASE_URL/health  → {\"ok\":true} 기대"
  echo "(dry-run 끝: 외부 명령을 실행하지 않았습니다)"
  exit 0
fi
body="$(curl -sf --retry 6 --retry-delay 10 --retry-all-errors "$BASE_URL/health" || true)"
echo "  /health → ${body:-(응답 없음)}"
if [ "$(printf '%s' "$body" | tr -d '[:space:]')" != '{"ok":true}' ]; then
  echo "✗ /health 가 {\"ok\":true} 가 아닙니다" >&2
  exit 1
fi
echo "APPLY OK"
