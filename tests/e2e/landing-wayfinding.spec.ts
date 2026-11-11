import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const shot = (name: string) => path.join(process.env.ILLY_SHOT_DIR ?? 'tests/e2e/screenshots', name + '.png');
const APP = '/app?sample=1&tour=1';

test.beforeEach(async ({ request }) => {
  const res = await request.delete('/api/data');
  expect(res.ok()).toBeTruthy();
});

test('데스크톱 탭 바: 다섯 탭의 문구·주소, 앱 열기 탭은 따로 구분된다', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const links = page.getByTestId('landing-tabs').locator('a');
  await expect(links).toHaveCount(5);
  expect(await links.allTextContents()).toEqual(['홈', '이렇게 찾아요', '화면 둘러보기', '만든 방법', '앱 열기']);
  expect(await links.evaluateAll((els) => els.map((e) => e.getAttribute('href')))).toEqual(['/', '#how', '#screens', '#made', APP]);
  await expect(page.getByTestId('landing-tab-app')).toHaveClass(/lp-tab-app/);
  await page.screenshot({ path: shot('landing-toc-desktop'), fullPage: true });
});

test('탭을 누르면 그 칸으로 가고 탭 바는 화면에 남으며 현재 탭이 표시된다', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.getByTestId('landing-tab-made').click();
  await expect(page.getByTestId('landing-dev')).toBeInViewport();
  await expect(page.getByTestId('landing-tabs')).toBeInViewport();
  await expect(page.getByTestId('landing-tab-made')).toHaveClass(/is-active/);
  await page.getByTestId('landing-tab-how').click();
  await expect(page.locator('#how')).toBeInViewport();
  await expect(page.getByTestId('landing-tab-how')).toHaveClass(/is-active/);
});

test('앱 열기 버튼은 모두 같은 문구·주소이고 터치 크기를 넘는다', async ({ page }) => {
  await page.goto('/');
  const btns = page.locator('[data-open-app]');
  expect(await btns.count()).toBeGreaterThanOrEqual(4);
  for (const t of await btns.all()) {
    await expect(t).toHaveText('앱 열기');
    await expect(t).toHaveAttribute('href', APP);
  }
  for (const id of ['landing-open-app-how', 'landing-open-app-screens', 'landing-open-app-made']) {
    await page.getByTestId(id).scrollIntoViewIfNeeded();
    const b = await page.getByTestId(id).boundingBox();
    expect(b!.height).toBeGreaterThanOrEqual(44);
  }
});

test('화면 둘러보기: 카드 4개+메모 카드, 칸 순서, 만든 방법 안에 section 없음', async ({ page }) => {
  await page.goto('/');
  const screens = page.getByTestId('landing-screens');
  const cards = screens.getByTestId('landing-screen-card');
  await expect(cards).toHaveCount(4);
  const ids = ['candidates', 'briefing', 'returns', 'store'];
  for (let i = 0; i < 4; i++) {
    await expect(cards.nth(i).getByTestId(`landing-tab-${ids[i]}`)).toHaveCount(1);
  }
  await expect(screens.getByTestId('landing-screen-memos').getByTestId('landing-tab-memos')).toHaveAttribute('href', '/app#memos');
  const order = await page.evaluate(() => {
    const how = document.querySelector('#how')!;
    const sc = document.querySelector('[data-testid="landing-screens"]')!;
    const dev = document.querySelector('[data-testid="landing-dev"]')!;
    return [how.compareDocumentPosition(sc) & Node.DOCUMENT_POSITION_FOLLOWING, sc.compareDocumentPosition(dev) & Node.DOCUMENT_POSITION_FOLLOWING];
  });
  expect(order[0]).toBeTruthy();
  expect(order[1]).toBeTruthy();
  await expect(page.getByTestId('landing-dev').locator('section')).toHaveCount(0);
});

test('케이스 스터디: 문제·판단·스택 칸, 구조 그림, 사실 숫자가 저장소와 맞는다', async ({ page }) => {
  await page.goto('/');
  for (const id of ['landing-case-problem', 'landing-case-judgment', 'landing-case-stack']) {
    await expect(page.getByTestId(id)).toBeVisible();
  }
  const diagram = page.getByTestId('landing-case-diagram');
  await expect(diagram.locator('svg')).toHaveCount(1);
  expect(await diagram.locator('[data-node]').count()).toBeGreaterThanOrEqual(5);
  await expect(page.getByTestId('landing-fact')).toHaveCount(5);
  const fact = (k: string) => page.locator(`[data-fact="${k}"]`).innerText();
  const features = fs.readdirSync('src/features', { withFileTypes: true }).filter((d) => d.isDirectory()).length;
  const holidays = (fs.readFileSync('src/features/weather/holidays-kr-2026.ts', 'utf8').match(/'2026-\d\d-\d\d'/g) ?? []).length;
  const deps = Object.keys(JSON.parse(fs.readFileSync('package.json', 'utf8')).dependencies).length;
  expect(await fact('features')).toBe(String(features));
  expect(await fact('holidays')).toBe(String(holidays));
  expect(await fact('deps')).toBe(String(deps));
  expect(await fact('unit-tests')).toMatch(/^\d+$/);
  expect(await fact('e2e-tests')).toMatch(/^\d+$/);
  await page.screenshot({ path: shot('landing-case-study'), fullPage: true });
});

test('휴대폰 390x844: 탭 바는 아래 고정, 터치 크기, 가로 넘침 없음, 앱 열기 탭이 앱을 연다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const tb = await page.getByTestId('landing-tabs').boundingBox();
  expect(tb!.y + tb!.height).toBeGreaterThanOrEqual(843);
  for (const a of await page.getByTestId('landing-tabs').locator('a').all()) {
    const b = await a.boundingBox();
    expect(b!.height).toBeGreaterThanOrEqual(44);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: shot('landing-toc-mobile'), fullPage: true });
  await page.getByTestId('landing-tab-app').click();
  await expect(page).toHaveURL(/\/app#home$/);
  await expect(page.getByTestId('tour')).toBeVisible();
});

test('움직임 줄이기: 스크롤 없이 구조 그림 노드가 모두 보인다', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'off');
  const ops = await page.locator('[data-testid="landing-case-diagram"] [data-node]').evaluateAll((els) => els.map((e) => getComputedStyle(e).opacity));
  expect(ops.length).toBeGreaterThanOrEqual(5);
  for (const o of ops) expect(o).toBe('1');
  await ctx.close();
});

test('샘플로 바로 보기를 누르면 앱에서 처음 둘러보기가 1단계로 열린다', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('landing-cta-sample')).toHaveAttribute('href', '/app?sample=1');
  await page.getByTestId('landing-cta-sample').click();
  await expect(page).toHaveURL(/\/app#home$/);
  await expect(page.getByTestId('tour-step').first()).toHaveAttribute('data-step', '1');
  await expect(page.getByTestId('tour-step').first()).toContainText('이번 주 챙길 단골');
});

test('화면 카드를 누르면 예시 가게가 채워진 그 화면으로 열리고 둘러보기는 뜨지 않는다', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('landing-tab-briefing').click();
  await expect(page).toHaveURL(/\/app#briefing$/);
  await expect(page.getByTestId('summary')).toContainText('단골 3명');
  await expect(page.getByTestId('tour')).toHaveCount(0);
  await page.goto('/');
  await page.getByTestId('landing-tab-memos').click();
  await expect(page).toHaveURL(/\/app#memos$/);
  await expect(page.getByTestId('summary')).toContainText('단골 3명');
});
