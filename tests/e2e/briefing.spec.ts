import { test, expect, type Page } from '@playwright/test';
import http from 'node:http';
import path from 'node:path';

const SAMPLE = path.resolve('tests/fixtures/sales-sample.csv');
const SHOT = path.join(process.env.ILLY_SHOT_DIR ?? 'tests/e2e/screenshots', 'briefing.png');
const RECEIVER_PORT = 8798;

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

test('브리핑 미리보기를 보내면 수신기에 도착하고 알림·기록이 남는다', async ({ page, request }) => {
  await uploadSample(page);
  await page.getByTestId('tab-briefing').click();
  await expect(page).toHaveURL(/#briefing$/);

  const preview = page.getByTestId('briefing-preview');
  await expect(preview).toBeVisible();
  const text = (await preview.textContent()) ?? '';
  const lines = text.split('\n');
  expect(lines[0]).toBe('이번 주 챙길 단골 2명');
  expect(lines[lines.length - 1]).toBe('지난주 돌아온 단골 0명');

  await page.getByTestId('briefing-send').click();
  await expect(page.getByTestId('briefing-sent')).toContainText(/^보냈습니다 \(\d{2}:\d{2}\)$/);
  await expect(page.getByTestId('briefing-history-item')).toHaveCount(1);

  expect(received).toHaveLength(1);
  expect(received[0].text).toBe(text);
  expect(typeof received[0].candidates).toBe('number');
  expect(typeof received[0].returned).toBe('number');
  expect(received[0].candidates).toBe(2);
  expect(received[0].returned).toBe(0);

  const notices = (await (await request.get('/api/notices')).json()) as Array<{ source: string }>;
  expect(notices.filter((n) => n.source === 'briefing')).toHaveLength(2);

  await page.screenshot({ path: SHOT, fullPage: true });
});

test('수신기가 꺼져 있으면 오류 문구를 보이고 알림은 늘지 않는다', async ({ page, request }) => {
  await uploadSample(page);
  await page.getByTestId('tab-briefing').click();
  await expect(page.getByTestId('briefing-preview')).toBeVisible();

  const before = (await (await request.get('/api/notices')).json()) as unknown[];
  await stopReceiver();

  await page.getByTestId('briefing-send').click();
  await expect(page.getByTestId('briefing-error')).toHaveText('브리핑을 보내지 못했습니다');
  await expect(page.getByTestId('briefing-sent')).toHaveText('');
  await expect(page.getByTestId('briefing-history-item')).toHaveCount(0);

  const after = (await (await request.get('/api/notices')).json()) as unknown[];
  expect(after).toHaveLength(before.length);
  expect(received).toHaveLength(0);
});

test('업로드 전 브리핑 탭은 안내 문구를 보여준다', async ({ page }) => {
  await page.goto('/app#briefing');
  await expect(page.getByTestId('empty-briefing')).toBeVisible();
  await expect(page.getByTestId('empty-briefing')).toContainText('먼저 홈에서 매출 CSV를 올려 주세요');
  await expect(page.getByTestId('briefing-preview')).toHaveCount(0);
});
