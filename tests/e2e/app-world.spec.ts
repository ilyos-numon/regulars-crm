import { test, expect } from '@playwright/test';
import path from 'node:path';

const SAMPLE = path.resolve('tests/fixtures/sales-sample.csv');
const shot = (name: string) => path.join(process.env.ILLY_SHOT_DIR ?? 'tests/e2e/screenshots', name + '.png');

test.beforeEach(async ({ request }) => {
  const res = await request.delete('/api/data');
  expect(res.ok()).toBeTruthy();
});

test('샘플 바로 보기: 카운터와 늦음 막대 2개', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/app?sample=1');
  await expect(page.getByTestId('summary')).toContainText('단골 3명');
  await expect(page.getByTestId('app-counter')).toHaveText('이번 주 챙길 단골 2 | 전체 단골 3');
  const bars = page.getByTestId('candidate-ratio');
  await expect(bars).toHaveCount(2);
  for (let i = 0; i < 2; i++) {
    await expect(bars.nth(i)).toHaveAttribute('data-over', 'true');
    await expect(bars.nth(i)).toHaveAttribute('aria-hidden', 'true');
  }
  await page.screenshot({ path: shot('app-desktop'), fullPage: true });
});

test('상세를 열면 나머지 단골이 흐려지고 닫으면 풀린다', async ({ page }) => {
  await page.goto('/app?sample=1');
  await expect(page.getByTestId('candidate')).toHaveCount(2);
  await page.getByTestId('candidate-open').first().click();
  await expect(page.getByTestId('candidate-detail')).toBeVisible();
  const items = page.getByTestId('candidate');
  await expect(items.nth(1)).toHaveClass(/is-dimmed/);
  await expect(items.first()).not.toHaveClass(/is-dimmed/);
  await page.getByTestId('detail-close').click();
  await expect(page.locator('.is-dimmed')).toHaveCount(0);
});

test('모바일 390x844: 하단 탭 바, 터치 크기, 가로 넘침 없음', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/app?sample=1');
  await expect(page.getByTestId('summary')).toContainText('단골 3명');
  const tb = await page.getByTestId('tabs').boundingBox();
  expect(tb!.y + tb!.height).toBeGreaterThanOrEqual(843);
  for (const t of ['home', 'briefing', 'returns', 'store', 'memos']) {
    const b = await page.getByTestId(`tab-${t}`).boundingBox();
    expect(b!.height).toBeGreaterThanOrEqual(44);
  }
  const fs = await page.evaluate(() => parseFloat(getComputedStyle(document.body).fontSize));
  expect(fs).toBeGreaterThanOrEqual(16);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: shot('app-mobile'), fullPage: true });
});

test('이미 올린 매출이 있으면 샘플을 다시 올리지 않고 안내한다', async ({ page }) => {
  await page.goto('/app');
  await page.getByTestId('csv-input').setInputFiles(SAMPLE);
  await page.getByTestId('asof-input').fill('2026-10-27');
  await page.getByTestId('upload-btn').click();
  await expect(page.getByTestId('summary')).toContainText('단골 3명');
  const posts: string[] = [];
  page.on('request', (q) => { if (q.method() === 'POST' && q.url().includes('/api/upload')) posts.push(q.url()); });
  await page.goto('/app?sample=1');
  await expect(page.getByTestId('toast')).toContainText('이미 올린 매출이 있어');
  expect(posts).toHaveLength(0);
});

test('움직임 줄이기: 모션 꺼짐, 단골 목록이 바로 최종 상태', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto('/app?sample=1');
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'off');
  await expect(page.getByTestId('summary')).toContainText('단골 3명');
  const ops = await page.getByTestId('candidate').evaluateAll((els) => els.map((e) => getComputedStyle(e).opacity));
  expect(ops.length).toBe(2);
  for (const o of ops) expect(o).toBe('1');
  await ctx.close();
});

test('앱은 같은 출처 자원만 쓰고 미니홈피 글꼴이 적용된다', async ({ page, baseURL }) => {
  const origin = new URL(baseURL!).origin;
  const urls: string[] = [];
  page.on('request', (q) => urls.push(q.url()));
  await page.goto('/app');
  await page.evaluate(() => document.fonts.ready);
  for (const u of urls) {
    if (u.startsWith('data:') || u.startsWith('blob:')) continue;
    expect(new URL(u).origin).toBe(origin);
  }
  const fam = await page.evaluate(() => ({
    h1: getComputedStyle(document.querySelector('h1')!).fontFamily,
    body: getComputedStyle(document.body).fontFamily,
  }));
  expect(fam.h1.includes('Galmuri11') || fam.body.includes('Pretendard')).toBe(true);
});
