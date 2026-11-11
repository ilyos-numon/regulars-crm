import { test, expect, type Page } from '@playwright/test';
import http from 'node:http';
import path from 'node:path';

const SAMPLE = path.resolve('tests/fixtures/sales-sample.csv');
const shot = (name: string) => path.join(process.env.ILLY_SHOT_DIR ?? 'tests/e2e/screenshots', `${name}.png`);
const RECEIVER_PORT = 8798;

const A_PROFILE = '방문 9번 · 평소 13일마다 · 한 번에 4,500원 · 주로 아메리카노 · 아침 시간대 · 요일은 일정하지 않음';
const A_POLITE =
  '안녕하세요. 평소 아메리카노 자주 찾아 주셨는데 38일째 뵙지 못해 안부 여쭙니다. 별일 없으시죠? 언제든 편하게 들러 주세요.';

type Pushed = { text: string; sentAt: string; candidates: number; returned: number };
let received: Pushed[] = [];
let receiver: http.Server | null = null;

function startReceiver(): Promise<void> {
  received = [];
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => {
        try {
          received.push(JSON.parse(Buffer.concat(chunks).toString('utf8')) as Pushed);
        } catch {
          /* 본문이 JSON 이 아니면 쌓지 않는다 */
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"ok":true}');
      });
    });
    server.once('error', reject);
    server.listen(RECEIVER_PORT, () => {
      receiver = server;
      resolve();
    });
  });
}

function stopReceiver(): Promise<void> {
  const server = receiver;
  receiver = null;
  if (!server) return Promise.resolve();
  return new Promise((resolve) => {
    server.close(() => resolve());
    server.closeAllConnections();
  });
}

test.beforeAll(async () => {
  await startReceiver();
});

test.afterAll(async () => {
  await stopReceiver();
});

test.beforeEach(async ({ request }) => {
  if (!receiver) await startReceiver();
  received = [];
  const res = await request.delete('/api/data');
  expect(res.ok()).toBeTruthy();
});

async function uploadSample(page: Page) {
  await page.goto('/app');
  await page.getByTestId('csv-input').setInputFiles(SAMPLE);
  await page.getByTestId('asof-input').fill('2026-10-27');
  await page.getByTestId('upload-btn').click();
  await expect(page.getByTestId('candidate')).toHaveCount(2);
}

test('전체 여정: 첫 방문부터 리포트 확인까지', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);

  // 첫 방문: 온보딩과 빈 탭 4개
  await page.goto('/app');
  await expect(page.getByTestId('onboarding')).toBeVisible();
  for (const tab of ['briefing', 'returns', 'store', 'memos']) {
    await page.getByTestId(`tab-${tab}`).click();
    await expect(page).toHaveURL(new RegExp(`#${tab}$`));
    await expect(page.getByTestId(`empty-${tab}`)).toBeVisible();
    await expect(page.getByTestId(`empty-${tab}`)).toContainText('먼저 홈에서 매출 CSV를 올려 주세요');
  }
  await page.getByTestId('tab-home').click();
  await expect(page.getByTestId('onboarding')).toBeVisible();

  // 업로드
  await page.getByTestId('csv-input').setInputFiles(SAMPLE);
  await page.getByTestId('asof-input').fill('2026-10-27');
  await page.getByTestId('upload-btn').click();
  await expect(page.getByTestId('summary')).toHaveText(
    '거래 24건, 손님 5명(카드 기준)을 읽었습니다. 단골 3명을 찾았습니다.',
  );
  await expect(page.getByTestId('candidate')).toHaveCount(2);
  await expect(page.getByTestId('onboarding')).toBeHidden();

  // 후보 상세
  await page.getByTestId('candidate-open').first().click();
  await expect(page.getByTestId('detail-title')).toHaveText('카드 ··31');
  await expect(page.getByTestId('profile-line')).toHaveText(A_PROFILE);
  await expect(page.getByTestId('hint-personal')).toContainText('갑자기 끊겼습니다');
  await expect(page.getByTestId('draft-text-0')).toHaveText(A_POLITE);
  await page.getByTestId('draft-copy-0').click();
  await expect(page.getByTestId('draft-copy-0')).toHaveText('복사했어요');
  await page.getByTestId('draft-sent-btn').click();
  await expect(page.getByTestId('draft-sent')).toHaveText('보낸 것으로 기록했습니다 (2026-10-27)');
  await page.screenshot({ path: shot('journey-detail'), fullPage: true });

  // 메모: exclude
  await page.getByTestId('memo-note').fill('원래 가을엔 뜸한 분');
  await page.getByTestId('memo-action').selectOption('exclude');
  await page.getByTestId('memo-save').click();
  await expect(page.getByTestId('memo-saved')).toHaveText('저장했습니다');
  await expect(page.getByTestId('candidate')).toHaveCount(1);
  await expect(page.getByTestId('held-back-item')).toHaveCount(1);
  await expect(page.getByTestId('held-back-item')).toHaveText('카드 ··31 — 메모: 원래 가을엔 뜸한 분');

  // 브리핑
  await page.getByTestId('tab-briefing').click();
  await expect(page).toHaveURL(/#briefing$/);
  const preview = page.getByTestId('briefing-preview');
  await expect(preview).toBeVisible();
  expect(((await preview.textContent()) ?? '').split('\n')[0]).toBe('이번 주 챙길 단골 1명');
  await page.getByTestId('briefing-send').click();
  await expect(page.getByTestId('briefing-sent')).toContainText(/^보냈습니다 \(\d{2}:\d{2}\)$/);
  expect(received).toHaveLength(1);

  // 돌아왔습니다
  await page.getByTestId('tab-returns').click();
  await expect(page).toHaveURL(/#returns$/);
  await expect(page.getByTestId('returns-summary')).toHaveText(
    '알림 2명 · 기다리는 중 2명 (아직 결과가 나오지 않았습니다)',
  );
  await expect(page.getByTestId('returns-item')).toHaveCount(2);
  await page.screenshot({ path: shot('journey-returns'), fullPage: true });

  // 가게 진단
  await page.getByTestId('tab-store').click();
  await expect(page).toHaveURL(/#store$/);
  const store = page.getByTestId('panel-store');
  for (const title of ['같은 시기 이탈·변경 전후', '리뷰·평점', '날씨·연휴']) {
    await expect(store.locator('h3', { hasText: title })).toBeVisible();
  }
  await page.screenshot({ path: shot('journey-store'), fullPage: true });
});

test('실패 경로: 수신기가 꺼져 있으면 브리핑 오류 문구가 보인다', async ({ page }) => {
  await uploadSample(page);
  await page.getByTestId('tab-briefing').click();
  await expect(page.getByTestId('briefing-preview')).toBeVisible();
  await stopReceiver();
  await page.getByTestId('briefing-send').click();
  await expect(page.getByTestId('briefing-error')).toHaveText('브리핑을 보내지 못했습니다');
  expect(received).toHaveLength(0);
});
