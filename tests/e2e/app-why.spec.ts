import { test, expect } from '@playwright/test';
import path from 'node:path';

const shot = (name: string) => path.join(process.env.ILLY_SHOT_DIR ?? 'tests/e2e/screenshots', name + '.png');

test.beforeEach(async ({ request }) => {
  const res = await request.delete('/api/data');
  expect(res.ok()).toBeTruthy();
});

async function openFirst(page: import('@playwright/test').Page) {
  await page.goto('/app?sample=1');
  await expect(page.getByTestId('candidate')).toHaveCount(2);
  await page.getByTestId('candidate-open').first().click();
  await expect(page.getByTestId('detail-why')).toBeVisible();
}

test('데스크톱: 방문 점·평소 간격·지금 공백·기준선과 요약 문장이 그려진다', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openFirst(page);
  const why = page.getByTestId('detail-why');
  expect(await why.getByTestId('why-visit').count()).toBeGreaterThanOrEqual(3);
  for (const id of ['why-gap', 'why-usual', 'why-threshold']) await expect(why.getByTestId(id)).toHaveCount(1);
  const sum = why.getByTestId('why-summary');
  await expect(sum).toContainText('평소 13일마다');
  await expect(sum).toContainText('38일째');
  await expect(sum).toContainText('2.5배');
  await expect.poll(async () => why.getByTestId('why-gap').evaluate((e) => getComputedStyle(e).opacity), { timeout: 3000 }).toBe('1');
  await page.screenshot({ path: shot('app-why-desktop'), fullPage: true });
});

test('뺀 날 표시 개수가 목록 카드의 비·연휴 일수와 같다', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/app?sample=1');
  await expect(page.getByTestId('candidate')).toHaveCount(2);
  const note = await page.getByTestId('candidate-note').first().innerText();
  const m = note.match(/비·연휴 (\d+)일/);
  expect(m).not.toBeNull();
  await page.getByTestId('candidate-open').first().click();
  await expect(page.getByTestId('detail-why')).toBeVisible();
  await expect(page.getByTestId('why-excluded')).toHaveCount(Number(m![1]));
});

test('기준선은 공백 막대 안에 있고 공백은 마지막 방문 점에서 시작한다', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openFirst(page);
  const why = page.getByTestId('detail-why');
  await expect.poll(async () => why.getByTestId('why-gap').evaluate((e) => getComputedStyle(e).opacity), { timeout: 3000 }).toBe('1');
  await expect.poll(async () => {
    const th = await why.getByTestId('why-threshold').boundingBox();
    const gap = await why.getByTestId('why-gap').locator('.why-gap-bar').boundingBox();
    return th!.x < gap!.x + gap!.width;
  }, { timeout: 3000 }).toBe(true);
  await expect.poll(async () => {
    const visits = await why.getByTestId('why-visit').all();
    const last = await visits[visits.length - 1].boundingBox();
    const gap = await why.getByTestId('why-gap').locator('.why-gap-bar').boundingBox();
    return Math.abs(gap!.x - (last!.x + last!.width / 2));
  }, { timeout: 3000 }).toBeLessThanOrEqual(4);
});

test('휴대폰 390x844: 그림과 요약이 화면 폭 안에 있고 요약은 16px 이상', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openFirst(page);
  const why = page.getByTestId('detail-why');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  expect((await why.getByTestId('why-chart').boundingBox())!.width).toBeLessThanOrEqual(390);
  const fs = await why.getByTestId('why-summary').evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
  expect(fs).toBeGreaterThanOrEqual(16);
  await expect.poll(async () => why.getByTestId('why-gap').evaluate((e) => getComputedStyle(e).opacity), { timeout: 3000 }).toBe('1');
  await page.screenshot({ path: shot('app-why-mobile'), fullPage: true });
});

test('움직임 줄이기: 열자마자 모든 타임라인 요소가 보인다', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await openFirst(page);
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'off');
  const ops = await page.getByTestId('detail-why').locator('[data-testid^="why-"]').evaluateAll((els) => els.map((e) => getComputedStyle(e).opacity));
  expect(ops.length).toBeGreaterThan(5);
  for (const o of ops) expect(o).toBe('1');
  await ctx.close();
});

test('개발자 보기가 꺼진 상세 화면에는 엔진 용어가 없다', async ({ page }) => {
  await openFirst(page);
  const text = await page.evaluate(() => document.body.innerText);
  expect(text).not.toMatch(/n8n|api|hash|llm/i);
});
