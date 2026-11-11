import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';

const SAMPLE = path.resolve('tests/fixtures/sales-sample.csv');
const SHOT = path.join(process.env.ILLY_SHOT_DIR ?? 'tests/e2e/screenshots', 'upload-churn.png');

async function uploadSample(page: Page) {
  await page.goto('/app');
  await page.getByTestId('csv-input').setInputFiles(SAMPLE);
  await page.getByTestId('asof-input').fill('2026-10-27');
  await page.getByTestId('upload-btn').click();
}

test('샘플 CSV 업로드 후 요약과 챙길 단골이 보인다', async ({ page }) => {
  await uploadSample(page);
  await expect(page.getByTestId('summary')).toHaveText(
    '거래 24건, 손님 5명(카드 기준)을 읽었습니다. 단골 3명을 찾았습니다.',
  );
  const items = page.getByTestId('candidate-line');
  await expect(items).toHaveCount(2);
  await expect(items.nth(0)).toHaveText('카드 ··31 · 아메리카노 — 평소 13일마다 → 38일째 (2.9배)');
  await expect(items.nth(1)).toHaveText('카드 ··07 · 라떼 — 평소 9일마다 → 24일째 (2.7배)');
  await expect(page.locator('body')).toContainText('이번 주 챙길 단골 2명');
  await page.screenshot({ path: SHOT, fullPage: true });
});

test('카드번호 열이 없는 CSV 는 오류를 보여준다', async ({ page }) => {
  await page.goto('/app');
  await page.getByTestId('csv-input').setInputFiles({
    name: 'bad.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('거래일시,금액,상품명\n2026-10-01 09:00:00,4500,라떼\n', 'utf-8'),
  });
  await page.getByTestId('upload-btn').click();
  await expect(page.getByTestId('error')).toContainText('필수 열이 없습니다: 카드번호');
});

test('업로드 후 GET /api/churn 이 후보 2명을 돌려준다', async ({ page, request }) => {
  await uploadSample(page);
  await expect(page.getByTestId('summary')).toContainText('단골 3명');
  const res = await request.get('/api/churn?asOf=2026-10-27');
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.candidates).toHaveLength(2);
});
