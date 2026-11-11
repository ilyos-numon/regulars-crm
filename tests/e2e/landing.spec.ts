import { test, expect } from '@playwright/test';
import path from 'node:path';

const shot = (name: string) => path.join(process.env.ILLY_SHOT_DIR ?? 'tests/e2e/screenshots', name + '.png');
const H1 = '단골은 떠날 때 말하지 않습니다';
const STEPS = ['rhythm', 'empty', 'reason', 'message', 'return'];

test.beforeEach(async ({ request }) => {
  const res = await request.delete('/api/data');
  expect(res.ok()).toBeTruthy();
});

test('데스크톱 첫 화면: 제목·가게 이름·CTA·탭·미니룸이 한 화면에 보인다', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const h1 = page.locator('h1');
  await expect(h1).toHaveCount(1);
  await expect(h1).toHaveText(H1);
  await expect(page.getByTestId('landing-store-name')).toContainText('(예시)');
  const sample = page.getByTestId('landing-cta-sample');
  await expect(sample).toHaveText('샘플로 바로 보기');
  await expect(sample).toHaveAttribute('href', '/app?sample=1');
  const upload = page.getByTestId('landing-cta-upload');
  await expect(upload).toHaveText('내 매출 CSV 올리기');
  await expect(upload).toHaveAttribute('href', '/app#home');
  const tabs: [string, string, string][] = [
    ['intro', '홈', '/'], ['candidates', '챙길 단골', '/app#home'], ['briefing', '브리핑', '/app#briefing'],
    ['returns', '돌아왔습니다', '/app#returns'], ['store', '가게 진단', '/app#store'],
  ];
  for (const [id, text, href] of tabs) {
    const t = page.getByTestId(`landing-tab-${id}`);
    await expect(t).toHaveText(text);
    await expect(t).toHaveAttribute('href', href);
  }
  await expect(page.getByTestId('landing-tab-intro')).toHaveAttribute('aria-current', 'page');
  for (const loc of [h1, sample, upload, page.getByTestId('landing-miniroom'), page.getByTestId('landing-tabs')]) {
    await expect(loc).toBeInViewport();
  }
  await page.screenshot({ path: shot('landing-desktop'), fullPage: true });
});

test('미니룸: 미니미 8명, 늦은 자리 3개, 말풍선 3개', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('landing-minimi')).toHaveCount(8);
  await expect(page.locator('[data-testid="landing-minimi"][data-late="true"]')).toHaveCount(3);
  await expect(page.getByTestId('landing-late-bubble')).toHaveCount(3);
  const first = page.getByTestId('landing-late-bubble').first();
  await expect(first).toContainText('평소 13일마다');
  await expect(first).toContainText('38일째');
});

test('모바일 390x844: 첫 화면 구성과 터치 크기', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const h1 = page.locator('h1');
  const sample = page.getByTestId('landing-cta-sample');
  const room = page.getByTestId('landing-miniroom');
  const tabs = page.getByTestId('landing-tabs');
  for (const loc of [h1, sample, room]) await expect(loc).toBeInViewport();
  const h = await h1.boundingBox();
  const r = await room.boundingBox();
  expect(r!.y).toBeLessThan(h!.y);
  const tb = await tabs.boundingBox();
  expect(tb!.y + tb!.height).toBeGreaterThanOrEqual(843);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  const boxes = [
    await sample.boundingBox(), await page.getByTestId('landing-cta-upload').boundingBox(),
  ];
  const tabLinks = page.getByTestId('landing-tabs').locator('a');
  await expect(tabLinks).toHaveCount(5);
  for (let i = 0; i < 5; i++) boxes.push(await tabLinks.nth(i).boundingBox());
  for (const b of boxes) expect(b!.height).toBeGreaterThanOrEqual(44);
  const fs = await page.evaluate(() => parseFloat(getComputedStyle(document.body).fontSize));
  expect(fs).toBeGreaterThanOrEqual(16);
  await page.screenshot({ path: shot('landing-mobile'), fullPage: true });
});

