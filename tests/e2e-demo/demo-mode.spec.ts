import { test, expect, request as pwRequest, type BrowserContext } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const COOKIE = 'rc_demo';
const ID_RE = /^[a-f0-9]{32}$/;
const NOTE_TEXT = '데모에는 예시 파일만 올려 주세요. 올린 매출은 이 브라우저에서만 보이고 늦어도 24시간 뒤 지워집니다.';
const DATA = path.resolve('test-results/e2e-demo-data');
const VISITORS = path.join(DATA, 'visitors');
const SHOT_DIR = process.env.ILLY_SHOT_DIR ?? 'test-results/demo-shots';
const BASE = `http://localhost:${process.env.E2E_DEMO_PORT ?? '8805'}`;

async function visitorId(ctx: BrowserContext): Promise<string> {
  const c = (await ctx.cookies()).find((x) => x.name === COOKIE);
  expect(c, 'rc_demo 쿠키').toBeTruthy();
  return c!.value;
}

test('D1 /app 에 업로드 안내가 업로드 양식 앞에 보인다', async ({ page }) => {
  await page.goto('/app');
  const note = page.getByTestId('demo-upload-note');
  await expect(note).toBeVisible();
  await expect(note).toHaveText(NOTE_TEXT);
  const before = await page.evaluate(() => {
    const n = document.querySelector('[data-testid="demo-upload-note"]')!;
    const f = document.querySelector('#upload-form')!;
    return !!(n.compareDocumentPosition(f) & Node.DOCUMENT_POSITION_FOLLOWING);
  });
  expect(before).toBe(true);
  await page.screenshot({ path: path.join(SHOT_DIR, 'demo-note-desktop.png'), fullPage: true });
});

test('D2 모바일 390px 에서 안내가 보이고 가로로 넘치지 않는다', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, baseURL: BASE });
  const page = await ctx.newPage();
  await page.goto('/app');
  await expect(page.getByTestId('demo-upload-note')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.screenshot({ path: path.join(SHOT_DIR, 'demo-note-mobile.png'), fullPage: true });
  await ctx.close();
});

test('D3 첫 /app 방문 뒤 방문자 쿠키가 발급된다', async ({ page, context }) => {
  await page.goto('/app');
  const c = (await context.cookies()).find((x) => x.name === COOKIE);
  expect(c).toBeTruthy();
  expect(c!.value).toMatch(ID_RE);
  expect(c!.httpOnly).toBe(true);
  expect(c!.sameSite).toBe('Lax');
  expect(c!.path).toBe('/');
});

test('D4 두 방문자의 데이터가 서로 보이지 않는다', async ({ browser }) => {
  const ctxA = await browser.newContext({ baseURL: BASE });
  const ctxB = await browser.newContext({ baseURL: BASE });
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  await a.goto('/app?sample=1');
  await expect(a.getByTestId('candidate-open').first()).toBeVisible();
  expect(await a.getByTestId('candidate-open').count()).toBeGreaterThanOrEqual(1);
  await b.goto('/app');
  await expect(b.getByTestId('onboarding')).toBeVisible();
  const resB = await ctxB.request.get('/api/churn');
  expect(resB.status()).toBe(404);
  expect(await resB.text()).toContain('아직 업로드된 매출이 없습니다');
  const resA = await ctxA.request.get('/api/churn?asOf=2026-10-27');
  expect(resA.status()).toBe(200);
  await ctxA.close();
  await ctxB.close();
});

test('D5 방문자 데이터는 visitors/<id>/ 아래에만 저장된다', async ({ page, context }) => {
  await page.goto('/app?sample=1');
  await expect(page.getByTestId('candidate-open').first()).toBeVisible();
  const id = await visitorId(context);
  await expect.poll(() => fs.existsSync(path.join(VISITORS, id, 'latest.json'))).toBe(true);
  expect(fs.existsSync(path.join(DATA, 'latest.json'))).toBe(false);
});

test('D6 형식이 틀린 쿠키는 버려지고 새 유효 쿠키가 발급된다', async () => {
  const req = await pwRequest.newContext({ baseURL: BASE, extraHTTPHeaders: { cookie: `${COOKIE}=../../etc` } });
  const res = await req.get('/app?sample=1');
  const setCookie = res.headers()['set-cookie'] ?? '';
  const m = setCookie.match(new RegExp(`${COOKIE}=([^;]*)`));
  expect(m, 'set-cookie 로 새 값 발급').toBeTruthy();
  expect(m![1]).toMatch(ID_RE);
  const names = fs.existsSync(VISITORS) ? fs.readdirSync(VISITORS) : [];
  for (const n of names) expect(n).toMatch(ID_RE);
  expect(fs.existsSync(path.join(DATA, 'etc'))).toBe(false);
  await req.dispose();
});

test('D7 /health 와 정적 파일 응답에는 쿠키가 붙지 않는다', async ({ request }) => {
  const h = await request.get('/health');
  expect(h.status()).toBe(200);
  expect((await h.text()).replace(/\s/g, '')).toBe('{"ok":true}');
  expect(h.headers()['set-cookie']).toBeUndefined();
  const s = await request.get('/static/app.css');
  expect(s.status()).toBe(200);
  expect(s.headers()['set-cookie']).toBeUndefined();
});

test('D8 24시간 지난 방문자 폴더는 정리되고 최근 폴더는 남는다', async () => {
  const oldId = 'a'.repeat(31) + '1';
  const freshId = 'b'.repeat(31) + '2';
  const oldDir = path.join(VISITORS, oldId);
  const freshDir = path.join(VISITORS, freshId);
  fs.mkdirSync(oldDir, { recursive: true });
  fs.mkdirSync(freshDir, { recursive: true });
  fs.writeFileSync(path.join(oldDir, 'latest.json'), '{}');
  fs.writeFileSync(path.join(freshDir, 'latest.json'), '{}');
  const past = new Date(Date.now() - 25 * 3_600_000);
  fs.utimesSync(path.join(oldDir, 'latest.json'), past, past);
  fs.utimesSync(oldDir, past, past);
  try {
    await expect.poll(() => fs.existsSync(oldDir), { timeout: 15_000, intervals: [500] }).toBe(false);
    expect(fs.existsSync(path.join(freshDir, 'latest.json'))).toBe(true);
  } finally {
    fs.rmSync(oldDir, { recursive: true, force: true });
    fs.rmSync(freshDir, { recursive: true, force: true });
  }
});

test('D9 소개 페이지에는 업로드 안내가 없다', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('demo-upload-note')).toHaveCount(0);
});
