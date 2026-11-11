import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildCustomerStats } from '../../src/domain/churn.ts';
import { parseSalesCsv } from '../../src/domain/csv.ts';
import type { RouteContext } from '../../src/domain/types.ts';
import { draftRoute } from '../../src/features/draft/routes.ts';
import { buildDraftInput, composeDrafts, makeDrafts, templateText, type DraftInput } from '../../src/features/draft/logic.ts';
import { saveLatest } from '../../src/store.ts';

const SALT = 'unit-salt';
const ASOF = '2026-10-27';
const sample = readFileSync(new URL('../fixtures/sales-sample.csv', import.meta.url), 'utf8');
const { transactions } = parseSalesCsv(sample, SALT);
const statsA = buildCustomerStats(transactions).find((s) => s.cardLast2 === '31')!;
const inputA: DraftInput = buildDraftInput(statsA, ASOF, '테스트 카페');
const KEY_ENV = { LLM_API_KEY: 'test-key', LLM_BASE_URL: 'http://localhost:9/v1', LLM_MODEL: 'm' };

const A_POLITE = '안녕하세요. 평소 아메리카노 자주 찾아 주셨는데 38일째 뵙지 못해 안부 여쭙니다. 별일 없으시죠? 언제든 편하게 들러 주세요.';
const A_FRIENDLY = '요즘 통 안 보이셔서 궁금했어요! 아메리카노 생각나실 때 편하게 들러 주세요. 늘 그 자리에 있을게요.';
const A_SHORT = '잘 지내시죠? 아메리카노 준비해 두고 기다리고 있을게요.';

