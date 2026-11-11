import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';

const SAMPLE = path.resolve('tests/fixtures/sales-sample.csv');
const SHOT = path.join(process.env.ILLY_SHOT_DIR ?? 'tests/e2e/screenshots', 'profile.png');
const DATA_DIR = process.env.E2E_DATA_DIR ?? 'test-results/e2e-data';

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

test('첫 후보 상세에 단골 프로필 한 줄이 보인다', async ({ page }) => {
  await uploadSample(page);
  await page.getByTestId('candidate-open').first().click();
  await expect(page.getByTestId('detail-title')).toHaveText('카드 ··31');
  await expect(page.getByTestId('profile-line')).toHaveText(
    '방문 9번 · 평소 13일마다 · 한 번에 4,500원 · 주로 아메리카노 · 아침 시간대 · 요일은 일정하지 않음',
  );
  await page.screenshot({ path: SHOT, fullPage: true });
});

test('없는 손님 id 는 404 와 안내 문구를 돌려준다', async ({ page, request }) => {
  await uploadSample(page);
  const res = await request.get('/api/profile/없는id?asOf=2026-10-27');
  expect(res.status()).toBe(404);
  expect(await res.json()).toEqual({ error: '그런 손님이 없습니다' });
});

test('프로필 조회는 데이터 디렉터리에 새 파일을 만들지 않는다', async ({ page, request }) => {
  await uploadSample(page);
  await page.getByTestId('candidate-open').first().click();
  await expect(page.getByTestId('profile-line')).toBeVisible();
  await request.get('/api/profile/없는id');
  expect(fs.readdirSync(DATA_DIR)).toEqual(['latest.json']);
});
