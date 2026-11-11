import { test, expect } from '@playwright/test';

test('GET /health 는 200 과 {ok:true} 를 돌려준다', async ({ request }) => {
  const res = await request.get('/health');
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({ ok: true });
});

test('/app 페이지에 h1 단골지킴이 가 보인다', async ({ page }) => {
  await page.goto('/app');
  await expect(page.locator('h1')).toHaveText('단골지킴이');
});
