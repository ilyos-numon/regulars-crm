import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseSalesCsv } from '../../src/domain/csv.ts';
import { buildProfile } from '../../src/features/profile/logic.ts';
import { createHandler } from '../../src/http/handler.ts';

const sample = readFileSync(new URL('../fixtures/sales-sample.csv', import.meta.url), 'utf8');
const SALT = 't';
const tx = parseSalesCsv(sample, SALT).transactions;

function idOf(last2: string): string {
  const t = tx.find((x) => x.cardLast2 === last2);
  if (!t) throw new Error(`no customer ${last2}`);
  return t.customerId;
}

let server: http.Server;
let base: string;
let dataDir: string;

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'regulars-profile-'));
  server = http.createServer(createHandler({ dataDir, salt: SALT, today: () => '2026-10-27' }));
  await new Promise<void>((resolve) => server.listen(0, resolve));
  base = `http://localhost:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  rmSync(dataDir, { recursive: true, force: true });
});

describe('profile logic', () => {
  it('A line matches exactly', () => {
    const p = buildProfile(tx, idOf('31'));
    expect(p?.line).toBe('방문 9번 · 평소 13일마다 · 한 번에 4,500원 · 주로 아메리카노 · 아침 시간대 · 요일은 일정하지 않음');
    expect(p?.visits).toBe(9);
    expect(p?.avgIntervalDays).toBe(13);
  });

  it('C spend per visit 7,960 and mostly Saturday', () => {
    const p = buildProfile(tx, idOf('49'));
    expect(p?.visits).toBe(5);
    expect(p?.spendPerVisit).toBe(7960);
    expect(p?.band).toBe('아침');
    expect(p?.weekday).toBe('주로 토요일');
    expect(p?.line).toContain('한 번에 7,960원');
  });

  it('B band is afternoon', () => {
    const p = buildProfile(tx, idOf('07'));
    expect(p?.band).toBe('오후');
    expect(p?.line).toContain('오후 시간대');
  });

  it('D with one visit has unknown interval', () => {
    const p = buildProfile(tx, idOf('50'));
    expect(p?.visits).toBe(1);
    expect(p?.avgIntervalDays).toBeNull();
    expect(p?.line).toContain('평소 주기 아직 몰라요');
  });

  it('unknown id → null', () => {
    expect(buildProfile(tx, 'nobody')).toBeNull();
  });
});

describe('GET /api/profile/:id', () => {
  it('before upload → 404 no upload', async () => {
    const res = await fetch(`${base}/api/profile/${idOf('31')}`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: '아직 업로드된 매출이 없습니다' });
  });

  it('after upload → A profile fields', async () => {
    const up = await fetch(`${base}/api/upload?asOf=2026-10-27`, {
      method: 'POST', headers: { 'Content-Type': 'text/csv' }, body: sample,
    });
    expect(up.status).toBe(200);
    const res = await fetch(`${base}/api/profile/${idOf('31')}?asOf=2026-10-27`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(
      ['customerId', 'cardLast2', 'visits', 'avgIntervalDays', 'spendPerVisit', 'topItem', 'band', 'weekday', 'line'].sort(),
    );
    expect(body.cardLast2).toBe('31');
    expect(body.line).toBe('방문 9번 · 평소 13일마다 · 한 번에 4,500원 · 주로 아메리카노 · 아침 시간대 · 요일은 일정하지 않음');
    expect(readdirSync(dataDir)).toEqual(['latest.json']);
  });

  it('unknown id → 404', async () => {
    const res = await fetch(`${base}/api/profile/nobody?asOf=2026-10-27`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: '그런 손님이 없습니다' });
  });

  it('bad asOf → 400', async () => {
    const res = await fetch(`${base}/api/profile/${idOf('31')}?asOf=2026/10/27`);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'asOf 는 YYYY-MM-DD 형식이어야 합니다' });
  });
});
