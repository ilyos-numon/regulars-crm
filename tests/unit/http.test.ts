import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHandler } from '../../src/http/handler.ts';

const sample = readFileSync(new URL('../fixtures/sales-sample.csv', import.meta.url), 'utf8');

let server: http.Server;
let base: string;
let dataDir: string;

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'regulars-http-'));
  server = http.createServer(createHandler({ dataDir, salt: 't', today: () => '2026-10-27' }));
  await new Promise<void>((resolve) => server.listen(0, resolve));
  base = `http://localhost:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  rmSync(dataDir, { recursive: true, force: true });
});

function upload(body: string, query = '?asOf=2026-10-27'): Promise<Response> {
  return fetch(`${base}/api/upload${query}`, { method: 'POST', headers: { 'Content-Type': 'text/csv' }, body });
}

describe('http handler', () => {
  it('GET /health → 200 {ok:true}', async () => {
    const res = await fetch(`${base}/health`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/json; charset=utf-8');
    expect(await res.json()).toEqual({ ok: true });
  });

  it('unknown path → 404 not found', async () => {
    const res = await fetch(`${base}/nope`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not found' });
  });

  it('GET /api/churn before upload → 404', async () => {
    const res = await fetch(`${base}/api/churn`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: '아직 업로드된 매출이 없습니다' });
  });

  it('POST /api/upload missing column → 400 message', async () => {
    const res = await upload('거래일시,금액\n2026-10-01,5000\n');
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: '필수 열이 없습니다: 카드번호' });
  });

  it('POST /api/upload bad asOf → 400', async () => {
    const res = await upload(sample, '?asOf=2026/10/27');
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'asOf 는 YYYY-MM-DD 형식이어야 합니다' });
  });

  it('POST /api/upload sample → 200 expected summary', async () => {
    const res = await upload(sample);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/json; charset=utf-8');
    const body = await res.json();
    expect(body).toMatchObject({ asOf: '2026-10-27', transactions: 24, customers: 5, regulars: 3, skippedRows: 1 });
    expect(body.candidates).toHaveLength(2);
    expect(body.candidates[0]).toMatchObject({ cardLast2: '31', daysSinceLast: 38, delayRatio: 2.9 });
  });

  it('latest.json does not contain raw card numbers', () => {
    const raw = readFileSync(join(dataDir, 'latest.json'), 'utf8');
    expect(raw).not.toContain('1234-56');
    expect(raw).not.toContain('9876-54');
    expect(raw).not.toContain('5555-44');
    const parsed = JSON.parse(raw);
    expect(typeof parsed.uploadedAt).toBe('string');
    expect(parsed.transactions).toHaveLength(24);
  });

  it('GET /api/churn after upload → 200 candidates 2 (today default)', async () => {
    const res = await fetch(`${base}/api/churn`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.asOf).toBe('2026-10-27');
    expect(body.candidates).toHaveLength(2);
    expect(body).not.toHaveProperty('skippedRows');
  });

  it('GET /api/churn limit=1 → 1 candidate; invalid limit → 400', async () => {
    const one = await fetch(`${base}/api/churn?asOf=2026-10-27&limit=1`);
    expect(one.status).toBe(200);
    expect((await one.json()).candidates).toHaveLength(1);
    const bad = await fetch(`${base}/api/churn?limit=21`);
    expect(bad.status).toBe(400);
    const badAsOf = await fetch(`${base}/api/churn?asOf=20261027`);
    expect(badAsOf.status).toBe(400);
    expect(await badAsOf.json()).toEqual({ error: 'asOf 는 YYYY-MM-DD 형식이어야 합니다' });
  });

  it('POST /api/upload over 5MB → 413', async () => {
    const big = 'a'.repeat(5 * 1024 * 1024 + 1);
    const res = await upload(big);
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: '파일이 너무 큽니다(최대 5MB)' });
  });
});

describe('core routes', () => {
  let srv: http.Server;
  let url: string;
  let dir: string;
  let resetSrv: http.Server;
  let resetUrl: string;
  let resetDir: string;

  async function start(opts: { dataDir: string; allowReset?: boolean }): Promise<[http.Server, string]> {
    const s = http.createServer(createHandler({ ...opts, salt: 't', today: () => '2026-10-27' }));
    await new Promise<void>((resolve) => s.listen(0, resolve));
    return [s, `http://localhost:${(s.address() as AddressInfo).port}`];
  }

  function post(u: string, path: string, body: string, query = ''): Promise<Response> {
    return fetch(`${u}${path}${query}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
  }

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'regulars-core-'));
    resetDir = mkdtempSync(join(tmpdir(), 'regulars-reset-'));
    [srv, url] = await start({ dataDir: dir });
    [resetSrv, resetUrl] = await start({ dataDir: resetDir, allowReset: true });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => srv.close(() => resolve()));
    await new Promise<void>((resolve) => resetSrv.close(() => resolve()));
    rmSync(dir, { recursive: true, force: true });
    rmSync(resetDir, { recursive: true, force: true });
  });

  it('GET /api/status before upload → hasUpload false, counts 0', async () => {
    const res = await fetch(`${url}/api/status`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      hasUpload: false, uploadedAt: null, transactions: 0, customers: 0, regulars: 0,
      notices: 0, memos: 0, reviews: 0, weatherDays: 0,
    });
  });

  it('GET /api/status after upload → sample counts', async () => {
    const up = await fetch(`${url}/api/upload?asOf=2026-10-27`, { method: 'POST', headers: { 'Content-Type': 'text/csv' }, body: sample });
    expect(up.status).toBe(200);
    const res = await fetch(`${url}/api/status`);
    const body = await res.json();
    expect(body).toMatchObject({ hasUpload: true, transactions: 24, customers: 5, regulars: 3, notices: 0 });
    expect(typeof body.uploadedAt).toBe('string');
  });

  it('POST /api/upload and GET /api/churn include heldBack array and adjustments', async () => {
    const up = await fetch(`${url}/api/upload?asOf=2026-10-27`, { method: 'POST', headers: { 'Content-Type': 'text/csv' }, body: sample });
    const upBody = await up.json();
    expect(upBody.heldBack).toEqual([]);
    expect(upBody.skippedRows).toBe(1);
    const res = await fetch(`${url}/api/churn?asOf=2026-10-27`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.heldBack)).toBe(true);
    expect(body.heldBack).toHaveLength(0);
    expect(body.candidates).toHaveLength(2);
    expect(body.candidates[0]).toMatchObject({ cardLast2: '31', daysSinceLast: 38, delayRatio: 2.9, adjustments: [{ source: 'weather', note: '비·연휴 6일을 빼도 2.5배', hold: false }] });
  });

  it('POST /api/notices bad shape → 400 message', async () => {
    for (const bad of ['not json', '{}', JSON.stringify({ customerId: 'x', cardLast2: '31', source: 'push' }),
      JSON.stringify({ customerId: 'x', cardLast2: '31', source: 'draft', noticedOn: '2026/10/27' })]) {
      const res = await post(url, '/api/notices', bad);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: '알림 기록 형식이 잘못되었습니다' });
    }
  });

  it('POST /api/notices ok → 200 full list; noticedOn defaults to today; GET lists them', async () => {
    const first = await post(url, '/api/notices', JSON.stringify({ customerId: 'a', cardLast2: '31', source: 'draft' }));
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual([{ customerId: 'a', cardLast2: '31', noticedOn: '2026-10-27', source: 'draft' }]);
    const second = await post(url, '/api/notices', JSON.stringify({ customerId: 'b', cardLast2: '07', noticedOn: '2026-10-13', source: 'briefing' }));
    expect(await second.json()).toHaveLength(2);
    const list = await fetch(`${url}/api/notices`);
    expect(list.status).toBe(200);
    expect((await list.json())[1]).toEqual({ customerId: 'b', cardLast2: '07', noticedOn: '2026-10-13', source: 'briefing' });
    expect((await (await fetch(`${url}/api/status`)).json()).notices).toBe(2);
  });

  it('DELETE /api/data without allowReset → 404 and data kept', async () => {
    const res = await fetch(`${url}/api/data`, { method: 'DELETE' });
    expect(res.status).toBe(404);
    expect((await fetch(`${url}/api/churn?asOf=2026-10-27`)).status).toBe(200);
  });

  it('DELETE /api/data with allowReset → 200 {ok:true}, then churn 404', async () => {
    const up = await fetch(`${resetUrl}/api/upload?asOf=2026-10-27`, { method: 'POST', headers: { 'Content-Type': 'text/csv' }, body: sample });
    expect(up.status).toBe(200);
    expect((await fetch(`${resetUrl}/api/churn`)).status).toBe(200);
    const res = await fetch(`${resetUrl}/api/data`, { method: 'DELETE' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const after = await fetch(`${resetUrl}/api/churn`);
    expect(after.status).toBe(404);
    expect(await after.json()).toEqual({ error: '아직 업로드된 매출이 없습니다' });
    expect((await (await fetch(`${resetUrl}/api/status`)).json()).hasUpload).toBe(false);
  });

  it('GET /features/:id/panel.js → 200 javascript; unknown id → 404', async () => {
    const res = await fetch(`${url}/features/profile/panel.js`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/javascript; charset=utf-8');
    expect(await res.text()).toContain("window.regulars.register({ id:'profile'");
    const hint = await (await fetch(`${url}/features/hint/panel.js`)).text();
    expect(hint.match(/register\(/g)).toHaveLength(2);
    const bad = await fetch(`${url}/features/nope/panel.js`);
    expect(bad.status).toBe(404);
    expect((await fetch(`${url}/features/..%2Fhttp/panel.js`)).status).toBe(404);
  });
});
