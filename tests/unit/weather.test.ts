import { mkdtemp, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { _resetAdjustersForTest, applyAdjusters, registerAdjuster } from '../../src/core/pipeline.ts';
import { parseSalesCsv } from '../../src/domain/csv.ts';
import type { ChurnCandidate, Route, RouteContext } from '../../src/domain/types.ts';
import { HOLIDAYS_KR_2026 } from '../../src/features/weather/holidays-kr-2026.ts';
import { feature } from '../../src/features/weather/index.ts';
import {
  countRainy,
  holidayLine,
  parseWeatherCsv,
  saveWeather,
  weatherAdjustment,
  weatherSummary,
} from '../../src/features/weather/logic.ts';

const ASOF = '2026-10-27';
const weatherCsv = readFileSync(new URL('../fixtures/weather-sample.csv', import.meta.url), 'utf8');
const salesCsv = readFileSync(new URL('../fixtures/sales-sample.csv', import.meta.url), 'utf8');
const { transactions } = parseSalesCsv(salesCsv, 'test-salt');

function route(method: string, path: string): Route {
  const r = feature.routes.find((x) => x.method === method && x.path === path);
  if (!r) throw new Error(`no route ${method} ${path}`);
  return r;
}

function fakeCtx(dataDir: string, body: string): { ctx: RouteContext; out: { status: number; body: unknown } } {
  const out = { status: 0, body: null as unknown };
  const ctx: RouteContext = {
    dataDir, salt: 'test-salt', allowReset: false, today: () => ASOF, url: new URL('http://localhost/api/weather'),
    readText: async () => body,
    readJson: async () => null,
    sendJson: (status, b) => { out.status = status; out.body = b; },
  };
  return { ctx, out };
}

describe('weather 기록 파싱', () => {
  it('샘플은 날씨 12일 · 비 온 날 6일', () => {
    const days = parseWeatherCsv(weatherCsv);
    expect(days).toHaveLength(12);
    expect(countRainy(days)).toBe(6);
    expect(weatherSummary(days)).toBe('날씨 12일 · 비 온 날 6일');
  });
});

describe('공휴일 2026', () => {
  it('20일이고 10-03·10-09 를 포함한다', () => {
    expect(HOLIDAYS_KR_2026).toHaveLength(20);
    expect(new Set(HOLIDAYS_KR_2026).size).toBe(20);
    expect(HOLIDAYS_KR_2026).toContain('2026-10-03');
    expect(HOLIDAYS_KR_2026).toContain('2026-10-09');
    expect(holidayLine()).toBe('연휴·공휴일 20일 반영');
  });
});

describe('weatherAdjustment', () => {
  const c: ChurnCandidate = {
    customerId: 'c-31', cardLast2: '31', topItem: null, avgIntervalDays: 13, daysSinceLast: 38, delayRatio: 2.9, lastVisit: '2026-09-19',
  };
  it('badDays 0 이면 null', () => {
    expect(weatherAdjustment(c, 0)).toBeNull();
  });
});

describe('weather adjuster (pipeline)', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'weather-'));
    _resetAdjustersForTest();
    for (const a of feature.adjusters) registerAdjuster(a);
  });
  afterEach(async () => {
    _resetAdjustersForTest();
    await rm(dir, { recursive: true, force: true });
  });

  it('날씨 기록이 있으면 A 는 11일을 빼도 2.1배로 유지, B 는 7일을 빼면 1.9배로 보류', async () => {
    await saveWeather(dir, parseWeatherCsv(weatherCsv));
    const r = await applyAdjusters(transactions, dir, ASOF);
    expect(r.candidates.map((x) => x.cardLast2)).toEqual(['31']);
    expect(r.candidates[0].adjustments).toEqual([{ source: 'weather', note: '비·연휴 11일을 빼도 2.1배', hold: false }]);
    expect(r.heldBack.map((x) => x.cardLast2)).toEqual(['07']);
    expect(r.heldBack[0].adjustments).toEqual([
      { source: 'weather', note: '비·연휴 7일을 빼면 1.9배 — 날씨 영향일 수 있어 이번 주는 보류', hold: true },
    ]);
  });

  it('날씨 기록이 없어도 공휴일을 뺀다 (A 6일 → 2.5배, B 2일 → 2.4배)', async () => {
    const r = await applyAdjusters(transactions, dir, ASOF);
    expect(r.heldBack).toEqual([]);
    const notes = Object.fromEntries(r.candidates.map((x) => [x.cardLast2, x.adjustments.map((a) => a.note)]));
    expect(notes['31']).toEqual(['비·연휴 6일을 빼도 2.5배']);
    expect(notes['07']).toEqual(['비·연휴 2일을 빼도 2.4배']);
  });
});

describe('weather 라우트', () => {
  let dir: string;
  beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'weather-r-')); });
  afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

  it('날짜 열이 없으면 400', async () => {
    const { ctx, out } = fakeCtx(dir, '일자,강수량\n2026-10-05,18\n');
    await route('POST', '/api/weather/import').handle(ctx, {});
    expect(out).toEqual({ status: 400, body: { error: '필수 열이 없습니다: 날짜' } });
  });

  it('가져오기 후 GET 은 요약과 공휴일 줄을 준다', async () => {
    const imp = fakeCtx(dir, weatherCsv);
    await route('POST', '/api/weather/import').handle(imp.ctx, {});
    expect(imp.out).toEqual({ status: 200, body: { days: 12, rainy: 6, summary: '날씨 12일 · 비 온 날 6일' } });
    const get = fakeCtx(dir, '');
    await route('GET', '/api/weather').handle(get.ctx, {});
    expect(get.out).toEqual({
      status: 200,
      body: { days: 12, rainy: 6, holidays: 20, summary: '날씨 12일 · 비 온 날 6일', holidayLine: '연휴·공휴일 20일 반영' },
    });
  });
});
