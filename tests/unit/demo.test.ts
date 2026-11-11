import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  createDemoHandler,
  type DemoServer,
  injectUploadNote,
  newVisitorId,
  readDemoOptions,
  sweepVisitors,
  UPLOAD_NOTE_MARKER,
  VISITOR_ID_RE,
  visitorCookie,
  visitorIdFrom,
} from '../../src/http/demo.ts';

const NOTE_24 =
  '<p class="demo-upload-note" data-testid="demo-upload-note" role="note">데모에는 예시 파일만 올려 주세요. 올린 매출은 이 브라우저에서만 보이고 늦어도 24시간 뒤 지워집니다.</p>';
const ID_A = 'a'.repeat(32);
const ID_B = 'b'.repeat(32);

describe('readDemoOptions', () => {
  it('데모 모드가 꺼져 있으면 null', () => {
    expect(readDemoOptions({}, '/d')).toBeNull();
    expect(readDemoOptions({ REGULARS_DEMO_MODE: '0' }, '/d')).toBeNull();
    expect(readDemoOptions({ REGULARS_DEMO_MODE: 'true' }, '/d')).toBeNull();
  });

  it('켜져 있고 값이 없으면 기본값', () => {
    expect(readDemoOptions({ REGULARS_DEMO_MODE: '1' }, '/d')).toEqual({
      rootDir: '/d',
      ttlMs: 24 * 3_600_000,
      sweepMs: 30 * 60_000,
      maxVisitors: 100,
    });
  });

  it('소수 값을 허용한다', () => {
    const o = readDemoOptions(
      { REGULARS_DEMO_MODE: '1', REGULARS_DEMO_TTL_HOURS: '0.5', REGULARS_DEMO_SWEEP_MINUTES: '0.05', REGULARS_DEMO_MAX_VISITORS: '3.9' },
      '/d',
    );
    expect(o).toEqual({ rootDir: '/d', ttlMs: 1_800_000, sweepMs: 3000, maxVisitors: 3 });
  });

  it('잘못된 값은 기본값으로', () => {
    const o = readDemoOptions(
      { REGULARS_DEMO_MODE: '1', REGULARS_DEMO_TTL_HOURS: 'abc', REGULARS_DEMO_SWEEP_MINUTES: '-5', REGULARS_DEMO_MAX_VISITORS: '0.5' },
      '/d',
    );
    expect(o).toEqual({ rootDir: '/d', ttlMs: 24 * 3_600_000, sweepMs: 30 * 60_000, maxVisitors: 100 });
    const inf = readDemoOptions({ REGULARS_DEMO_MODE: '1', REGULARS_DEMO_TTL_HOURS: 'Infinity', REGULARS_DEMO_MAX_VISITORS: '0' }, '/d');
    expect(inf?.ttlMs).toBe(24 * 3_600_000);
    expect(inf?.maxVisitors).toBe(100);
  });
});

describe('visitorIdFrom / newVisitorId', () => {
  it('정상 쿠키 값을 돌려준다', () => {
    expect(visitorIdFrom(`rc_demo=${ID_A}`)).toBe(ID_A);
  });

  it('위조·형식 밖 값은 null', () => {
    expect(visitorIdFrom(undefined)).toBeNull();
    expect(visitorIdFrom('')).toBeNull();
    expect(visitorIdFrom('rc_demo=../../etc')).toBeNull();
    expect(visitorIdFrom(`rc_demo=${'A'.repeat(32)}`)).toBeNull();
    expect(visitorIdFrom(`rc_demo=${ID_A}0`)).toBeNull();
    expect(visitorIdFrom(`rc_demo=${ID_A.slice(1)}/`)).toBeNull();
    expect(visitorIdFrom(`other=${ID_A}`)).toBeNull();
  });

  it('여러 쿠키 중에서 rc_demo 만 고른다', () => {
    expect(visitorIdFrom(`foo=1; rc_demo=${ID_B}; bar=${ID_A}`)).toBe(ID_B);
    expect(visitorIdFrom(`x_rc_demo=${ID_A};rc_demo=${ID_B}`)).toBe(ID_B);
  });

  it('newVisitorId 는 32자 hex 이고 매번 다르다', () => {
    const a = newVisitorId();
    expect(a).toMatch(VISITOR_ID_RE);
    expect(newVisitorId()).not.toBe(a);
  });
});

