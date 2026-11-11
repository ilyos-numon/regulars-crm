// README 데모 녹화: 1280×800 화면을 test-results/demo/ 에 webm 으로 남기고 화면 10장을 assets/screenshots/ 에 저장한다.
// make-demo-gif.sh 가 서버(DEMO_BASE_URL)를 띄운 뒤 실행한다. 업로드는 소개 화면의 "앱 열기" 링크로만 한다(샘플 + 둘러보기).
import { chromium, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.DEMO_BASE_URL ?? 'http://localhost:8796';
const VIDEO_DIR = path.resolve('test-results/demo');
const SHOT_DIR = path.resolve('assets/screenshots');
const SIZE = { width: 1280, height: 800 };
const MOBILE = { width: 390, height: 844 };

fs.rmSync(VIDEO_DIR, { recursive: true, force: true });
fs.mkdirSync(VIDEO_DIR, { recursive: true });
fs.mkdirSync(SHOT_DIR, { recursive: true });

const browser = await chromium.launch();
// 서버가 처음 응답할 때 느려 첫 장면이 늘어나지 않도록, 녹화 전에 소개 화면을 한 번 열어 둔다.
{
  const warm = await browser.newContext({ viewport: SIZE });
  const wpage = await warm.newPage();
  await wpage.goto(BASE + '/');
  await wpage.getByTestId('landing-miniroom').waitFor({ state: 'visible' });
  await warm.close();
}
// 움직임 줄이기가 아닌 상태로 녹화해야 소개 화면의 스크롤 이야기가 보인다.
const context = await browser.newContext({
  viewport: SIZE,
  reducedMotion: 'no-preference',
  recordVideo: { dir: VIDEO_DIR, size: SIZE },
});
const page = await context.newPage();
const t0 = Date.now();
const shot = (p: Page, name: string) => p.screenshot({ path: path.join(SHOT_DIR, `${name}.png`) });

// 장면마다 정해진 길이(ms)를 채운다. 기다림·화면 저장에 걸린 시간은 그 길이 안에서 뺀다.
async function scene(label: string, budget: number, body: () => Promise<void>) {
  const start = Date.now();
  await body();
  const left = budget - (Date.now() - start);
  if (left > 0) await page.waitForTimeout(left);
  process.stdout.write(`scene ${label} at ${((start - t0) / 1000).toFixed(1)}s took ${((Date.now() - start) / 1000).toFixed(1)}s\n`);
}

async function expectMotionOn(p: Page) {
  const motion = await p.evaluate(() => ({
    reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
    flag: document.documentElement.dataset.motion,
  }));
  if (motion.reduced || motion.flag !== 'on') throw new Error(`motion is off: ${JSON.stringify(motion)}`);
}

// tsx 가 이름 붙은 안쪽 함수에 __name() 을 끼워 넣어 브라우저에서 깨지므로 페이지 안 식은 문자열로 넘긴다.
// 페이지 안의 조건이 참이 될 때까지 기다린다 (문자열 식: tsx 의 __name() 주입을 피한다).
function until(p: Page, expr: string, timeout = 10000) {
  return p.waitForFunction(expr, undefined, { timeout });
}

// 판단 그림의 모든 요소가 다 나타났는지 (모션 끝)
const WHY_DONE = `(() => {
  const box = document.querySelector('[data-testid="detail-why"]');
  if (!box || box.hidden) return false;
  const els = box.querySelectorAll('[data-testid^="why-"]');
  if (els.length < 5) return false;
  return Array.from(els).every((el) => Number(getComputedStyle(el).opacity) > 0.99);
})()`;

// 구조 그림의 노드가 모두 나타났는지
const DIAGRAM_DONE = `(() => {
  const nodes = document.querySelectorAll('[data-testid="landing-case-diagram"] [data-node]');
  return nodes.length >= 5 && Array.from(nodes).every((el) => Number(getComputedStyle(el).opacity) > 0.99);
})()`;

const tourStep = (n: number) => `(() => {
  const el = document.querySelector('[data-testid="tour-step"]');
  return !!el && el.getAttribute('data-step') === '${n}';
})()`;

// ① 소개 첫 화면 3초
await scene('1-landing', 3000, async () => {
  await page.goto(BASE + '/');
  await page.getByTestId('landing-miniroom').waitFor({ state: 'visible' });
  await page.evaluate(() => document.fonts.ready);
  await expectMotionOn(page);
  await page.waitForTimeout(1200);
  await shot(page, 'landing');
});

// ② 목차 "이렇게 찾아요" → 이야기 3초
await scene('2-how', 3000, async () => {
  await page.getByTestId('landing-tab-how').click();
});

// ③ 목차 "만든 방법" → 구조 그림이 그려짐 4초
await scene('3-made', 4000, async () => {
  await page.getByTestId('landing-tab-made').click();
  await page.waitForTimeout(900);
  // 구조 그림이 화면 안에 다 들어오도록 가운데로 맞춘다 (ScrollTrigger 가 여기서 그리기 시작)
  await page.evaluate(`document.querySelector('[data-testid="landing-case-diagram"]').scrollIntoView({ block: 'center', behavior: 'smooth' })`);
  await until(page, DIAGRAM_DONE);
  await page.waitForTimeout(500);
  await shot(page, 'made');
});

// ④ 목차 "앱 열기" → 둘러보기 1단계 2.5초 → 2단계 2초 → 3단계 2초 → 마치기 1초
await scene('4a-tour-1', 2500, async () => {
  await page.getByTestId('landing-tab-app').click();
  await page.waitForURL((u) => u.pathname === '/app' && u.hash === '#home' && !u.search.includes('sample'));
  await page.getByTestId('candidate').first().waitFor({ state: 'visible' });
  await expectMotionOn(page);
  await until(page, tourStep(1));
  await page.waitForTimeout(900);
  await shot(page, 'tour');
});
await scene('4b-tour-2', 2000, async () => {
  await page.getByTestId('tour-next').click();
  await until(page, tourStep(2));
});
await scene('4c-tour-3', 2000, async () => {
  await page.getByTestId('tour-next').click();
  await until(page, tourStep(3));
});
await scene('4d-tour-done', 1000, async () => {
  await page.getByTestId('tour-next').click();
  await page.getByTestId('tour').waitFor({ state: 'detached' });
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.waitForTimeout(400);
  await shot(page, 'home');
});

// ⑤ 첫 "자세히" → 왜 이 손님인가 타임라인이 그려짐 5초
await scene('5-detail', 5000, async () => {
  await page.getByTestId('candidate-open').first().click();
  await page.getByTestId('why-summary').waitFor({ state: 'visible' });
  await page.getByTestId('profile-line').waitFor({ state: 'visible' });
  await until(page, WHY_DONE);
  await page.waitForTimeout(600);
  await shot(page, 'detail');
  await page.getByTestId('detail-why').screenshot({ path: path.join(SHOT_DIR, 'why.png') });
});

// ⑥ 개발자 보기 켬 3초 → 끔
await scene('6-devview', 3000, async () => {
  await page.getByTestId('dev-toggle').click();
  await page.locator('[data-testid="dev-note"][data-area="why"]').waitFor({ state: 'visible' });
  await page.waitForTimeout(700);
  await shot(page, 'devview');
  await page.waitForTimeout(1500);
  await page.getByTestId('dev-toggle').click();
  await until(page, `document.querySelectorAll('[data-testid="dev-note"]').length === 0`);
});

// ⑦ 월요일 브리핑 탭 3초
await scene('7-briefing', 3000, async () => {
  await page.getByTestId('tab-briefing').click();
  await page.getByTestId('section-briefing').waitFor({ state: 'visible' });
  await page.waitForTimeout(600);
  await shot(page, 'briefing');
});

// ⑧ 가게 진단 탭 → 날씨 "예시 채우기" → 가져오기 3초
await scene('8-store', 3000, async () => {
  await page.getByTestId('tab-store').click();
  await page.getByTestId('weather-sample-fill').waitFor({ state: 'visible' });
  await page.getByTestId('weather-sample-fill').scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await page.getByTestId('weather-sample-fill').click();
  await page.waitForTimeout(400);
  await page.getByTestId('weather-import').click();
  // 가져오기 뒤 패널이 다시 그려지므로 요약 문구가 나온 뒤 DOM 에서 바로 스크롤한다.
  await page.getByTestId('weather-summary').filter({ hasText: '날씨 3일' }).waitFor({ state: 'visible' });
  await page.evaluate(() => document.querySelector('[data-testid="weather-summary"]')?.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(500);
  await shot(page, 'store');
});
process.stdout.write(`total ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);

const video = page.video();
await context.close();
if (!video) throw new Error('no video recorded');
const webm = await video.path();
const out = path.join(VIDEO_DIR, 'demo.webm');
fs.renameSync(webm, out);
process.stdout.write(`video ${out}\n`);

// 녹화 뒤 별도 390×844 컨텍스트로 소개 첫 화면
const mobile = await browser.newContext({ viewport: MOBILE, reducedMotion: 'no-preference', isMobile: true, hasTouch: true });
const mpage = await mobile.newPage();
await mpage.goto(BASE + '/');
await mpage.getByTestId('landing-miniroom').waitFor({ state: 'visible' });
await mpage.evaluate(() => document.fonts.ready);
await mpage.waitForTimeout(2000);
await shot(mpage, 'landing-mobile');
await mobile.close();
await browser.close();
