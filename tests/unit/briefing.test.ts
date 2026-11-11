import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { appendNotices, loadNotices } from '../../src/core/notices.ts';
import { _resetAdjustersForTest } from '../../src/core/pipeline.ts';
import { parseSalesCsv } from '../../src/domain/csv.ts';
import type { RouteContext } from '../../src/domain/types.ts';
import { resolveChannel, sendBriefing, telegramUrl } from '../../src/features/briefing/channels.ts';
import { buildBriefing, countReturnedLastWeek, deliverBriefing, listHistory } from '../../src/features/briefing/logic.ts';
import { routes } from '../../src/features/briefing/routes.ts';
import { saveLatest } from '../../src/store.ts';

const SALT = 'unit-salt';
const ASOF = '2026-10-27';
const sample = readFileSync(new URL('../fixtures/sales-sample.csv', import.meta.url), 'utf8');
// B(··07) 가 10-25 에 다시 온 행 (돌아옴 픽스처의 첫 행과 같다)
const returnedCsv = `${sample.trimEnd()}\n2026-10-25 15:20:00,9876-54**-****-1207,5500,라떼\n`;
const PAYLOAD = { text: '이번 주 챙길 단골 2명', sentAt: '2026-10-27T00:00:00.000Z', candidates: 2, returned: 0 };

let dataDir: string;

beforeEach(() => {
  _resetAdjustersForTest();
  dataDir = mkdtempSync(join(tmpdir(), 'briefing-'));
});

afterEach(() => {
  vi.unstubAllGlobals();
  rmSync(dataDir, { recursive: true, force: true });
});

function okFetch(status = 200) {
  const fn = vi.fn(async (_url: string, _init?: RequestInit) => new Response('{}', { status }));
  vi.stubGlobal('fetch', fn);
  return fn;
}

function fakeCtx(method: string, path: string) {
  const sent: { status: number; body: unknown }[] = [];
  const ctx: RouteContext = {
    dataDir, salt: SALT, allowReset: false, today: () => ASOF,
    url: new URL(path, 'http://localhost'),
    readText: async () => null,
    readJson: async () => null,
    sendJson: (status, body) => { sent.push({ status, body }); },
  };
  const route = routes.find((r) => r.method === method && r.path === new URL(path, 'http://localhost').pathname)!;
  return { run: () => route.handle(ctx, {}), sent };
}

describe('브리핑 문구', () => {
  it('샘플 2026-10-27 은 챙길 단골 2명, 지난주 돌아온 단골 0명', async () => {
    await saveLatest(dataDir, parseSalesCsv(sample, SALT).transactions);
    const b = (await buildBriefing(dataDir, ASOF))!;
    const lines = b.text.split('\n');
    expect(lines[0]).toBe('이번 주 챙길 단골 2명');
    expect(lines).toHaveLength(4);
    expect(lines[1]).toMatch(/^카드 ··31 · 아메리카노 — /);
    expect(lines[3]).toBe('지난주 돌아온 단골 0명');
    expect(b.candidates).toBe(2);
    expect(b.returned).toBe(0);
  });

  it('챙길 단골이 없으면 "이번 주 챙길 단골이 없습니다"', async () => {
    await saveLatest(dataDir, parseSalesCsv(sample, SALT).transactions);
    const b = (await buildBriefing(dataDir, '2026-06-08'))!;
    expect(b.text).toBe('이번 주 챙길 단골이 없습니다\n지난주 돌아온 단골 0명');
    expect(b.candidates).toBe(0);
  });

  it('업로드 전이면 null, 라우트는 404', async () => {
    expect(await buildBriefing(dataDir, ASOF)).toBeNull();
    const { run, sent } = fakeCtx('GET', '/api/briefing');
    await run();
    expect(sent[0]).toEqual({ status: 404, body: { error: '아직 업로드된 매출이 없습니다' } });
  });

  it('asOf 형식 오류는 400', async () => {
    const { run, sent } = fakeCtx('GET', '/api/briefing?asOf=2026/10/27');
    await run();
    expect(sent[0]).toEqual({ status: 400, body: { error: 'asOf 는 YYYY-MM-DD 형식이어야 합니다' } });
  });
});

describe('지난주 돌아온 단골 M', () => {
  it('알림 B@10-13 + B 10-25 방문 → 1명, 알림 없음 → 0명', async () => {
    const tx = parseSalesCsv(returnedCsv, SALT).transactions;
    const b = tx.find((t) => t.cardLast2 === '07')!;
    const notice = { customerId: b.customerId, cardLast2: '07', noticedOn: '2026-10-13', source: 'draft' as const };
    expect(countReturnedLastWeek(tx, [notice], ASOF)).toBe(1);
    expect(countReturnedLastWeek(tx, [], ASOF)).toBe(0);
    // 10-25 는 (10-27-7, 10-27] 안, 기준일 11-02 이면 (10-26, 11-02] 밖
    expect(countReturnedLastWeek(tx, [notice], '2026-11-02')).toBe(0);

    await saveLatest(dataDir, tx);
    await appendNotices(dataDir, [notice]);
    const briefing = (await buildBriefing(dataDir, ASOF))!;
    expect(briefing.text.split('\n').at(-1)).toBe('지난주 돌아온 단골 1명');
  });
});

