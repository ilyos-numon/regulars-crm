import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';

const SAMPLE = path.resolve('tests/fixtures/sales-sample.csv');
const SHOT = path.join(process.env.ILLY_SHOT_DIR ?? 'tests/e2e/screenshots', 'memos.png');

test.beforeEach(async ({ request }) => {
  const res = await request.delete('/api/data');
  expect(res.ok()).toBeTruthy();
});

async function uploadSample(page: Page) {
  await page.goto('/app');
  await page.getByTestId('csv-input').setInputFiles(SAMPLE);
  await page.getByTestId('asof-input').fill('2026-10-27');
  await page.getByTestId('upload-btn').click();
  await expect(page.getByTestId('candidate')).toHaveCount(2);
}

async function saveMemo(page: Page, note: string, action: string) {
  await page.getByTestId('candidate-open').first().click();
  await expect(page.getByTestId('detail-title')).toHaveText('카드 ··31');
  await page.getByTestId('memo-note').fill(note);
  await page.getByTestId('memo-action').selectOption(action);
  await page.getByTestId('memo-save').click();
}

test('exclude 메모를 저장하면 후보에서 빠지고 보류 목록에 나온다', async ({ page }) => {
  await uploadSample(page);
  await saveMemo(page, '원래 가을엔 뜸한 분', 'exclude');
  await expect(page.getByTestId('memo-saved')).toHaveText('저장했습니다');
  await expect(page.getByTestId('candidate')).toHaveCount(1);
  await expect(page.getByTestId('held-back-item')).toHaveText('카드 ··31 — 메모: 원래 가을엔 뜸한 분');
  await page.screenshot({ path: SHOT, fullPage: true });
});

test('전화번호처럼 보이는 메모는 저장되지 않는다', async ({ page, request }) => {
  await uploadSample(page);
  await saveMemo(page, '010-1234-5678', 'none');
  await expect(page.getByTestId('memo-error')).toHaveText('전화번호로 보이는 숫자는 저장할 수 없습니다');
  const res = await request.get('/api/memos');
  expect(await res.json()).toEqual([]);
});

test('메모 탭에서 목록을 보고 삭제하면 후보가 복구된다', async ({ page }) => {
  await uploadSample(page);
  await saveMemo(page, '원래 가을엔 뜸한 분', 'exclude');
  await expect(page.getByTestId('memo-saved')).toBeVisible();
  await page.getByTestId('tab-memos').click();
  await expect(page).toHaveURL(/#memos$/);
  const item = page.getByTestId('memo-item');
  await expect(item).toHaveCount(1);
  await expect(item).toContainText('카드 ··31 · 챙길 단골에서 빼기 · 원래 가을엔 뜸한 분');
  await page.getByTestId('memo-delete').click();
  await expect(page.getByTestId('memos-empty')).toHaveText('아직 메모가 없습니다');
  await page.getByTestId('tab-home').click();
  await expect(page.getByTestId('candidate')).toHaveCount(2);
});

test('업로드 전 메모 탭은 안내 문구를 보여준다', async ({ page }) => {
  await page.goto('/app#memos');
  await expect(page.getByTestId('empty-memos')).toBeVisible();
  await expect(page.getByTestId('empty-memos')).toContainText('먼저 홈에서 매출 CSV를 올려 주세요');
});
