import type { Route, RouteContext } from '../../domain/types.ts';
import { buildBriefing, deliverBriefing, listHistory, MSG_SEND_FAILED } from './logic.ts';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MSG_BAD_ASOF = 'asOf 는 YYYY-MM-DD 형식이어야 합니다';
const MSG_NO_UPLOAD = '아직 업로드된 매출이 없습니다';

function readAsOf(ctx: RouteContext): string | null {
  const asOfParam = ctx.url.searchParams.get('asOf');
  if (asOfParam !== null && asOfParam !== '' && !DATE_RE.test(asOfParam)) {
    ctx.sendJson(400, { error: MSG_BAD_ASOF });
    return null;
  }
  return asOfParam ? asOfParam : ctx.today();
}

export const routes: Route[] = [
  {
    method: 'GET',
    path: '/api/briefing',
    async handle(ctx) {
      const asOf = readAsOf(ctx);
      if (asOf === null) return;
      const b = await buildBriefing(ctx.dataDir, asOf);
      if (b === null) {
        ctx.sendJson(404, { error: MSG_NO_UPLOAD });
        return;
      }
      ctx.sendJson(200, { asOf: b.asOf, text: b.text, candidates: b.candidates, returned: b.returned });
    },
  },
  {
    method: 'POST',
    path: '/api/briefing/send',
    async handle(ctx) {
      const asOf = readAsOf(ctx);
      if (asOf === null) return;
      const b = await buildBriefing(ctx.dataDir, asOf);
      if (b === null) {
        ctx.sendJson(404, { error: MSG_NO_UPLOAD });
        return;
      }
      let record;
      try {
        record = await deliverBriefing(ctx.dataDir, b, new Date().toISOString(), process.env);
      } catch {
        ctx.sendJson(502, { error: MSG_SEND_FAILED });
        return;
      }
      ctx.sendJson(200, {
        ok: true,
        sentAt: record.sentAt,
        channel: record.channel,
        candidates: record.candidates,
        returned: record.returned,
      });
    },
  },
  {
    method: 'GET',
    path: '/api/briefing/history',
    async handle(ctx) {
      ctx.sendJson(200, await listHistory(ctx.dataDir));
    },
  },
];
