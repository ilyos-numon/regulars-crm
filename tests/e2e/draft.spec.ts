import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';

const SAMPLE = path.resolve('tests/fixtures/sales-sample.csv');
const SHOT = path.join(process.env.ILLY_SHOT_DIR ?? 'tests/e2e/screenshots', 'draft.png');

const A_POLITE =
  '안녕하세요. 평소 아메리카노 자주 찾아 주셨는데 38일째 뵙지 못해 안부 여쭙니다. 별일 없으시죠? 언제든 편하게 들러 주세요.';

async function openFirstDetail(page: Page) {
  await page.goto('/app');
  await page.getByTestId('csv-input').setInputFiles(SAMPLE);
  await page.getByTestId('asof-input').fill('2026-10-27');
  await page.getByTestId('upload-btn').click();
  await expect(page.getByTestId('summary')).toContainText('단골 3명');
  await page.getByTestId('candidate-open').first().click();
  await expect(page.getByTestId('detail-title')).toHaveText('카드 ··31');
}

test.beforeEach(async ({ request }) => {
  const res = await request.delete('/api/data');
  expect(res.ok()).toBeTruthy();
});

test('A 상세: 기본 문구 출처, 정중한 문구, 톤 라벨 순서', async ({ page }) => {
  await openFirstDetail(page);
  await expect(page.getByTestId('draft-source')).toHaveText('기본 문구');
  await expect(page.getByTestId('draft-text-0')).toHaveText(A_POLITE);
  await expect(page.getByTestId('draft-tone-0')).toHaveText('정중한');
  await expect(page.getByTestId('draft-tone-1')).toHaveText('친근한');
  await expect(page.getByTestId('draft-tone-2')).toHaveText('짧은');
});

test('복사 버튼: 복사했어요 표시와 클립보드 내용 일치', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openFirstDetail(page);
  const text = await page.getByTestId('draft-text-0').innerText();
  await page.getByTestId('draft-copy-0').click();
  await expect(page.getByTestId('draft-copy-0')).toHaveText('복사했어요');
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  expect(clip).toBe(text);
  await page.screenshot({ path: SHOT, fullPage: true });
});

test('보냈어요: 기록 문구와 notices 1건(source draft)', async ({ page, request }) => {
  await openFirstDetail(page);
  await page.getByTestId('draft-sent-btn').click();
  await expect(page.getByTestId('draft-sent')).toHaveText('보낸 것으로 기록했습니다 (2026-10-27)');
  const res = await request.get('/api/notices');
  expect(res.status()).toBe(200);
  const list = await res.json();
  expect(list).toHaveLength(1);
  expect(list[0].source).toBe('draft');
});
