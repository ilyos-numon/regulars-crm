import { buildCustomerStats } from '../../domain/churn.ts';
import type { Route } from '../../domain/types.ts';
import { loadLatest } from '../../store.ts';
import { buildDraftInput, DEFAULT_STORE_NAME, makeDrafts } from './logic.ts';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MSG_BAD_ASOF = 'asOf 는 YYYY-MM-DD 형식이어야 합니다';
const MSG_NO_UPLOAD = '아직 업로드된 매출이 없습니다';
const MSG_UNKNOWN = '그런 손님이 없습니다';

export const draftRoute: Route = {
  method: 'GET',
  path: '/api/draft/:id',
  async handle(ctx, params) {
    const asOfParam = ctx.url.searchParams.get('asOf');
    if (asOfParam !== null && asOfParam !== '' && !DATE_RE.test(asOfParam)) {
      ctx.sendJson(400, { error: MSG_BAD_ASOF });
      return;
    }
    const asOf = asOfParam ? asOfParam : ctx.today();
    const tx = await loadLatest(ctx.dataDir);
    if (tx === null) {
      ctx.sendJson(404, { error: MSG_NO_UPLOAD });
      return;
    }
    const id = params.id ?? '';
    const stats = buildCustomerStats(tx.filter((t) => t.customerId === id))[0];
    if (stats === undefined) {
      ctx.sendJson(404, { error: MSG_UNKNOWN });
      return;
    }
    const storeName = process.env.STORE_NAME || DEFAULT_STORE_NAME;
    const set = await makeDrafts(buildDraftInput(stats, asOf, storeName), process.env);
    ctx.sendJson(200, { customerId: stats.customerId, cardLast2: stats.cardLast2, source: set.source, drafts: set.drafts });
  },
};
