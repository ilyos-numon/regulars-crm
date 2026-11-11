import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';

const SAMPLE = path.resolve('tests/fixtures/sales-sample.csv');
const shot = (name: string) => path.join(process.env.ILLY_SHOT_DIR ?? 'tests/e2e/screenshots', name + '.png');

async function upload(page: Page) {
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

test('넓은 화면에서는 상세가 목록 오른쪽 열에 열린다', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await upload(page);
  await page.getByTestId('candidate-open').first().click();
  const detail = page.getByTestId('candidate-detail');
  await expect(detail).toBeVisible();
  await expect(detail).toBeInViewport();
  const d = await detail.boundingBox();
  const l = await page.getByTestId('home-list').boundingBox();
  expect(d!.x).toBeGreaterThan(l!.x + l!.width / 2);
  await expect(page.getByTestId('candidate').first()).toHaveAttribute('aria-current', 'true');
  await expect(page.locator('[aria-current="true"]')).toHaveCount(1);
  await page.screenshot({ path: shot('layout-wide'), fullPage: true });
});

test('좁은 화면에서는 상세로 이동하고 닫으면 그 항목으로 돌아온다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await upload(page);
  await page.getByTestId('candidate-open').first().click();
  await expect(page.getByTestId('detail-title')).toBeInViewport();
  await page.screenshot({ path: shot('layout-narrow'), fullPage: true });
  await page.getByTestId('detail-close').click();
  await expect(page.getByTestId('candidate').first()).toBeInViewport();
  await expect(page.locator('[aria-current="true"]')).toHaveCount(0);
});

test('좁은 화면에서 모든 탭에 소개 문구가 보이고 가로로 넘치지 않는다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await upload(page);
  for (const tab of ['home', 'briefing', 'returns', 'store', 'memos']) {
    await page.getByTestId('tab-' + tab).scrollIntoViewIfNeeded();
    await page.getByTestId('tab-' + tab).click();
    await expect(page.getByTestId('panel-' + tab)).toBeVisible();
    await expect(page.getByTestId('brand-tagline')).toBeVisible();
    const w = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(w, tab).toBeLessThanOrEqual(390);
  }
});
