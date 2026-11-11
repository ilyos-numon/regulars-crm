import { loadNotices } from '../../core/notices.ts';
import type { Route } from '../../domain/types.ts';
import { loadLatest } from '../../store.ts';
import { buildReturnsReport } from './logic.ts';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MSG_BAD_ASOF = 'asOf 는 YYYY-MM-DD 형식이어야 합니다';
const MSG_NO_UPLOAD = '아직 업로드된 매출이 없습니다';

export const routes: Route[] = [
  {
    method: 'GET',
    path: '/api/returns',
    async handle(ctx) {
      const asOfParam = ctx.url.searchParams.get('asOf');
      if (asOfParam !== null && asOfParam !== '' && !DATE_RE.test(asOfParam)) {
        ctx.sendJson(400, { error: MSG_BAD_ASOF });
        return;
      }
      const tx = await loadLatest(ctx.dataDir);
      if (tx === null) {
        ctx.sendJson(404, { error: MSG_NO_UPLOAD });
        return;
      }
      const asOf = asOfParam ? asOfParam : ctx.today();
      const notices = await loadNotices(ctx.dataDir);
      ctx.sendJson(200, buildReturnsReport(tx, notices, asOf));
    },
  },
];
