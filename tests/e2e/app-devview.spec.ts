import { test, expect } from '@playwright/test';
import path from 'node:path';

const shot = (name: string) => path.join(process.env.ILLY_SHOT_DIR ?? 'tests/e2e/screenshots', name + '.png');

test.beforeEach(async ({ request }) => {
  const res = await request.delete('/api/data');
  expect(res.ok()).toBeTruthy();
});

const note = (page: import('@playwright/test').Page, area: string) => page.locator(`[data-testid="dev-note"][data-area="${area}"]`);

test('기본 상태: 개발자 보기는 꺼져 있고 주석이 없다', async ({ page }) => {
  await page.goto('/app?sample=1');
  await expect(page.getByTestId('summary')).toContainText('단골 3명');
  await expect(page.getByTestId('dev-toggle')).toHaveText('개발자 보기');
  await expect(page.getByTestId('dev-toggle')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByTestId('dev-note')).toHaveCount(0);
});

test('켜면 영역마다 요청 주소 주석이 붙는다', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/app?sample=1');
  await expect(page.getByTestId('candidate')).toHaveCount(2);
  await page.getByTestId('candidate-open').first().click();
  await expect(page.getByTestId('detail-why')).toBeVisible();
  await page.getByTestId('dev-toggle').click();
  await expect(page.getByTestId('dev-toggle')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('html')).toHaveAttribute('data-dev', 'on');
  for (const area of ['counter', 'upload', 'list', 'why', 'section-profile']) {
    await expect(note(page, area).first()).toBeAttached();
    await expect(note(page, area).first()).toContainText('/api/');
  }
  await page.screenshot({ path: shot('app-devview'), fullPage: true });
});

test('켠 채 탭을 옮기면 그 탭 영역에 주석이 붙는다', async ({ page }) => {
  await page.goto('/app?sample=1');
  await expect(page.getByTestId('summary')).toContainText('단골 3명');
  await page.getByTestId('dev-toggle').click();
  await page.getByTestId('tab-briefing').click();
  await expect(note(page, 'section-briefing').first()).toContainText('/api/briefing');
});

test('다시 끄면 주석이 모두 사라지고 본문에 엔진 용어가 없다', async ({ page }) => {
  await page.goto('/app?sample=1');
  await expect(page.getByTestId('candidate')).toHaveCount(2);
  await page.getByTestId('candidate-open').first().click();
  await page.getByTestId('dev-toggle').click();
  await expect(page.getByTestId('dev-note').first()).toBeAttached();
  await page.getByTestId('dev-toggle').click();
  await expect(page.getByTestId('dev-toggle')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByTestId('dev-note')).toHaveCount(0);
  expect(await page.evaluate(() => document.body.innerText)).not.toMatch(/api/i);
});

test('?dev=1 로 들어오면 처음부터 켜져 있다', async ({ page }) => {
  await page.goto('/app?sample=1&dev=1');
  await expect(page.getByTestId('summary')).toContainText('단골 3명');
  await expect(page.getByTestId('dev-toggle')).toHaveAttribute('aria-pressed', 'true');
  expect(await page.getByTestId('dev-note').count()).toBeGreaterThanOrEqual(1);
});

test('휴대폰 390x844: 켜도 가로로 넘치지 않고 주석이 클릭을 막지 않는다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/app?sample=1');
  await expect(page.getByTestId('candidate')).toHaveCount(2);
  await page.getByTestId('dev-toggle').click();
  await expect(page.getByTestId('dev-toggle')).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.getByTestId('candidate-open').first().click({ timeout: 5000 });
  await expect(page.getByTestId('candidate-detail')).toBeVisible();
  await page.screenshot({ path: shot('app-devview-mobile'), fullPage: true });
});
