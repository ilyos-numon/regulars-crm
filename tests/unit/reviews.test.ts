import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseSalesCsv } from '../../src/domain/csv.ts';
import type { RouteContext } from '../../src/domain/types.ts';
import { routes } from '../../src/features/reviews/routes.ts';
import {
  compareAround, makeReply, parseReviewsCsv, scrubReviewText, summarize, templateReply,
} from '../../src/features/reviews/logic.ts';
import { saveLatest } from '../../src/store.ts';

const SALT = 'unit-salt';
const ASOF = '2026-10-27';
const sales = readFileSync(new URL('../fixtures/sales-sample.csv', import.meta.url), 'utf8');
const reviewsCsv = readFileSync(new URL('../fixtures/reviews-sample.csv', import.meta.url), 'utf8');
const { transactions } = parseSalesCsv(sales, SALT);
const KEY_ENV = { LLM_API_KEY: 'test-key', LLM_BASE_URL: 'http://localhost:9/v1', LLM_MODEL: 'm' };
const LOW_REVIEW = { date: '2026-09-20', rating: 2, text: '커피가 식어서 나왔어요' };
const REPLY = '소중한 의견 감사합니다. 말씀해 주신 점("커피가 식어서 나왔어요") 바로 살펴보고 고치겠습니다. 불편을 드려 죄송합니다. 다음에 오시면 더 신경 쓰겠습니다.';

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

describe('reviews parsing', () => {
  it('summarizes the sample', () => {
    const reviews = parseReviewsCsv(reviewsCsv);
    expect(reviews).toHaveLength(3);
    expect(summarize(reviews)).toEqual({
      count: 3, avgRating: 3.7, low: 1, summary: '리뷰 3건 · 평균 별점 3.7 · 낮은 별점 1건',
    });
  });

  it('accepts BOM, any column order and dotted/slashed dates', () => {
    const reviews = parseReviewsCsv('﻿내용,별점,작성일\n좋아요,5,2026.09.01\n별로예요,1,2026/09/02\n');
    expect(reviews).toEqual([
      { date: '2026-09-01', rating: 5, text: '좋아요' },
      { date: '2026-09-02', rating: 1, text: '별로예요' },
    ]);
  });

  it('skips rows whose rating is not an integer 1..5', () => {
    const reviews = parseReviewsCsv('작성일,별점,내용\n2026-09-01,0,a\n2026-09-02,6,b\n2026-09-03,3.5,c\n2026-09-04,x,d\n2026-09-05,3,e\n2026-13-01,4,f\n');
    expect(reviews).toEqual([{ date: '2026-09-05', rating: 3, text: 'e' }]);
    expect(() => parseReviewsCsv('작성일,별점,내용\n2026-09-01,9,a\n')).toThrow('리뷰 행이 없습니다');
  });
});

describe('low rating impact', () => {
  it('compares regular visits around 2026-09-20', () => {
    expect(compareAround(transactions, '2026-09-20', ASOF)).toEqual({
      before: 4, after: 4, line: '2026-09-20 낮은 별점 전후 단골 방문 4번 → 4번 (변화 없음)',
    });
  });
});

describe('reply drafts', () => {
  it('uses the exact template without a key and does not call out', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(templateReply(LOW_REVIEW.text)).toBe(REPLY);
    expect(await makeReply(LOW_REVIEW, {})).toEqual({ reply: REPLY, replySource: '기본 문구' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(templateReply('가나다라마바사아자차카타파하가나다라마바사아')).toContain('("가나다라마바사아자차카타파하가나다라마바")');
  });

  it('replaces a model answer with a banned word by the template', async () => {
    mockModel('불편을 드려 죄송합니다. 다음 방문 때 쿠폰 드릴게요.');
    expect(await makeReply(LOW_REVIEW, KEY_ENV)).toEqual({ reply: REPLY, replySource: '기본 문구' });
  });

  it('uses a clean model answer and strips phone-like numbers before sending', async () => {
    const fetchMock = mockModel('불편을 드려 죄송합니다. 바로 고치겠습니다.');
    const res = await makeReply({ ...LOW_REVIEW, text: '가나다씨 010-1234-5678 커피가 식었어요' }, KEY_ENV);
    expect(res).toEqual({ reply: '불편을 드려 죄송합니다. 바로 고치겠습니다.', replySource: 'AI 문구' });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const raw = init.body as string;
    expect(raw).not.toContain('5678');
    expect(raw).not.toContain('가나다');
    expect(scrubReviewText('사장님 01012345678 친절')).toBe('사장님 친절');
  });
});

describe('reviews routes', () => {
  let dataDir: string;
  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'reviews-'));
    vi.stubEnv('LLM_API_KEY', '');
  });
  afterEach(() => rmSync(dataDir, { recursive: true, force: true }));

  function call(method: string, path: string, query = '', body: string | null = null) {
    const route = routes.find((r) => r.method === method && r.path === path)!;
    const out: { status: number; body: unknown } = { status: 0, body: null };
    const ctx: RouteContext = {
      dataDir, salt: SALT, allowReset: false, today: () => ASOF,
      url: new URL(`http://localhost${path}${query}`),
      readText: async () => body, readJson: async () => null,
      sendJson: (status, b) => { out.status = status; out.body = b; },
    };
    return route.handle(ctx, {}).then(() => out);
  }

  it('returns 400 when the 별점 column is missing or no rows remain', async () => {
    expect(await call('POST', '/api/reviews/import', '', '작성일,내용\n2026-09-20,별로\n')).toEqual({
      status: 400, body: { error: '필수 열이 없습니다: 별점' },
    });
    expect(await call('POST', '/api/reviews/import', '', '작성일,별점,내용\n')).toEqual({
      status: 400, body: { error: '리뷰 행이 없습니다' },
    });
  });

  it('imports the sample and lists impacts with template replies', async () => {
    expect(await call('POST', '/api/reviews/import', '', reviewsCsv)).toEqual({
      status: 200, body: { count: 3, avgRating: 3.7, low: 1, summary: '리뷰 3건 · 평균 별점 3.7 · 낮은 별점 1건' },
    });
    expect((await call('GET', '/api/reviews', '?asOf=2026-10-27')).status).toBe(404);
    await saveLatest(dataDir, transactions);
    expect(await call('GET', '/api/reviews', '?asOf=2026/10/27')).toEqual({
      status: 400, body: { error: 'asOf 는 YYYY-MM-DD 형식이어야 합니다' },
    });
    const res = await call('GET', '/api/reviews', '?asOf=2026-10-27');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      summary: '리뷰 3건 · 평균 별점 3.7 · 낮은 별점 1건',
      reviews: parseReviewsCsv(reviewsCsv),
      impacts: [{
        date: '2026-09-20', rating: 2, text: '커피가 식어서 나왔어요', before: 4, after: 4,
        line: '2026-09-20 낮은 별점 전후 단골 방문 4번 → 4번 (변화 없음)',
        reply: REPLY, replySource: '기본 문구',
      }],
    });
  });
});
