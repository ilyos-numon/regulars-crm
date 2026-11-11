import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';

const SAMPLE = path.resolve('tests/fixtures/sales-sample.csv');
const shot = (name: string) => path.join(process.env.ILLY_SHOT_DIR ?? 'tests/e2e/screenshots', `${name}.png`);

const EMPTY_TEXT = '먼저 홈에서 매출 CSV를 올려 주세요';

async function uploadSample(page: Page) {
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

test('업로드 전: 탭 5개 순서, 온보딩, 가게 진단 빈 상태', async ({ page }) => {
  await page.goto('/app');
  await expect(page.getByTestId('tabs').locator('a')).toHaveText([
    '이번 주 챙길 단골',
    '월요일 브리핑',
    '돌아왔습니다',
    '가게 진단',
    '사장님 메모',
  ]);
  await expect(page.getByTestId('onboarding')).toBeVisible();
  await expect(page.getByTestId('onboarding')).toContainText('매출 CSV');
  await page.goto('/app#store');
  await expect(page.getByTestId('panel-store')).toBeVisible();
  await expect(page.getByTestId('empty-store')).toBeVisible();
  await expect(page.getByTestId('empty-store')).toContainText(EMPTY_TEXT);
  await page.screenshot({ path: shot('shell-home-empty'), fullPage: true });
});

test('업로드 전 홈에 온보딩 문구가 보인다', async ({ page }) => {
  await page.goto('/app#home');
  await expect(page.getByTestId('panel-home')).toBeVisible();
  await expect(page.getByTestId('onboarding')).toBeVisible();
  await expect(page.getByTestId('onboarding')).toHaveText('1단계 · 매출 CSV를 올려 주세요');
  await page.screenshot({ path: shot('home-onboarding'), fullPage: true });
});

test('돌아왔습니다 탭 클릭: hash, 해당 패널만 보임, 제목·설명', async ({ page }) => {
  await page.goto('/app');
  await page.getByTestId('tab-returns').click();
  await expect(page).toHaveURL(/#returns$/);
  await expect(page.getByTestId('panel-returns')).toBeVisible();
  for (const t of ['home', 'briefing', 'store', 'memos']) {
    await expect(page.getByTestId(`panel-${t}`)).toBeHidden();
  }
  const panel = page.getByTestId('panel-returns');
  await expect(panel.locator('h2')).toHaveText('돌아왔습니다');
  await expect(panel.locator('.tab-desc')).toHaveText('안부를 전한 단골이 14일 안에 돌아왔는지 확인합니다.');
});

test('샘플 업로드 후: 온보딩 숨김, 후보 2개, 보류 숨김', async ({ page }) => {
  await uploadSample(page);
  await expect(page.getByTestId('onboarding')).toBeHidden();
  await expect(page.getByTestId('candidate')).toHaveCount(2);
  await expect(page.getByTestId('held-back')).toBeHidden();
});

test('첫 후보 자세히: 상세 제목과 4구역 순서, 본문이 채워져 있다', async ({ page }) => {
  await uploadSample(page);
  await page.getByTestId('candidate-open').first().click();
  await expect(page.getByTestId('detail-title')).toHaveText('카드 ··31');
  const ids = await page
    .getByTestId('candidate-detail')
    .locator('[data-testid^="section-"]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
  expect(ids).toEqual(['section-profile', 'section-hint', 'section-draft', 'section-memos']);
  for (const id of ids) {
    const body = page.getByTestId(id as string).locator('.body');
    await expect(body).not.toHaveText('준비 중');
    await expect(body).not.toHaveText('');
  }
  await page.screenshot({ path: shot('home-detail'), fullPage: true });
});

test('GET /features/profile/panel.js 는 200', async ({ request }) => {
  const res = await request.get('/features/profile/panel.js');
  expect(res.status()).toBe(200);
});

test('화면 문구에 n8n · API · hash 같은 엔진 용어가 없다', async ({ page }) => {
  await uploadSample(page);
  await page.getByTestId('candidate-open').first().click();
  await expect(page.getByTestId('detail-title')).toBeVisible();
  const text = await page.locator('body').innerText();
  expect(text).not.toMatch(/n8n|api|hash/i);
});

test('CSV 가 아닌 파일을 올리면 오류가 보이고 온보딩이 유지된다', async ({ page }) => {
  await page.goto('/app');
  await page.getByTestId('csv-input').setInputFiles({
    name: 'note.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('이건 매출 파일이 아닙니다', 'utf-8'),
  });
  await page.getByTestId('upload-btn').click();
  await expect(page.getByTestId('error')).not.toBeEmpty();
  await expect(page.getByTestId('onboarding')).toBeVisible();
  await expect(page.getByTestId('candidate')).toHaveCount(0);
});
