import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const SAMPLE = path.resolve('tests/fixtures/sales-sample.csv');
const WEATHER = fs.readFileSync(path.resolve('tests/fixtures/weather-sample.csv'), 'utf8');
const SHOT = path.join(process.env.ILLY_SHOT_DIR ?? 'tests/e2e/screenshots', 'weather.png');

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

test('날씨 기록을 들여오면 요약이 보이고 홈 후보 A 는 유지, B 는 보류된다', async ({ page }) => {
  await uploadSample(page);
  await page.goto('/app#store');
  await page.getByTestId('weather-input').fill(WEATHER);
  await page.getByTestId('weather-import').click();
  await expect(page.getByTestId('weather-summary')).toContainText('날씨 12일 · 비 온 날 6일');
  await expect(page.getByTestId('weather-holidays')).toContainText('연휴·공휴일');
  await page.screenshot({ path: SHOT, fullPage: true });

  await page.goto('/app#home');
  await expect(page.getByTestId('candidate')).toHaveCount(1);
  await expect(page.getByTestId('candidate-note')).toHaveText('비·연휴 11일을 빼도 2.1배');
  await expect(page.getByTestId('held-back-item')).toHaveText(
    '카드 ··07 — 비·연휴 7일을 빼면 1.9배 — 날씨 영향일 수 있어 이번 주는 보류',
  );
});

test('날짜 열이 없는 텍스트는 오류 문구가 보인다', async ({ page }) => {
  await uploadSample(page);
  await page.goto('/app#store');
  await page.getByTestId('weather-input').fill('강수량\n3\n0');
  await page.getByTestId('weather-import').click();
  await expect(page.getByTestId('weather-error')).toContainText('필수 열이 없습니다: 날짜');
});

test('업로드 전 가게 진단은 안내 문구를 보여준다', async ({ page }) => {
  await page.goto('/app#store');
  await expect(page.getByTestId('empty-store')).toBeVisible();
  await expect(page.getByTestId('empty-store')).toContainText('먼저 홈에서 매출 CSV를 올려 주세요');
});
