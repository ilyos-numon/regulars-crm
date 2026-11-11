import { readJsonFile, writeJsonFile } from '../../core/json-store.ts';
import type { Adjuster, AdjusterFn, Adjustment, ChurnCandidate } from '../../domain/types.ts';

export type MemoAction = 'none' | 'exclude' | 'tolerate';
export interface Memo { customerId: string; cardLast2: string; note: string; action: MemoAction; savedAt: string; }
export type MemoStore = Record<string, Memo>;

export const MEMOS_FILE = 'memos.json';
export const MAX_NOTE_CHARS = 80;
export const TOLERATE_RATIO = 3.0;

export const MSG_TOO_LONG = '메모는 80자까지입니다';
export const MSG_PHONE = '전화번호로 보이는 숫자는 저장할 수 없습니다';
export const MSG_BAD_ACTION = '메모 종류가 잘못되었습니다';
export const MSG_BAD_MEMO = '메모 형식이 잘못되었습니다';

const ACTIONS: readonly MemoAction[] = ['none', 'exclude', 'tolerate'];

export function looksLikePhone(note: string): boolean {
  return /\d{8,}/.test(note.replace(/[-\s]/g, ''));
}

// 성공 시 저장할 메모, 실패 시 오류 문구.
export function validateMemoInput(
  body: unknown,
  savedAt: string,
): { ok: true; memo: Memo } | { ok: false; error: string } {
  if (body === null || typeof body !== 'object') return { ok: false, error: MSG_BAD_MEMO };
  const b = body as Record<string, unknown>;
  const { customerId, cardLast2, note, action } = b;
  if (typeof customerId !== 'string' || customerId === '') return { ok: false, error: MSG_BAD_MEMO };
  if (typeof cardLast2 !== 'string' || !/^\d{2}$/.test(cardLast2)) return { ok: false, error: MSG_BAD_MEMO };
  if (typeof note !== 'string') return { ok: false, error: MSG_BAD_MEMO };
  const trimmed = note.trim();
  if ([...trimmed].length > MAX_NOTE_CHARS) return { ok: false, error: MSG_TOO_LONG };
  if (looksLikePhone(trimmed)) return { ok: false, error: MSG_PHONE };
  if (typeof action !== 'string' || !ACTIONS.includes(action as MemoAction)) {
    return { ok: false, error: MSG_BAD_ACTION };
  }
  return { ok: true, memo: { customerId, cardLast2, note: trimmed, action: action as MemoAction, savedAt } };
}

export function memoAdjustment(memo: Memo | undefined, c: ChurnCandidate): Adjustment | null {
  if (!memo) return null;
  if (memo.action === 'exclude') return { source: 'memos', note: `메모: ${memo.note}`, hold: true };
  if (memo.action === 'tolerate') {
    if (c.delayRatio >= TOLERATE_RATIO) return null;
    return { source: 'memos', note: `메모: 기준 3배 적용 (${c.delayRatio.toFixed(1)}배)`, hold: true };
  }
  return null;
}

export async function loadMemos(dataDir: string): Promise<MemoStore> {
  const raw = await readJsonFile<unknown>(dataDir, MEMOS_FILE, {});
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return raw as MemoStore;
}

export async function saveMemos(dataDir: string, store: MemoStore): Promise<void> {
  await writeJsonFile(dataDir, MEMOS_FILE, store);
}

export const memosAdjuster: Adjuster = {
  id: 'memos',
  async prepare(ctx): Promise<AdjusterFn> {
    const store = await loadMemos(ctx.dataDir);
    return (c) => memoAdjustment(Object.prototype.hasOwnProperty.call(store, c.customerId) ? store[c.customerId] : undefined, c);
  },
};
