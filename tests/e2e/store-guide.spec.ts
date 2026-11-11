import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';

const SAMPLE = path.resolve('tests/fixtures/sales-sample.csv');
const shot = (name: string) => path.join(process.env.ILLY_SHOT_DIR ?? 'tests/e2e/screenshots', name + '.png');

const WEATHER_EXAMPLE = '날짜,강수량\n2026-10-12,14\n2026-10-13,30\n2026-10-14,0';
const REVIEWS_EXAMPLE =
  '작성일,별점,내용\n2026-10-05,5,아메리카노가 늘 맛있어요\n2026-10-12,2,주문이 늦게 나왔어요\n2026-10-20,4,창가 자리가 좋아요';

async function openStore(page: Page) {
  await page.goto('/app');
  await page.getByTestId('csv-input').setInputFiles(SAMPLE);
  await page.getByTestId('asof-input').fill('2026-10-27');
  await page.getByTestId('upload-btn').click();
  await expect(page.getByTestId('summary')).toContainText('단골 3명');
  await page.getByTestId('tab-store').click();
  await expect(page.getByTestId('panel-store')).toBeVisible();
}

test.beforeEach(async ({ request }) => {
  const res = await request.delete('/api/data');
  expect(res.ok()).toBeTruthy();
});

test('가게 진단 탭에 출처 안내와 선택 안내 문구가 보인다', async ({ page }) => {
  await openStore(page);
  await expect(page.getByTestId('weather-source-help')).toContainText('기상자료개방포털');
  await expect(page.getByTestId('reviews-source-help')).toContainText('리뷰 관리');
  await expect(page.getByTestId('store-optional-note')).toBeVisible();
});

test('날씨 예시 채우기 후 가져오면 요약이 나온다', async ({ page }) => {
  await openStore(page);
  await page.getByTestId('weather-sample-fill').click();
  await expect(page.getByTestId('weather-input')).toHaveValue(WEATHER_EXAMPLE);
  await page.getByTestId('weather-import').click();
  await expect(page.getByTestId('weather-summary')).toHaveText('날씨 3일 · 비 온 날 2일');
  await expect(page.getByTestId('weather-error')).toBeHidden();
  await expect(page.getByTestId('weather-holidays')).toHaveText('연휴·공휴일 20일 반영');
});

test('리뷰 예시 채우기 후 가져오면 요약이 나온다', async ({ page }) => {
  await openStore(page);
  await page.getByTestId('reviews-sample-fill').click();
  await expect(page.getByTestId('reviews-input')).toHaveValue(REVIEWS_EXAMPLE);
  await page.getByTestId('reviews-import').click();
  await expect(page.getByTestId('reviews-summary')).toContainText('리뷰 3건 · 평균 별점 3.7 · 낮은 별점 1건');
  await page.screenshot({ path: shot('store-guide'), fullPage: true });
});

test('탭 구분으로 붙여넣은 리뷰도 가져온다', async ({ page }) => {
  await openStore(page);
  await page.getByTestId('reviews-input').fill('작성일\t별점\t내용\n2026-09-20\t2\t커피가 식어서 나왔어요');
  await page.getByTestId('reviews-import').click();
  await expect(page.getByTestId('reviews-summary')).toContainText('리뷰 1건');
});
