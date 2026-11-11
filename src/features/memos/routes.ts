import type { Route } from '../../domain/types.ts';
import { loadMemos, saveMemos, validateMemoInput } from './logic.ts';

const MAX_MEMO_BYTES = 4096;

export const routes: Route[] = [
  {
    method: 'GET',
    path: '/api/memos',
    async handle(ctx) {
      const store = await loadMemos(ctx.dataDir);
      ctx.sendJson(200, Object.values(store));
    },
  },
  {
    method: 'POST',
    path: '/api/memos',
    async handle(ctx) {
      const body = await ctx.readJson<unknown>(MAX_MEMO_BYTES);
      const result = validateMemoInput(body, new Date().toISOString());
      if (!result.ok) {
        ctx.sendJson(400, { error: result.error });
        return;
      }
      const store = await loadMemos(ctx.dataDir);
      store[result.memo.customerId] = result.memo;
      await saveMemos(ctx.dataDir, store);
      ctx.sendJson(200, result.memo);
    },
  },
  {
    method: 'DELETE',
    path: '/api/memos/:id',
    async handle(ctx, params) {
      const store = await loadMemos(ctx.dataDir);
      const id = params.id ?? '';
      if (Object.prototype.hasOwnProperty.call(store, id)) {
        delete store[id];
        await saveMemos(ctx.dataDir, store);
      }
      ctx.sendJson(200, { ok: true });
    },
  },
];
