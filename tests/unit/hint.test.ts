import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseSalesCsv } from '../../src/domain/csv.ts';
import type { Transaction } from '../../src/domain/types.ts';
import { changeHint, isSudden, personalHint, storeHint } from '../../src/features/hint/logic.ts';
import { createHandler } from '../../src/http/handler.ts';

const SALT = 't';
const ASOF = '2026-10-27';
const sample = readFileSync(new URL('../fixtures/sales-sample.csv', import.meta.url), 'utf8');
const { transactions: sampleTx } = parseSalesCsv(sample, SALT);

function idOf(tx: Transaction[], last2: string): string {
  const t = tx.find((x) => x.cardLast2 === last2);
  if (!t) throw new Error(`no customer ${last2}`);
  return t.customerId;
}

function visits(id: string, days: string[]): Transaction[] {
  return days.map((date) => ({ customerId: id, cardLast2: id.slice(-2), date, time: '09:00', amount: 5000, item: '라떼' }));
}

const A_TEXT = '평소대로 오시다가 갑자기 끊겼습니다 같은 시기에 다른 단골 1명도 끊겼습니다 — 가게 쪽 이유일 수 있어요';
const CLUSTER_TEXT = '단골 2명이 9월 19일부터 10월 3일 사이에 발길이 끊겼습니다. 가게 쪽 변화(가격·메뉴·영업시간)가 있었는지 돌아보세요.';

describe('hint logic', () => {
  it('A: 갑자기 + 같은 시기 다른 단골 1명', () => {
    const h = personalHint(sampleTx, idOf(sampleTx, '31'), ASOF);
    expect(h).toEqual({ sudden: true, companions: 1, text: A_TEXT });
  });

  it('간격 7,7,7,12,14 손님은 서서히', () => {
    const days = ['2026-08-01', '2026-08-08', '2026-08-15', '2026-08-22', '2026-09-03', '2026-09-17'];
    expect(isSudden(days)).toBe(false);
    const h = personalHint(visits('slow01', days), 'slow01', ASOF);
    expect(h).toEqual({ sudden: false, companions: 0, text: '서서히 뜸해지다가 끊겼습니다' });
  });

  it('모르는 손님은 null', () => {
    expect(personalHint(sampleTx, 'nobody', ASOF)).toBeNull();
  });

  it('가게 묶음 샘플 문구', () => {
    expect(storeHint(sampleTx, ASOF)).toEqual({
      cluster: { count: 2, from: '2026-09-19', to: '2026-10-03' },
      text: CLUSTER_TEXT,
    });
  });

  it('묶음 없음 문구', () => {
    const tx = [
      ...visits('one001', ['2026-07-01', '2026-07-08', '2026-07-15']),
      ...visits('two002', ['2026-08-10', '2026-08-17', '2026-08-24']),
    ];
    expect(storeHint(tx, ASOF)).toEqual({ cluster: null, text: '같은 시기에 몰려서 끊긴 단골은 없습니다' });
  });

  it('변경일 10-04 → 8번 → 3번 (63% 감소)', () => {
    expect(changeHint(sampleTx, '2026-10-04', ASOF)).toEqual({
      before: 8, after: 3, changePct: -63, text: '8번 → 3번 (63% 감소)',
    });
  });

  it('변경일 09-20 → 변화 없음', () => {
    expect(changeHint(sampleTx, '2026-09-20', ASOF)).toEqual({
      before: 6, after: 6, changePct: 0, text: '6번 → 6번 (변화 없음)',
    });
  });

  it('before 0 이면 changePct null', () => {
    expect(changeHint(sampleTx, '2026-01-01', ASOF).changePct).toBeNull();
  });
});

describe('hint routes', () => {
  let server: http.Server;
  let base: string;
  let dataDir: string;

  beforeAll(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'regulars-hint-'));
    server = http.createServer(createHandler({ dataDir, salt: SALT, today: () => ASOF }));
    await new Promise<void>((resolve) => server.listen(0, resolve));
    base = `http://localhost:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(dataDir, { recursive: true, force: true });
  });

  async function get(path: string): Promise<{ status: number; body: unknown }> {
    const res = await fetch(`${base}${path}`);
    return { status: res.status, body: await res.json() };
  }

  it('업로드 전 404', async () => {
    expect(await get('/api/hint/store')).toEqual({ status: 404, body: { error: '아직 업로드된 매출이 없습니다' } });
  });

  it('업로드 후 세 라우트와 오류', async () => {
    const up = await fetch(`${base}/api/upload?asOf=${ASOF}`, { method: 'POST', headers: { 'Content-Type': 'text/csv' }, body: sample });
    expect(up.status).toBe(200);

    const a = await get(`/api/hint/${idOf(sampleTx, '31')}?asOf=${ASOF}`);
    expect(a).toEqual({ status: 200, body: { sudden: true, companions: 1, text: A_TEXT } });

    const store = await get('/api/hint/store');
    expect(store.status).toBe(200);
    expect((store.body as { text: string }).text).toBe(CLUSTER_TEXT);

    const change = await get('/api/hint/change?date=2026-10-04');
    expect(change).toEqual({ status: 200, body: { before: 8, after: 3, changePct: -63, text: '8번 → 3번 (63% 감소)' } });

    const badDate = { status: 400, body: { error: '날짜는 YYYY-MM-DD 형식이어야 합니다' } };
    expect(await get('/api/hint/change?date=2026/10/04')).toEqual(badDate);
    expect(await get('/api/hint/change')).toEqual(badDate);

    expect(await get('/api/hint/store?asOf=2026-1-1')).toEqual({ status: 400, body: { error: 'asOf 는 YYYY-MM-DD 형식이어야 합니다' } });
    expect(await get('/api/hint/없는id')).toEqual({ status: 404, body: { error: '그런 손님이 없습니다' } });

    expect(readdirSync(dataDir)).toEqual(['latest.json']);
  });
});
