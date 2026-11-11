import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const SAMPLE = path.resolve('tests/fixtures/sales-sample.csv');
const REVIEWS = fs.readFileSync(path.resolve('tests/fixtures/reviews-sample.csv'), 'utf8');
const SHOT = path.join(process.env.ILLY_SHOT_DIR ?? 'tests/e2e/screenshots', 'reviews.png');

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

test('리뷰를 붙여넣으면 요약·전후 비교·기본 답글이 보인다', async ({ page }) => {
  await uploadSample(page);
  await page.goto('/app#store');
  await page.getByTestId('reviews-input').fill(REVIEWS);
  await page.getByTestId('reviews-import').click();
  await expect(page.getByTestId('reviews-summary')).toContainText('리뷰 3건 · 평균 별점 3.7 · 낮은 별점 1건');
  await expect(page.getByTestId('review-impact-0')).toHaveText(
    '2026-09-20 낮은 별점 전후 단골 방문 4번 → 4번 (변화 없음)',
  );
  await expect(page.getByTestId('review-reply-0')).toContainText('소중한 의견 감사합니다.');
  await expect(page.getByTestId('review-reply-source-0')).toHaveText('기본 문구');
  await page.screenshot({ path: SHOT, fullPage: true });
});

test('별점 열이 없으면 오류 문구가 보인다', async ({ page }) => {
  await uploadSample(page);
  await page.goto('/app#store');
  await page.getByTestId('reviews-input').fill('작성일,내용\n2026-09-20,커피가 식어서 나왔어요');
  await page.getByTestId('reviews-import').click();
  await expect(page.getByTestId('reviews-error')).toHaveText('필수 열이 없습니다: 별점');
});

test('업로드 전 가게 진단은 빈 상태 문구를 보여 준다', async ({ page }) => {
  await page.goto('/app#store');
  await expect(page.getByTestId('empty-store')).toContainText('먼저 홈에서 매출 CSV를 올려 주세요');
});
