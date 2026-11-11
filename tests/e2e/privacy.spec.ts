import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'csv-parse/sync';

const DATA_DIR = path.resolve('test-results/e2e-data');
const FIX = (name: string) => path.resolve('tests/fixtures', name);
const AS_OF = '2026-10-27';

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full));
    else out.push(full);
  }
  return out;
}

test('저장 파일에 원본 카드번호·전화번호가 없다', async ({ request }) => {
  const reset = await request.delete('/api/data');
  expect(reset.ok()).toBeTruthy();

  const salesCsv = fs.readFileSync(FIX('sales-returned.csv'), 'utf8');
  const rows = parse(salesCsv.replace(/^﻿/, ''), { columns: false, skip_empty_lines: true }) as string[][];
  const cards = [...new Set(rows.slice(1).map((r) => r[1]).filter((v) => v && v.length > 0))];
  expect(cards.length).toBeGreaterThan(0);

  const up = await request.post(`/api/upload?asOf=${AS_OF}`, { data: salesCsv, headers: { 'content-type': 'text/csv' } });
  expect(up.status()).toBe(200);
  const report = await up.json();
  const first = report.candidates[0];
  expect(first.customerId).toBeTruthy();
  const id: string = first.customerId;
  const last2: string = first.cardLast2;

  const memo = await request.post('/api/memos', { data: { customerId: id, cardLast2: last2, note: '원래 뜸한 분', action: 'none' } });
  expect(memo.status()).toBe(200);
  const notice = await request.post('/api/notices', { data: { customerId: id, cardLast2: last2, noticedOn: '2026-10-13', source: 'draft' } });
  expect(notice.status()).toBe(200);
  const rev = await request.post('/api/reviews/import', { data: fs.readFileSync(FIX('reviews-sample.csv'), 'utf8'), headers: { 'content-type': 'text/csv' } });
  expect(rev.status()).toBe(200);
  const wx = await request.post('/api/weather/import', { data: fs.readFileSync(FIX('weather-sample.csv'), 'utf8'), headers: { 'content-type': 'text/csv' } });
  expect(wx.status()).toBe(200);

  for (const p of [`/api/draft/${id}?asOf=${AS_OF}`, `/api/profile/${id}?asOf=${AS_OF}`, `/api/hint/${id}?asOf=${AS_OF}`, `/api/briefing?asOf=${AS_OF}`]) {
    const r = await request.get(p);
    expect(r.status(), p).toBe(200);
  }

  const files = listFiles(DATA_DIR);
  const sizes = files.map((f) => `${path.relative(DATA_DIR, f)}(${fs.statSync(f).size}B)`);
  console.log(`privacy: read ${files.length} files: ${sizes.join(', ')}`);
  expect(files.length).toBeGreaterThanOrEqual(1);
  const names = files.map((f) => path.basename(f));
  expect(names).toContain('memos.json');
  expect(names).toContain('notices.json');
  expect(files.some((f) => fs.statSync(f).size > 0)).toBe(true);

  for (const f of files) {
    const text = fs.readFileSync(f, 'utf8');
    const name = path.relative(DATA_DIR, f);
    for (const card of cards) expect(text.includes(card), `${name} 에 카드번호 원문 ${card}`).toBe(false);
    const noDates = text.replace(/\d{4}[-./]\d{2}[-./]\d{2}/g, 'D');
    const squeezed = noDates.replace(/(?<=\d)[-\s]+(?=\d)/g, '');
    expect(/(?<![0-9a-fA-F])\d{8,}(?![0-9a-fA-F])/.test(squeezed), `${name} 에 연속 숫자 8자리 이상`).toBe(false);
    expect(/01[0-9]-?\d{3,4}-?\d{4}/.test(noDates), `${name} 에 전화번호 형태`).toBe(false);
  }
});
