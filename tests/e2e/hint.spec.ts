import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';

const SAMPLE = path.resolve('tests/fixtures/sales-sample.csv');
const SHOT = path.join(process.env.ILLY_SHOT_DIR ?? 'tests/e2e/screenshots', 'store.png');

async function uploadSample(page: Page) {
  await page.goto('/app');
  await page.getByTestId('csv-input').setInputFiles(SAMPLE);
  await page.getByTestId('asof-input').fill('2026-10-27');
  await page.getByTestId('upload-btn').click();
  await expect(page.getByTestId('summary')).toContainText('단골 3명');
}

test.beforeEach(async ({ request }) => {
  const res = await request.delete('/api/data');
  expect(res.ok()).toBeTruthy();
});

test('A 상세에 갑자기 끊겼다는 힌트와 동행 문구가 보인다', async ({ page }) => {
  await uploadSample(page);
  await page.getByTestId('candidate-open').first().click();
  await expect(page.getByTestId('detail-title')).toHaveText('카드 ··31');
  await expect(page.getByTestId('hint-personal')).toHaveText(
    '평소대로 오시다가 갑자기 끊겼습니다 같은 시기에 다른 단골 1명도 끊겼습니다 — 가게 쪽 이유일 수 있어요',
  );
});

test('가게 진단: 묶음 문구와 변경일 전후 비교', async ({ page }) => {
  await uploadSample(page);
  await page.goto('/app#store');
  await expect(page.getByTestId('hint-cluster')).toContainText(
    '단골 2명이 9월 19일부터 10월 3일 사이에 발길이 끊겼습니다.',
  );
  await page.getByTestId('hint-change-date').fill('2026-10-04');
  await page.getByTestId('hint-change-btn').click();
  await expect(page.getByTestId('hint-change-result')).toHaveText('8번 → 3번 (63% 감소)');
  await page.screenshot({ path: SHOT, fullPage: true });
});

test('변경일을 비우고 비교하면 오류 문구가 보인다', async ({ page }) => {
  await uploadSample(page);
  await page.goto('/app#store');
  await expect(page.getByTestId('hint-cluster')).toContainText('단골 2명이');
  await page.getByTestId('hint-change-btn').click();
  await expect(page.getByTestId('hint-change-result')).toHaveText('날짜는 YYYY-MM-DD 형식이어야 합니다');
});
