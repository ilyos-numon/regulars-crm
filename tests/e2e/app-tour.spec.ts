import { test, expect } from '@playwright/test';
import path from 'node:path';

const SAMPLE = path.resolve('tests/fixtures/sales-sample.csv');
const shot = (name: string) => path.join(process.env.ILLY_SHOT_DIR ?? 'tests/e2e/screenshots', name + '.png');
const TOUR = '/app?sample=1&tour=1';

test.beforeEach(async ({ request }) => {
  const res = await request.delete('/api/data');
  expect(res.ok()).toBeTruthy();
});

test('앱에 직접 진입하면 둘러보기·데모 띠·샘플 업로드가 없다', async ({ page }) => {
  const posts: string[] = [];
  page.on('request', (q) => { if (q.method() === 'POST' && q.url().includes('/api/upload')) posts.push(q.url()); });
  await page.goto('/app');
  await expect(page.getByTestId('onboarding')).toBeVisible();
  await expect(page.getByTestId('tour')).toHaveCount(0);
  await expect(page.getByTestId('demo-band')).toBeHidden();
  await expect(page.getByTestId('tour-replay')).toBeHidden();
  expect(posts).toHaveLength(0);
});

test('소개에서 앱 열기 → 3단계 둘러보기를 끝까지 따라간다', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await page.getByTestId('landing-tab-app').click();
  await expect(page).toHaveURL(/\/app#home$/);
  const step = (n: number) => page.locator(`[data-testid="tour-step"][data-step="${n}"]`);
  await expect(step(1)).toContainText('이번 주 챙길 단골');
  await expect(page.locator('.is-tour-target')).toHaveAttribute('id', 'result');
  await expect(page.getByTestId('tour')).toBeVisible();
  await page.screenshot({ path: shot('app-tour-desktop'), fullPage: true });
  await page.getByTestId('tour-next').click();
  await expect(step(2)).toContainText('자세히');
  await page.getByTestId('tour-next').click();
  await expect(step(3)).toContainText('월요일 브리핑');
  await expect(page.getByTestId('tour-next')).toHaveText('마치기');
  await page.getByTestId('tour-next').click();
  await expect(page.getByTestId('tour')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('dg.tour.done'))).toBe('1');
  await expect(page.locator('[aria-current="true"]')).toHaveCount(0);
});

test('닫은 뒤 다시 들어오면 둘러보기가 뜨지 않고 다시 보기로만 열린다', async ({ page }) => {
  await page.goto(TOUR);
  await page.getByTestId('tour-close').click();
  await expect(page.getByTestId('tour')).toHaveCount(0);
  await page.goto(TOUR);
  await expect(page.getByTestId('toast')).toContainText('이미 올린 매출이 있어');
  await expect(page.getByTestId('summary')).toBeVisible();
  await expect(page.getByTestId('tour')).toHaveCount(0);
  await page.getByTestId('tour-replay').click();
  await expect(page.locator('[data-testid="tour-step"][data-step="1"]')).toBeVisible();
});

test('?sample=1 만으로는 둘러보기가 시작되지 않는다', async ({ page }) => {
  await page.goto('/app?sample=1');
  await expect(page.getByTestId('summary')).toContainText('단골 3명');
  await expect(page.getByTestId('tour')).toHaveCount(0);
});

test('데모 띠: 샘플 뒤에 보이고 스크롤해도 화면에 남으며, 직접 올린 매출에는 없다', async ({ page, browser }) => {
  await page.goto('/app?sample=1');
  await expect(page.getByTestId('demo-band')).toContainText('데모 데이터(예시)');
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect(page.getByTestId('demo-band')).toBeInViewport();
  const ctx = await browser.newContext();
  const req = await ctx.request.delete('/api/data');
  expect(req.ok()).toBeTruthy();
  const p2 = await ctx.newPage();
  await p2.goto('/app');
  await p2.getByTestId('csv-input').setInputFiles(SAMPLE);
  await p2.getByTestId('asof-input').fill('2026-10-27');
  await p2.getByTestId('upload-btn').click();
  await expect(p2.getByTestId('summary')).toContainText('단골 3명');
  await expect(p2.getByTestId('demo-band')).toBeHidden();
  await ctx.close();
});