describe('visitorCookie', () => {
  it('Secure 없이', () => {
    expect(visitorCookie(ID_A, 86400, false)).toBe(`rc_demo=${ID_A}; Path=/; Max-Age=86400; HttpOnly; SameSite=Lax`);
  });

  it('Secure 포함', () => {
    expect(visitorCookie(ID_A, 60, true)).toBe(`rc_demo=${ID_A}; Path=/; Max-Age=60; HttpOnly; SameSite=Lax; Secure`);
  });
});

describe('injectUploadNote', () => {
  const html = readFileSync(new URL('../../src/web/index.html', import.meta.url), 'utf8');

  it('실제 index.html 의 업로드 폼 바로 앞에 한 번 넣는다', () => {
    const out = injectUploadNote(html, 24);
    expect(out.split(NOTE_24).length - 1).toBe(1);
    const noteAt = out.indexOf(NOTE_24);
    const formAt = out.indexOf(UPLOAD_NOTE_MARKER);
    expect(noteAt).toBeGreaterThan(-1);
    expect(out.slice(noteAt + NOTE_24.length, formAt).trim()).toBe('');
    expect(out.replace(NOTE_24 + '\n    ', '')).toBe(html);
  });

  it('시간 숫자를 그대로 쓰고, 표지가 없으면 그대로 둔다', () => {
    expect(injectUploadNote(`x${UPLOAD_NOTE_MARKER}`, 2)).toContain('늦어도 2시간 뒤 지워집니다.');
    expect(injectUploadNote('<p>no form</p>', 24)).toBe('<p>no form</p>');
  });

  it('엔진 용어가 없다', () => {
    expect(/api|hash|llm|n8n/i.test(NOTE_24)).toBe(false);
  });
});

describe('sweepVisitors', () => {
  const HOUR = 3_600_000;
  let root: string;

  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
  });

  function makeVisitor(id: string, ageMs: number, now: number): string {
    const dir = join(root, 'visitors', id);
    mkdirSync(dir, { recursive: true });
    const f = join(dir, 'latest.json');
    writeFileSync(f, '{}');
    const t = (now - ageMs) / 1000;
    utimesSync(f, t, t);
    utimesSync(dir, t, t);
    return dir;
  }

  it('visitors 폴더가 없으면 빈 결과', async () => {
    root = mkdtempSync(join(tmpdir(), 'regulars-demo-'));
    expect(await sweepVisitors(root, 24 * HOUR, 100, Date.now())).toEqual({ removed: [], kept: 0 });
  });

  it('25시간 전은 지우고 1분 전은 남기며 이름 규칙 밖은 건드리지 않는다', async () => {
    root = mkdtempSync(join(tmpdir(), 'regulars-demo-'));
    const now = Date.now();
    const old = makeVisitor(ID_A, 25 * HOUR, now);
    const fresh = makeVisitor(ID_B, 60_000, now);
    const odd = makeVisitor('not-a-visitor', 25 * HOUR, now);
    const res = await sweepVisitors(root, 24 * HOUR, 100, now);
    expect(res).toEqual({ removed: [ID_A], kept: 1 });
    expect(existsSync(old)).toBe(false);
    expect(existsSync(fresh)).toBe(true);
    expect(existsSync(odd)).toBe(true);
  });

  it('안 파일이 최근이면 폴더가 오래돼도 남긴다', async () => {
    root = mkdtempSync(join(tmpdir(), 'regulars-demo-'));
    const now = Date.now();
    const dir = makeVisitor(ID_A, 25 * HOUR, now);
    const t = (now - 60_000) / 1000;
    utimesSync(join(dir, 'latest.json'), t, t);
    expect(await sweepVisitors(root, 24 * HOUR, 100, now)).toEqual({ removed: [], kept: 1 });
  });

  it('상한을 넘으면 오래된 것부터 지운다', async () => {
    root = mkdtempSync(join(tmpdir(), 'regulars-demo-'));
    const now = Date.now();
    const ids = ['1', '2', '3', '4'].map((c) => c.repeat(32));
    ids.forEach((id, i) => makeVisitor(id, (i + 1) * HOUR, now)); // ids[3] 가 가장 오래됨
    const res = await sweepVisitors(root, 24 * HOUR, 2, now);
    expect(res.kept).toBe(2);
    expect(res.removed.sort()).toEqual([ids[2], ids[3]].sort());
    expect(readdirSync(join(root, 'visitors')).sort()).toEqual([ids[0], ids[1]]);
  });
});

