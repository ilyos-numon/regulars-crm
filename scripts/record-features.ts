// README 기능별 GIF 녹화: 장면 하나를 1280×800 webm 으로 test-results/feature-gifs/ 에 남긴다. 'steps' 는 3단계 화면 3장을 assets/screenshots/ 에 저장한다.
// make-feature-gifs.sh 가 장면마다 빈 데이터 폴더로 서버(FEATURE_BASE_URL)를 새로 띄운 뒤 `npx tsx scripts/record-features.ts <장면>` 으로 실행한다.
// 데이터는 앱의 예시 가게(/app?sample=1, 합성 데이터)와 src/web/static/sample/sales-sample.csv 업로드만 쓴다.
import { chromium, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.FEATURE_BASE_URL ?? 'http://localhost:8796';
const VIDEO_DIR = path.resolve('test-results/feature-gifs');
const SHOT_DIR = path.resolve('assets/screenshots');
const SAMPLE_CSV = path.resolve('src/web/static/sample/sales-sample.csv');
const SIZE = { width: 1280, height: 800 };
const SCENES = ['tour', 'why', 'devview', 'store-sample', 'briefing', 'landing-story', 'steps'] as const;
type SceneName = (typeof SCENES)[number];

const name = process.argv[2] as SceneName;
if (!SCENES.includes(name)) {
  process.stderr.write(`usage: record-features.ts <${SCENES.join('|')}>\n`);
  process.exit(2);
}

// 페이지 안의 조건이 참이 될 때까지 기다린다 (문자열 식: tsx 의 __name() 주입을 피한다).
function until(p: Page, expr: string, timeout = 10000) {
  return p.waitForFunction(expr, undefined, { timeout });
}

async function expectMotionOn(p: Page) {
  const motion = await p.evaluate(`({
    reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
    flag: document.documentElement.dataset.motion,
  })`) as { reduced: boolean; flag?: string };
  if (motion.reduced || motion.flag !== 'on') throw new Error(`motion is off: ${JSON.stringify(motion)}`);
}

// 판단 그림의 모든 요소가 다 나타났는지 (모션 끝)
const WHY_DONE = `(() => {
  const box = document.querySelector('[data-testid="detail-why"]');
  if (!box || box.hidden) return false;
  const els = box.querySelectorAll('[data-testid^="why-"]');
  if (els.length < 5) return false;
  return Array.from(els).every((el) => Number(getComputedStyle(el).opacity) > 0.99);
})()`;

const tourStep = (n: number) => `(() => {
  const el = document.querySelector('[data-testid="tour-step"]');
  return !!el && el.getAttribute('data-step') === '${n}';
})()`;

// 이야기 단계의 위쪽이 화면 위 절반 안에 들어왔는지
const stepInView = (step: string) => `(() => {
  const el = document.querySelector('[data-testid="landing-step-${step}"]');
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return r.top < innerHeight * 0.45 && r.bottom > innerHeight * 0.3;
})()`;

const browser = await chromium.launch();
// 서버가 처음 응답할 때 느려 첫 장면이 늘어나지 않도록, 녹화 전에 소개 화면과 앱 화면을 한 번 열어 둔다 (데이터는 올리지 않는다).
{
  const warm = await browser.newContext({ viewport: SIZE });
  const wpage = await warm.newPage();
  await wpage.goto(BASE + '/');
  await wpage.getByTestId('landing-miniroom').waitFor({ state: 'visible' });
  await wpage.goto(BASE + '/app');
  await wpage.getByTestId('upload-btn').waitFor({ state: 'visible' });
  await warm.close();
}

if (name === 'steps') {
  await recordSteps();
} else {
  await recordScene(name);
}
await browser.close();

// ---------- 3단계 화면 (녹화 없음) ----------
async function recordSteps() {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const context = await browser.newContext({ viewport: SIZE, reducedMotion: 'no-preference' });
  const page = await context.newPage();
  const shot = (file: string) => page.screenshot({ path: path.join(SHOT_DIR, `${file}.png`) });

  // 1단계: 아무것도 올리지 않은 첫 화면 — 업로드 영역
  await page.goto(BASE + '/app');
  await page.getByTestId('onboarding').waitFor({ state: 'visible' });
  await page.getByTestId('upload-btn').waitFor({ state: 'visible' });
  await page.evaluate('document.fonts.ready');
  await expectMotionOn(page);
  await page.waitForTimeout(600);
  await shot('step-1-upload');

  // 2단계: 예시 CSV 를 올리면 요약과 챙길 단골 목록
  await page.getByTestId('csv-input').setInputFiles(SAMPLE_CSV);
  await page.getByTestId('asof-input').fill('2026-10-27');
  await page.getByTestId('upload-btn').click();
  await page.getByTestId('candidate').first().waitFor({ state: 'visible' });
  await until(page, `(document.querySelector('[data-testid="summary"]')?.textContent || '').trim().length > 0`);
  await page.waitForTimeout(1200);
  await shot('step-2-list');

  // 3단계: 첫 단골 자세히 — 방문 기록과 안부 문구 초안
  await page.getByTestId('candidate-open').first().click();
  await page.getByTestId('why-summary').waitFor({ state: 'visible' });
  await until(page, WHY_DONE);
  await page.getByTestId('draft-text-0').waitFor({ state: 'visible' });
  await page.waitForTimeout(800);
  // 안부 문구 초안은 판단 그림 아래에 있어 첫 화면 밖이므로 페이지 전체를 담는다.
  await page.screenshot({ path: path.join(SHOT_DIR, 'step-3-detail.png'), fullPage: true });
  await context.close();
  process.stdout.write('steps saved\n');
}

// ---------- 기능별 장면 (녹화) ----------
async function recordScene(scene: Exclude<SceneName, 'steps'>) {
  const dir = path.join(VIDEO_DIR, scene);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  // 움직임 줄이기가 아닌 상태로 녹화해야 모션이 보인다.
  const context = await browser.newContext({
    viewport: SIZE,
    reducedMotion: 'no-preference',
    recordVideo: { dir, size: SIZE },
  });
  const page = await context.newPage();
  const t0 = Date.now();
  let lead = 0;
  // 첫 화면이 준비된 시점: 그 앞(빈 화면·불러오기)은 GIF 에서 잘라낸다.
  const ready = async () => {
    await page.evaluate('document.fonts.ready');
    await expectMotionOn(page);
    lead = (Date.now() - t0) / 1000;
  };
  // 장면마다 정해진 길이(ms)를 채운다. 기다림에 걸린 시간은 그 길이 안에서 뺀다.
  const beat = async (label: string, budget: number, body: () => Promise<void>) => {
    const start = Date.now();
    await body();
    const left = budget - (Date.now() - start);
    if (left > 0) await page.waitForTimeout(left);
    process.stdout.write(`  ${label} at ${((start - t0) / 1000 - lead).toFixed(1)}s took ${((Date.now() - start) / 1000).toFixed(1)}s\n`);
  };
  const openSample = async (hash: string) => {
    await page.goto(`${BASE}/app?sample=1#${hash}`);
    if (hash === 'home') await page.getByTestId('candidate').first().waitFor({ state: 'visible' });
    await ready();
  };

  switch (scene) {
    case 'tour': {
      // 소개 화면 → "앱 열기" → 둘러보기 1→2→3단계 → 마치기
      await page.goto(BASE + '/');
      await page.getByTestId('landing-miniroom').waitFor({ state: 'visible' });
      await ready();
      await beat('landing', 1200, async () => {});
      await beat('tour-1', 2400, async () => {
        await page.getByTestId('landing-tab-app').click();
        await page.waitForURL((u) => u.pathname === '/app');
        await page.getByTestId('candidate').first().waitFor({ state: 'visible' });
        await until(page, tourStep(1));
      });
      await beat('tour-2', 1800, async () => {
        await page.getByTestId('tour-next').click();
        await until(page, tourStep(2));
      });
      await beat('tour-3', 1800, async () => {
        await page.getByTestId('tour-next').click();
        await until(page, tourStep(3));
      });
      await beat('done', 900, async () => {
        await page.getByTestId('tour-next').click();
        await page.getByTestId('tour').waitFor({ state: 'detached' });
        await page.evaluate(`window.scrollTo({ top: 0, behavior: 'instant' })`);
      });
      break;
    }
    case 'why': {
      // 첫 단골 "자세히" → 왜 이 손님인가 타임라인이 다 그려짐
      await openSample('home');
      await beat('list', 1000, async () => {});
      await beat('detail', 5000, async () => {
        await page.getByTestId('candidate-open').first().click();
        await page.getByTestId('why-summary').waitFor({ state: 'visible' });
        await until(page, WHY_DONE);
      });
      break;
    }
    case 'devview': {
      // 첫 단골 열기 → 개발자 보기 켬 → 설명 보임 → 끔
      await openSample('home');
      await beat('open', 1800, async () => {
        await page.getByTestId('candidate-open').first().click();
        await page.getByTestId('why-summary').waitFor({ state: 'visible' });
        await until(page, WHY_DONE);
      });
      await beat('dev-on', 3000, async () => {
        await page.getByTestId('dev-toggle').click();
        await page.locator('[data-testid="dev-note"][data-area="why"]').waitFor({ state: 'visible' });
      });
      await beat('dev-off', 1200, async () => {
        await page.getByTestId('dev-toggle').click();
        await until(page, `document.querySelectorAll('[data-testid="dev-note"]').length === 0`);
      });
      break;
    }
    case 'store-sample': {
      // 가게 진단 → 날씨 "예시 채우기" → 가져오기 → 요약
      await openSample('store');
      await page.getByTestId('weather-sample-fill').waitFor({ state: 'visible' });
      await page.getByTestId('weather-sample-fill').scrollIntoViewIfNeeded();
      await ready();
      await beat('panel', 1500, async () => {});
      await beat('fill', 1800, async () => {
        await page.getByTestId('weather-sample-fill').click();
      });
      await beat('import', 3500, async () => {
        await page.getByTestId('weather-import').click();
        // 가져오기 뒤 패널이 다시 그려지므로 요약 문구가 나온 뒤 DOM 에서 바로 스크롤한다.
        await page.getByTestId('weather-summary').filter({ hasText: '날씨 3일' }).waitFor({ state: 'visible' });
        await page.evaluate(`document.querySelector('[data-testid="weather-summary"]')?.scrollIntoView({ block: 'center', behavior: 'smooth' })`);
      });
      break;
    }
    case 'briefing': {
      // 홈 → 월요일 브리핑 탭 → 천천히 아래로
      await openSample('home');
      await beat('home', 800, async () => {});
      await beat('tab', 1500, async () => {
        await page.getByTestId('tab-briefing').click();
        await page.getByTestId('section-briefing').waitFor({ state: 'visible' });
      });
      await beat('scroll', 2700, async () => {
        await page.mouse.move(640, 500);
        for (let i = 0; i < 9; i += 1) {
          await page.mouse.wheel(0, 70);
          await page.waitForTimeout(220);
        }
      });
      break;
    }
    case 'landing-story': {
      // 소개 화면 → "이렇게 찾아요" → 휠로 이야기 5단계를 차례로
      await page.goto(BASE + '/');
      await page.getByTestId('landing-miniroom').waitFor({ state: 'visible' });
      await ready();
      await beat('landing', 800, async () => {});
      await beat('rhythm', 1800, async () => {
        await page.getByTestId('landing-tab-how').click();
        await until(page, stepInView('rhythm'));
      });
      await page.mouse.move(640, 500);
      for (const step of ['empty', 'reason', 'message', 'return']) {
        await beat(step, 1600, async () => {
          for (let i = 0; i < 40; i += 1) {
            if (await page.evaluate(stepInView(step))) break;
            await page.mouse.wheel(0, 90);
            await page.waitForTimeout(40);
          }
          await until(page, stepInView(step), 3000);
        });
      }
      break;
    }
  }
  process.stdout.write(`  total ${((Date.now() - t0) / 1000 - lead).toFixed(1)}s after lead ${lead.toFixed(2)}s\n`);

  const video = page.video();
  await context.close();
  if (!video) throw new Error('no video recorded');
  const out = path.join(VIDEO_DIR, `${scene}.webm`);
  fs.renameSync(await video.path(), out);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.writeFileSync(path.join(VIDEO_DIR, `${scene}.lead`), lead.toFixed(3) + '\n');
  process.stdout.write(`video ${out}\n`);
}
