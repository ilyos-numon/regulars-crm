import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseSalesCsv } from '../../src/domain/csv.ts';
import type { Notice } from '../../src/domain/types.ts';
import { buildReturnsReport, computeBaseline } from '../../src/features/returns/logic.ts';
import { createHandler } from '../../src/http/handler.ts';

const csv = readFileSync(new URL('../fixtures/sales-returned.csv', import.meta.url), 'utf8');
const SALT = 't';
const ASOF = '2026-10-27';
const tx = parseSalesCsv(csv, SALT).transactions;

function idOf(last2: string): string {
  const t = tx.find((x) => x.cardLast2 === last2);
  if (!t) throw new Error(`no customer ${last2}`);
  return t.customerId;
}

function notice(last2: string, noticedOn: string): Notice {
  return { customerId: idOf(last2), cardLast2: last2, noticedOn, source: 'draft' };
}

describe('returns logic', () => {
  it('알림 A·B@10-13 → 2명 중 1명 50%', () => {
    const r = buildReturnsReport(tx, [notice('31', '2026-10-13'), notice('07', '2026-10-13')], ASOF);
    expect(r.noticed).toBe(2);
    expect(r.returned).toBe(1);
    expect(r.pending).toBe(0);
    expect(r.notReturned).toBe(1);
    expect(r.rate).toBe(50);
    expect(r.text).toBe('알림 2명 중 1명이 14일 안에 돌아왔습니다 (50%)');
    const b = r.outcomes.find((o) => o.cardLast2 === '07');
    expect(b?.status).toBe('returned');
    expect(b?.returnedOn).toBe('2026-10-25');
    expect(r.outcomes.find((o) => o.cardLast2 === '31')?.status).toBe('not_returned');
  });

  it('기준선은 알림 없는 단골의 과거 4번 중 1번 25%', () => {
    const b = computeBaseline(tx, [notice('31', '2026-10-13'), notice('07', '2026-10-13')], ASOF);
    expect(b).toEqual({ episodes: 4, returned: 1, rate: 25 });
    const r = buildReturnsReport(tx, [notice('31', '2026-10-13'), notice('07', '2026-10-13')], ASOF);
    expect(r.baselineText).toBe('알림 없이 돌아온 비율 25% (과거 4번 중 1번)');
  });

  it('diff 는 +25', () => {
    const r = buildReturnsReport(tx, [notice('31', '2026-10-13'), notice('07', '2026-10-13')], ASOF);
    expect(r.diffPct).toBe(25);
  });

  it('알림 0명 → 빈 text, rate·diff null', () => {
    const r = buildReturnsReport(tx, [], ASOF);
    expect(r.noticed).toBe(0);
    expect(r.text).toBe('');
    expect(r.rate).toBeNull();
    expect(r.diffPct).toBeNull();
    expect(r.outcomes).toEqual([]);
  });

  it('알림 10-20 → 기준일 10-27 에는 기다리는 중', () => {
    const r = buildReturnsReport(tx, [notice('31', '2026-10-20')], ASOF);
    expect(r.outcomes[0].status).toBe('pending');
    expect(r.pending).toBe(1);
    expect(r.rate).toBeNull();
    expect(r.diffPct).toBeNull();
    expect(r.text).toBe('알림 1명 · 기다리는 중 1명 (아직 결과가 나오지 않았습니다)');
  });

  it('결과 일부가 기다리는 중이면 문구 끝에 붙인다', () => {
    const r = buildReturnsReport(tx, [notice('07', '2026-10-13'), notice('31', '2026-10-20')], ASOF);
    expect(r.text).toBe('알림 2명 중 1명이 14일 안에 돌아왔습니다 (100%) · 기다리는 중 1명');
  });

  it('같은 손님은 마지막 알림만 센다', () => {
    const r = buildReturnsReport(tx, [notice('07', '2026-10-13'), notice('07', '2026-10-01')], ASOF);
    expect(r.noticed).toBe(1);
    expect(r.outcomes[0].noticedOn).toBe('2026-10-13');
  });
});

describe('GET /api/returns', () => {
  let server: http.Server;
  let base: string;
  let dataDir: string;

  beforeAll(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'regulars-returns-'));
    server = http.createServer(createHandler({ dataDir, salt: SALT, today: () => ASOF }));
    await new Promise<void>((resolve) => server.listen(0, resolve));
    base = `http://localhost:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('업로드 전 404', async () => {
    const res = await fetch(`${base}/api/returns`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: '아직 업로드된 매출이 없습니다' });
  });

  it('픽스처 업로드 요약 36/7/5, 챙길 단골 G·F·A', async () => {
    const res = await fetch(`${base}/api/upload?asOf=${ASOF}`, { method: 'POST', headers: { 'Content-Type': 'text/csv' }, body: csv });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { transactions: number; customers: number; regulars: number; candidates: { cardLast2: string; daysSinceLast: number; delayRatio: number }[] };
    expect([body.transactions, body.customers, body.regulars]).toEqual([36, 7, 5]);
    expect(body.candidates.map((c) => c.cardLast2)).toEqual(['77', '62', '31']);
    expect(body.candidates.map((c) => [c.daysSinceLast, c.delayRatio])).toEqual([[75, 5.1], [61, 4.3], [38, 2.9]]);
  });

  it('asOf 형식 오류 400', async () => {
    const res = await fetch(`${base}/api/returns?asOf=2026/10/27`);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'asOf 는 YYYY-MM-DD 형식이어야 합니다' });
  });

  it('알림 없음 → 빈 text, 알림 2건 후 50% / 25% / +25', async () => {
    const empty = (await (await fetch(`${base}/api/returns`)).json()) as { noticed: number; text: string };
    expect(empty.noticed).toBe(0);
    expect(empty.text).toBe('');
    for (const n of [notice('31', '2026-10-13'), notice('07', '2026-10-13')]) {
      const res = await fetch(`${base}/api/notices`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(n) });
      expect(res.status).toBe(200);
    }
    const res = await fetch(`${base}/api/returns?asOf=${ASOF}`);
    expect(res.status).toBe(200);
    const r = (await res.json()) as Record<string, unknown>;
    expect(r.text).toBe('알림 2명 중 1명이 14일 안에 돌아왔습니다 (50%)');
    expect(r.baselineText).toBe('알림 없이 돌아온 비율 25% (과거 4번 중 1번)');
    expect(r.baseline).toEqual({ episodes: 4, returned: 1, rate: 25 });
    expect(r.diffPct).toBe(25);
    expect(Object.keys(r).sort()).toEqual(
      ['baseline', 'baselineText', 'diffPct', 'noticed', 'notReturned', 'outcomes', 'pending', 'rate', 'returned', 'text'].sort(),
    );
  });
});