function mockModel(content: string) {
  const fetchMock = vi.fn(async () =>
    new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('draft templates', () => {
  it('matches the three exact sentences for customer A', async () => {
    expect(inputA.daysSinceLast).toBe(38);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const set = await makeDrafts(inputA, {});
    expect(fetchMock).not.toHaveBeenCalled();
    expect(set).toEqual({
      source: '기본 문구',
      drafts: [
        { tone: '정중한', text: A_POLITE },
        { tone: '친근한', text: A_FRIENDLY },
        { tone: '짧은', text: A_SHORT },
      ],
    });
  });

  it('uses the fallback item word when topItem is null', () => {
    expect(templateText('짧은', null, 10)).toBe('잘 지내시죠? 자주 드시던 메뉴 준비해 두고 기다리고 있을게요.');
    const set = composeDrafts({ ...inputA, topItem: null }, null);
    expect(set.drafts[0].text).toBe(
      '안녕하세요. 평소 자주 드시던 메뉴 자주 찾아 주셨는데 38일째 뵙지 못해 안부 여쭙니다. 별일 없으시죠? 언제든 편하게 들러 주세요.',
    );
    expect(set.drafts[1].text).toContain('자주 드시던 메뉴 생각나실 때');
  });
});

describe('draft from model', () => {
  it('uses three model sentences and marks AI 문구', async () => {
    mockModel('["오랜만이에요, 잘 지내시죠?", "아메리카노 생각나면 들러 주세요!", "기다릴게요."]');
    const set = await makeDrafts(inputA, KEY_ENV);
    expect(set.source).toBe('AI 문구');
    expect(set.drafts.map((d) => d.tone)).toEqual(['정중한', '친근한', '짧은']);
    expect(set.drafts.map((d) => d.text)).toEqual(['오랜만이에요, 잘 지내시죠?', '아메리카노 생각나면 들러 주세요!', '기다릴게요.']);
  });

  it('replaces a tone containing a banned word with the template', async () => {
    mockModel('["오랜만이에요, 잘 지내시죠?", "쿠폰 드릴 테니 들러 주세요!", "기다릴게요."]');
    const set = await makeDrafts(inputA, KEY_ENV);
    expect(set.source).toBe('기본 문구');
    expect(set.drafts[0].text).toBe('오랜만이에요, 잘 지내시죠?');
    expect(set.drafts[1].text).toBe(A_FRIENDLY);
    expect(set.drafts[2].text).toBe('기다릴게요.');
  });

  it('falls back to templates when the answer is not a JSON array of three', async () => {
    mockModel('안녕하세요, 오랜만입니다.');
    expect((await makeDrafts(inputA, KEY_ENV)).drafts.map((d) => d.text)).toEqual([A_POLITE, A_FRIENDLY, A_SHORT]);
    mockModel('["하나", "둘"]');
    const set = await makeDrafts(inputA, KEY_ENV);
    expect(set.source).toBe('기본 문구');
    expect(set.drafts.map((d) => d.text)).toEqual([A_POLITE, A_FRIENDLY, A_SHORT]);
  });

  it('falls back to templates when the call fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('x', { status: 500 })));
    const set = await makeDrafts(inputA, KEY_ENV);
    expect(set.source).toBe('기본 문구');
    expect(set.drafts[0].text).toBe(A_POLITE);
  });

  it('sends only the five allowed fields, never the customer id or raw card', async () => {
    const fetchMock = mockModel('["a", "b", "c"]');
    await makeDrafts(inputA, KEY_ENV);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const raw = init.body as string;
    expect(raw).not.toContain(statsA.customerId);
    expect(raw).not.toContain('7831');
    expect(raw).not.toContain('1234-56');
    const body = JSON.parse(raw);
    const user = JSON.parse(body.messages[1].content);
    expect(Object.keys(user).sort()).toEqual(['avgIntervalDays', 'cardLast2', 'daysSinceLast', 'storeName', 'topItem']);
    expect(user).toEqual({ cardLast2: '31', topItem: '아메리카노', avgIntervalDays: 13, daysSinceLast: 38, storeName: '테스트 카페' });
    const system: string = body.messages[0].content;
    for (const w of ['쿠폰', '할인', '이벤트', '증정', '적립', '무료', '세일', '특가', '존댓말', '60자', 'JSON 배열 3개']) {
      expect(system).toContain(w);
    }
  });
});

describe('GET /api/draft/:id', () => {
  let dataDir: string;
  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'draft-'));
    vi.stubEnv('LLM_API_KEY', '');
  });
  afterEach(() => rmSync(dataDir, { recursive: true, force: true }));

  function call(id: string, query = '') {
    const out: { status: number; body: unknown } = { status: 0, body: null };
    const ctx: RouteContext = {
      dataDir, salt: SALT, allowReset: false, today: () => ASOF,
      url: new URL(`http://localhost/api/draft/${id}${query}`),
      readText: async () => null, readJson: async () => null,
      sendJson: (status, body) => { out.status = status; out.body = body; },
    };
    return draftRoute.handle(ctx, { id }).then(() => out);
  }

  it('returns 404 before upload and for an unknown customer, 400 for bad asOf', async () => {
    expect(await call('x')).toEqual({ status: 404, body: { error: '아직 업로드된 매출이 없습니다' } });
    await saveLatest(dataDir, transactions);
    expect(await call('x')).toEqual({ status: 404, body: { error: '그런 손님이 없습니다' } });
    expect(await call(statsA.customerId, '?asOf=2026/10/27')).toEqual({
      status: 400, body: { error: 'asOf 는 YYYY-MM-DD 형식이어야 합니다' },
    });
  });

  it('returns template drafts for A without a key and writes no new files', async () => {
    await saveLatest(dataDir, transactions);
    const res = await call(statsA.customerId, `?asOf=${ASOF}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      customerId: statsA.customerId,
      cardLast2: '31',
      source: '기본 문구',
      drafts: [
        { tone: '정중한', text: A_POLITE },
        { tone: '친근한', text: A_FRIENDLY },
        { tone: '짧은', text: A_SHORT },
      ],
    });
    expect(readdirSync(dataDir)).toEqual(['latest.json']);
  });
});
