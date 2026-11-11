import { readJsonFile, writeJsonFile } from '../../core/json-store.ts';
import type { Route, RouteContext } from '../../domain/types.ts';
import { loadLatest } from '../../store.ts';
import { buildImpacts, parseReviewsCsv, REVIEWS_FILE, ReviewCsvError, summarize, type Review } from './logic.ts';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_BYTES = 1024 * 1024;
const MSG_BAD_ASOF = 'asOf 는 YYYY-MM-DD 형식이어야 합니다';
const MSG_NO_UPLOAD = '아직 업로드된 매출이 없습니다';
const MSG_TOO_LARGE = '파일이 너무 큽니다(최대 1MB)';
const MSG_NO_ROWS = '리뷰 행이 없습니다';

function isDate(v: string): boolean {
  if (!DATE_RE.test(v)) return false;
  const [y, m, d] = v.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

function readAsOf(ctx: RouteContext): string | null {
  const p = ctx.url.searchParams.get('asOf');
  if (p === null || p === '') return ctx.today();
  if (!isDate(p)) {
    ctx.sendJson(400, { error: MSG_BAD_ASOF });
    return null;
  }
  return p;
}

export const routes: Route[] = [
  {
    method: 'POST',
    path: '/api/reviews/import',
    async handle(ctx) {
      const text = await ctx.readText(MAX_BYTES);
      if (text === null) {
        ctx.sendJson(413, { error: MSG_TOO_LARGE });
        return;
      }
      if (text.trim() === '') {
        ctx.sendJson(400, { error: MSG_NO_ROWS });
        return;
      }
      let reviews: Review[];
      try {
        reviews = parseReviewsCsv(text);
      } catch (err) {
        if (err instanceof ReviewCsvError) {
          ctx.sendJson(400, { error: err.message });
          return;
        }
        ctx.sendJson(400, { error: MSG_NO_ROWS });
        return;
      }
      await writeJsonFile(ctx.dataDir, REVIEWS_FILE, reviews);
      ctx.sendJson(200, summarize(reviews));
    },
  },
  {
    method: 'GET',
    path: '/api/reviews',
    async handle(ctx) {
      const asOf = readAsOf(ctx);
      if (asOf === null) return;
      const tx = await loadLatest(ctx.dataDir);
      if (tx === null) {
        ctx.sendJson(404, { error: MSG_NO_UPLOAD });
        return;
      }
      const reviews = await readJsonFile<Review[]>(ctx.dataDir, REVIEWS_FILE, []);
      const impacts = await buildImpacts(reviews, tx, asOf, process.env);
      ctx.sendJson(200, { summary: summarize(reviews).summary, reviews, impacts });
    },
  },
];