describe('createDemoHandler', () => {
  const sample = readFileSync(new URL('../fixtures/sales-sample.csv', import.meta.url), 'utf8');
  let root: string;
  let server: http.Server;
  let demo: DemoServer;
  let base: string;

  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), 'regulars-demo-http-'));
    demo = createDemoHandler(
      { salt: 't', today: () => '2026-10-27' },
      { rootDir: root, ttlMs: 24 * 3_600_000, sweepMs: 60_000, maxVisitors: 100 },
    );
    server = http.createServer(demo.handle);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    base = `http://localhost:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    demo.stop();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(root, { recursive: true, force: true });
  });

  it('방문자 A 가 올린 매출은 A 에게만 보인다', async () => {
    const up = await fetch(`${base}/api/upload?asOf=2026-10-27`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/csv', Cookie: `rc_demo=${ID_A}` },
      body: sample,
    });
    expect(up.status).toBe(200);
    expect(up.headers.get('set-cookie')).toBeNull();
    const a = await fetch(`${base}/api/churn?asOf=2026-10-27`, { headers: { Cookie: `rc_demo=${ID_A}` } });
    expect(a.status).toBe(200);
    const b = await fetch(`${base}/api/churn?asOf=2026-10-27`, { headers: { Cookie: `rc_demo=${ID_B}` } });
    expect(b.status).toBe(404);
    expect(existsSync(join(root, 'visitors', ID_A))).toBe(true);
    expect(existsSync(join(root, 'visitors', ID_B))).toBe(false);
  });

  it('/health 와 /static 은 쿠키를 주지 않는다', async () => {
    const h = await fetch(`${base}/health`);
    expect(h.status).toBe(200);
    expect(h.headers.get('set-cookie')).toBeNull();
    const s = await fetch(`${base}/static/app.css`);
    expect(s.status).toBe(200);
    expect(s.headers.get('set-cookie')).toBeNull();
  });

  it('위조 쿠키는 새 쿠키로 바꾸고 위조 이름 폴더를 만들지 않는다', async () => {
    const forged = '..%2F..%2Fetc';
    const res = await fetch(`${base}/api/upload?asOf=2026-10-27`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/csv', Cookie: `rc_demo=${forged}` },
      body: sample,
    });
    expect(res.status).toBe(200);
    const cookie = res.headers.get('set-cookie') ?? '';
    const m = /^rc_demo=([a-f0-9]{32}); Path=\/; Max-Age=86400; HttpOnly; SameSite=Lax$/.exec(cookie);
    expect(m).not.toBeNull();
    const names = readdirSync(join(root, 'visitors'));
    expect(names).toContain(m![1]);
    expect(names.every((n) => VISITOR_ID_RE.test(n))).toBe(true);
    expect(existsSync(join(root, 'etc'))).toBe(false);
  });

  it('https 프록시 뒤면 Secure 를 붙이고 /app 에 안내를 넣는다', async () => {
    const res = await fetch(`${base}/app`, { headers: { 'X-Forwarded-Proto': 'https' } });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(res.headers.get('set-cookie')).toMatch(/; Secure$/);
    const html = await res.text();
    expect(html.split(NOTE_24).length - 1).toBe(1);
  });

  it('소개 / 에는 안내를 넣지 않는다', async () => {
    const res = await fetch(`${base}/`, { headers: { Cookie: `rc_demo=${ID_A}` } });
    expect(res.status).toBe(200);
    expect(await res.text()).not.toContain('demo-upload-note');
  });
});