describe('채널', () => {
  it('webhook 은 PUSH_WEBHOOK_URL 로 JSON 본문을 POST 한다', async () => {
    const fn = okFetch();
    const name = await sendBriefing(PAYLOAD, { PUSH_CHANNEL: 'webhook', PUSH_WEBHOOK_URL: 'http://localhost:8798/push' });
    expect(name).toBe('webhook');
    expect(fn).toHaveBeenCalledTimes(1);
    const [url, init] = fn.mock.calls[0]!;
    expect(url).toBe('http://localhost:8798/push');
    expect(init?.method).toBe('POST');
    expect((init?.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect(JSON.parse(String(init?.body))).toEqual(PAYLOAD);
  });

  it('webhook URL 이 없으면 throw', async () => {
    okFetch();
    await expect(sendBriefing(PAYLOAD, { PUSH_CHANNEL: 'webhook' })).rejects.toThrow();
  });

  it('telegram 은 sendMessage URL 에 chat_id·text 를 보낸다', async () => {
    const fn = okFetch();
    const env = { PUSH_CHANNEL: 'telegram', PUSH_TELEGRAM_TOKEN: 'tok', PUSH_TELEGRAM_CHAT_ID: '42' };
    expect(await sendBriefing(PAYLOAD, env)).toBe('telegram');
    const [url, init] = fn.mock.calls[0]!;
    expect(url).toBe('https://api.telegram.org/bottok/sendMessage');
    expect(url).toBe(telegramUrl('tok'));
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({ chat_id: '42', text: PAYLOAD.text });
  });

  it('none 은 아무 데도 보내지 않고 성공한다 (기본값)', async () => {
    const fn = okFetch();
    expect(await sendBriefing(PAYLOAD, { PUSH_CHANNEL: 'none' })).toBe('none');
    expect(await sendBriefing(PAYLOAD, {})).toBe('none');
    expect(fn).not.toHaveBeenCalled();
  });

  it('모르는 채널은 throw', () => {
    expect(() => resolveChannel({ PUSH_CHANNEL: 'mail' })).toThrow();
  });
});

describe('전송', () => {
  it('성공하면 후보마다 briefing 알림과 기록을 남긴다', async () => {
    okFetch();
    await saveLatest(dataDir, parseSalesCsv(sample, SALT).transactions);
    const b = (await buildBriefing(dataDir, ASOF))!;
    const env = { PUSH_CHANNEL: 'webhook', PUSH_WEBHOOK_URL: 'http://localhost:8798/push' };
    const rec = await deliverBriefing(dataDir, b, '2026-10-27T01:02:03.000Z', env);
    expect(rec).toEqual({ sentAt: '2026-10-27T01:02:03.000Z', asOf: ASOF, candidates: 2, returned: 0, channel: 'webhook' });
    const notices = await loadNotices(dataDir);
    expect(notices).toHaveLength(2);
    expect(notices.every((n) => n.source === 'briefing' && n.noticedOn === ASOF)).toBe(true);
    expect(notices.map((n) => n.cardLast2).sort()).toEqual(['07', '31']);

    await deliverBriefing(dataDir, b, '2026-10-27T05:00:00.000Z', env);
    expect((await listHistory(dataDir)).map((r) => r.sentAt)).toEqual(['2026-10-27T05:00:00.000Z', '2026-10-27T01:02:03.000Z']);
  });

  it('비 2xx 면 throw 하고 알림·기록을 남기지 않는다', async () => {
    okFetch(500);
    await saveLatest(dataDir, parseSalesCsv(sample, SALT).transactions);
    const b = (await buildBriefing(dataDir, ASOF))!;
    const env = { PUSH_CHANNEL: 'webhook', PUSH_WEBHOOK_URL: 'http://localhost:8798/push' };
    await expect(deliverBriefing(dataDir, b, '2026-10-27T01:02:03.000Z', env)).rejects.toThrow();
    expect(await loadNotices(dataDir)).toEqual([]);
    expect(await listHistory(dataDir)).toEqual([]);
  });

  it('POST /api/briefing/send 는 실패 시 502, 성공 시 200 과 기록', async () => {
    await saveLatest(dataDir, parseSalesCsv(sample, SALT).transactions);
    vi.stubEnv('PUSH_CHANNEL', 'webhook');
    vi.stubEnv('PUSH_WEBHOOK_URL', 'http://localhost:8798/push');
    try {
      vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed'); }));
      const fail = fakeCtx('POST', `/api/briefing/send?asOf=${ASOF}`);
      await fail.run();
      expect(fail.sent[0]).toEqual({ status: 502, body: { error: '브리핑을 보내지 못했습니다' } });
      expect(await loadNotices(dataDir)).toEqual([]);

      okFetch();
      const ok = fakeCtx('POST', `/api/briefing/send?asOf=${ASOF}`);
      await ok.run();
      expect(ok.sent[0]!.status).toBe(200);
      expect(ok.sent[0]!.body).toMatchObject({ ok: true, channel: 'webhook', candidates: 2, returned: 0 });

      const hist = fakeCtx('GET', '/api/briefing/history');
      await hist.run();
      expect(hist.sent[0]!.body).toHaveLength(1);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