test('이야기 5단계가 차례로 보이고 핵심 문구가 있다', async ({ page }) => {
  await page.goto('/');
  for (const s of STEPS) {
    const sec = page.getByTestId(`landing-step-${s}`);
    await sec.scrollIntoViewIfNeeded();
    await expect(sec).toBeVisible();
  }
  await expect(page.getByTestId('landing-reason-note')).toContainText('비');
  await expect(page.getByTestId('landing-reason-note')).toContainText('연휴');
  await expect(page.getByTestId('landing-step-return')).toContainText('돌아왔습니다');
  await expect(page.getByTestId('landing-example-note')).toContainText('예시');
  const lastIsDev = await page.evaluate(() => {
    const secs = document.querySelectorAll('main section');
    const last = secs[secs.length - 1];
    return last?.getAttribute('data-testid') === 'landing-dev';
  });
  expect(lastIsDev).toBe(true);
});

test('엔진 용어는 개발 단락에만, 혜택 표현은 어디에도 없다', async ({ page }) => {
  await page.goto('/');
  const outside = await page.evaluate(() => {
    const clone = document.body.cloneNode(true) as HTMLElement;
    clone.querySelector('[data-testid="landing-dev"]')?.remove();
    document.body.appendChild(clone);
    clone.style.cssText = 'position:absolute;left:-99999px';
    const t = clone.innerText;
    clone.remove();
    return t;
  });
  expect(outside.length).toBeGreaterThan(100);
  expect(outside).not.toMatch(/n8n|api|llm|hash/i);
  const all = await page.evaluate(() => document.body.innerText);
  expect(all).not.toMatch(/도토리|적립|선물|보상|쿠폰|할인/);
});

test('외부 요청 없이 GSAP·폰트가 같은 출처에서 로드된다', async ({ page, baseURL }) => {
  const origin = new URL(baseURL!).origin;
  const urls: string[] = [];
  const fonts: number[] = [];
  page.on('request', (q) => urls.push(q.url()));
  page.on('response', (r) => { if (r.url().endsWith('.woff2')) fonts.push(r.status()); });
  const gsapRes = page.waitForResponse((r) => r.url().endsWith('/vendor/gsap/gsap.min.js'));
  await page.goto('/');
  expect((await gsapRes).status()).toBe(200);
  await page.evaluate(() => document.fonts.ready);
  for (const u of urls) {
    if (u.startsWith('data:') || u.startsWith('blob:')) continue;
    expect(new URL(u).origin).toBe(origin);
  }
  expect(await page.evaluate(() => (window as any).gsap.version)).toBe('3.15.1');
  expect(await page.evaluate(() => typeof (window as any).ScrollTrigger)).toBe('function');
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'on');
  expect(await page.evaluate(async () => { await document.fonts.ready; return document.fonts.check('16px Galmuri11'); })).toBe(true);
  expect(fonts.length).toBeGreaterThanOrEqual(1);
  expect(fonts.every((s) => s === 200)).toBe(true);
});

test('움직임 줄이기: 모션 꺼짐, 스크롤 없이 모든 요소가 최종 상태', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'off');
  for (const id of ['landing-minimi', 'landing-late-bubble', 'landing-return-stamp']) {
    const ops = await page.getByTestId(id).evaluateAll((els) => els.map((e) => getComputedStyle(e).opacity));
    expect(ops.length).toBeGreaterThan(0);
    for (const o of ops) expect(o).toBe('1');
  }
  await ctx.close();
});

test('샘플로 바로 보기: 앱으로 이동해 단골 3명, 챙길 2명', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('landing-cta-sample').click();
  await expect(page).toHaveURL(/\/app#home$/);
  await expect(page.getByTestId('summary')).toContainText('단골 3명');
  await expect(page.getByTestId('candidate')).toHaveCount(2);
});

test('가게 진단 탭: 앱 가게 진단 패널로 이동', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('landing-tab-store').click();
  await expect(page).toHaveURL(/\/app#store$/);
  await expect(page.getByTestId('panel-store')).toBeVisible();
});
