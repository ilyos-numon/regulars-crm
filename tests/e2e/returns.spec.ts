import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import path from 'node:path';
import { hashCard } from '../../src/domain/hash.ts';

const FIXTURE = path.resolve('tests/fixtures/sales-returned.csv');
const SHOT = path.join(process.env.ILLY_SHOT_DIR ?? 'tests/e2e/screenshots', 'returns.png');
const SALT = 'e2e-salt'; // playwright.config.ts 의 REGULARS_HASH_SALT
const CARD_A = '1234-56**-****-7831';
const CARD_B = '9876-54**-****-1207';

test.beforeEach(async ({ request }) => {
  const res = await request.delete('/api/data');
  expect(res.ok()).toBeTruthy();
});

async function upload(page: Page) {
  await page.goto('/app');
  await page.getByTestId('csv-input').setInputFiles(FIXTURE);
  await page.getByTestId('asof-input').fill('2026-10-27');
  await page.getByTestId('upload-btn').click();
  await expect(page.getByTestId('candidate').first()).toBeVisible();
}

async function notice(request: APIRequestContext, card: string, last2: string) {
  const res = await request.post('/api/notices', {
    data: { customerId: hashCard(card, SALT), cardLast2: last2, noticedOn: '2026-10-13', source: 'draft' },
  });
  expect(res.status()).toBe(200);
}

test('알림 2건 뒤 돌아왔습니다 탭이 요약·기준선·차이·목록을 보여준다', async ({ page, request }) => {
  await upload(page);
  await notice(request, CARD_A, '31');
  await notice(request, CARD_B, '07');
  await page.getByTestId('tab-returns').click();
  await expect(page).toHaveURL(/#returns$/);
  await expect(page.getByTestId('returns-summary')).toHaveText('알림 2명 중 1명이 14일 안에 돌아왔습니다 (50%)');
  await expect(page.getByTestId('returns-baseline')).toHaveText('알림 없이 돌아온 비율 25% (과거 4번 중 1번)');
  await expect(page.getByTestId('returns-diff')).toHaveText('+25%p');
  await expect(page.getByTestId('returns-item')).toHaveCount(2);
  await expect(page.getByTestId('returns-empty')).toHaveCount(0);
  await page.screenshot({ path: SHOT, fullPage: true });
});

test('알림이 없으면 돌아왔습니다 탭이 안내 문구를 보여준다', async ({ page }) => {
  await upload(page);
  await page.getByTestId('tab-returns').click();
  await expect(page.getByTestId('returns-empty')).toHaveText(
    '아직 알림을 보낸 단골이 없습니다. 홈에서 안부 문구를 보내거나 월요일 브리핑을 보내면 여기서 효과를 봅니다.',
  );
  await expect(page.getByTestId('returns-summary')).toHaveCount(0);
});

test('업로드 전 돌아왔습니다 탭은 안내 문구를 보여준다', async ({ page }) => {
  await page.goto('/app#returns');
  await expect(page.getByTestId('empty-returns')).toBeVisible();
  await expect(page.getByTestId('empty-returns')).toContainText('먼저 홈에서 매출 CSV를 올려 주세요');
});
