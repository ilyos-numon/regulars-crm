import type { Route, RouteContext, Transaction } from '../../domain/types.ts';
import { loadLatest } from '../../store.ts';
import { changeHint, personalHint, storeHint } from './logic.ts';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MSG_BAD_ASOF = 'asOf 는 YYYY-MM-DD 형식이어야 합니다';
const MSG_BAD_DATE = '날짜는 YYYY-MM-DD 형식이어야 합니다';
const MSG_NO_UPLOAD = '아직 업로드된 매출이 없습니다';
const MSG_NO_CUSTOMER = '그런 손님이 없습니다';

function isDate(v: string): boolean {
  if (!DATE_RE.test(v)) return false;
  const [y, m, d] = v.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

// 기준일을 읽는다. 형식 오류면 400 을 보내고 null.
function readAsOf(ctx: RouteContext): string | null {
  const p = ctx.url.searchParams.get('asOf');
  if (p === null || p === '') return ctx.today();
  if (!isDate(p)) {
    ctx.sendJson(400, { error: MSG_BAD_ASOF });
    return null;
  }
  return p;
}

async function readTx(ctx: RouteContext): Promise<Transaction[] | null> {
  const tx = await loadLatest(ctx.dataDir);
  if (tx === null) ctx.sendJson(404, { error: MSG_NO_UPLOAD });
  return tx;
}

// 정확 일치 경로(store, change)를 ':id' 보다 먼저 둔다.
export const routes: Route[] = [
  {
    method: 'GET',
    path: '/api/hint/store',
    async handle(ctx) {
      const asOf = readAsOf(ctx);
      if (asOf === null) return;
      const tx = await readTx(ctx);
      if (tx === null) return;
      ctx.sendJson(200, storeHint(tx, asOf));
    },
  },
  {
    method: 'GET',
    path: '/api/hint/change',
    async handle(ctx) {
      const asOf = readAsOf(ctx);
      if (asOf === null) return;
      const date = ctx.url.searchParams.get('date') ?? '';
      if (!isDate(date)) {
        ctx.sendJson(400, { error: MSG_BAD_DATE });
        return;
      }
      const tx = await readTx(ctx);
      if (tx === null) return;
      ctx.sendJson(200, changeHint(tx, date, asOf));
    },
  },
  {
    method: 'GET',
    path: '/api/hint/:id',
    async handle(ctx, params) {
      const asOf = readAsOf(ctx);
      if (asOf === null) return;
      const tx = await readTx(ctx);
      if (tx === null) return;
      const hint = personalHint(tx, params.id, asOf);
      if (hint === null) {
        ctx.sendJson(404, { error: MSG_NO_CUSTOMER });
        return;
      }
      ctx.sendJson(200, hint);
    },
  },
];
