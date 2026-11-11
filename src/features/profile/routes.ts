import { readJsonFile } from '../../core/json-store.ts';
import type { Route, Transaction } from '../../domain/types.ts';
import { buildProfile } from './logic.ts';

interface LatestFile { transactions?: Transaction[]; }

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MSG_BAD_ASOF = 'asOf 는 YYYY-MM-DD 형식이어야 합니다';
const MSG_NO_UPLOAD = '아직 업로드된 매출이 없습니다';
const MSG_NO_CUSTOMER = '그런 손님이 없습니다';

export const routes: Route[] = [
  {
    method: 'GET',
    path: '/api/profile/:id',
    async handle(ctx, params) {
      const asOf = ctx.url.searchParams.get('asOf');
      if (asOf !== null && asOf !== '' && !DATE_RE.test(asOf)) {
        ctx.sendJson(400, { error: MSG_BAD_ASOF });
        return;
      }
      const latest = await readJsonFile<LatestFile | null>(ctx.dataDir, 'latest.json', null);
      const tx = latest?.transactions ?? null;
      if (tx === null) {
        ctx.sendJson(404, { error: MSG_NO_UPLOAD });
        return;
      }
      const profile = buildProfile(tx, params.id ?? '');
      if (profile === null) {
        ctx.sendJson(404, { error: MSG_NO_CUSTOMER });
        return;
      }
      ctx.sendJson(200, profile);
    },
  },
];