test('소개로 돌아가는 링크는 휴대폰에서도 크고 스크롤 뒤에도 보인다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/app?sample=1');
  await expect(page.getByTestId('summary')).toContainText('단골 3명');
  const link = page.getByTestId('app-to-landing');
  await expect(link).toHaveText('소개로');
  await expect(link).toHaveAttribute('href', '/');
  expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect(link).toBeInViewport();
  await link.click();
  await expect(page.getByTestId('landing')).toBeVisible();
});

test('휴대폰 390x844: 말풍선이 화면 안에 있고 버튼이 크며 가로 넘침이 없다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(TOUR);
  const tour = page.getByTestId('tour');
  await expect(tour).toBeVisible();
  const b = await tour.boundingBox();
  expect(b!.x).toBeGreaterThanOrEqual(0);
  expect(b!.x + b!.width).toBeLessThanOrEqual(390);
  for (const id of ['tour-next', 'tour-close']) {
    await expect.poll(async () => (await page.getByTestId(id).boundingBox())!.height, { timeout: 3000 }).toBeGreaterThanOrEqual(44);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: shot('app-tour-mobile'), fullPage: true });
});

test('저장소가 막혀도 둘러보기는 열리고 닫히며 오류가 없다', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new Error('blocked'); };
    Storage.prototype.setItem = () => { throw new Error('blocked'); };
  });
  await page.goto(TOUR);
  await expect(page.locator('[data-testid="tour-step"][data-step="1"]')).toBeVisible();
  await page.getByTestId('tour-close').click();
  await expect(page.getByTestId('tour')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('움직임 줄이기: 말풍선이 바로 보인다', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto(TOUR);
  await expect(page.getByTestId('tour')).toBeVisible();
  expect(await page.getByTestId('tour').evaluate((e) => getComputedStyle(e).opacity)).toBe('1');
  await ctx.close();
});

type Rect = { x: number; y: number; w: number; h: number };
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

for (const vp of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }]) {
  test(`${vp.width}x${vp.height}: 말풍선이 1·2·3단계에서 다른 탭·업로드 줄을 덮지 않고 화면 안에 있다`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto(TOUR);
    for (const n of [1, 2, 3]) {
      await expect(page.locator(`[data-testid="tour-step"][data-step="${n}"]`)).toBeVisible();
      const tour = page.getByTestId('tour');
      // 애니메이션이 끝날 때까지: 불투명도 1 이고 위치가 두 번 연속 같다
      let prev = '';
      await expect.poll(async () => {
        const s = await tour.evaluate((e) => {
          const r = e.getBoundingClientRect();
          return `${getComputedStyle(e).opacity}|${r.x}|${r.y}|${r.width}|${r.height}`;
        });
        const stable = s === prev && s.startsWith('1|');
        prev = s;
        return stable;
      }, { timeout: 5000, intervals: [150] }).toBe(true);
      const bb = (await tour.boundingBox())!;
      const bubble: Rect = { x: bb.x, y: bb.y, w: bb.width, h: bb.height };
      const others = await page.evaluate(() => {
        const out: { name: string; x: number; y: number; w: number; h: number }[] = [];
        document.querySelectorAll('.dg-folder-tab').forEach((el) => {
          if (el.classList.contains('is-tour-target')) return;
          const r = el.getBoundingClientRect();
          out.push({ name: 'tab:' + (el.getAttribute('data-tab') ?? ''), x: r.x, y: r.y, w: r.width, h: r.height });
        });
        const f = document.getElementById('upload-form')!.getBoundingClientRect();
        out.push({ name: 'upload-form', x: f.x, y: f.y, w: f.width, h: f.height });
        return out;
      });
      for (const o of others) {
        if (o.w === 0 || o.h === 0) continue;
        expect(overlaps(bubble, o), `단계 ${n}: 말풍선이 ${o.name} 를 덮음`).toBe(false);
      }
      expect(bubble.x).toBeGreaterThanOrEqual(0);
      expect(bubble.y).toBeGreaterThanOrEqual(0);
      expect(bubble.x + bubble.w).toBeLessThanOrEqual(vp.width);
      expect(bubble.y + bubble.h).toBeLessThanOrEqual(vp.height);
      if (n < 3) await page.getByTestId('tour-next').click();
    }
  });
}
