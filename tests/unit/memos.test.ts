import { mkdtemp, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { _resetAdjustersForTest, applyAdjusters, registerAdjuster } from '../../src/core/pipeline.ts';
import { parseSalesCsv } from '../../src/domain/csv.ts';
import type { ChurnCandidate } from '../../src/domain/types.ts';
import { feature } from '../../src/features/memos/index.ts';
import {
  type Memo,
  MSG_BAD_ACTION,
  MSG_PHONE,
  MSG_TOO_LONG,
  memoAdjustment,
  saveMemos,
  validateMemoInput,
} from '../../src/features/memos/logic.ts';

const SAVED = '2026-10-27T00:00:00.000Z';

function cand(delayRatio: number, last2 = '07'): ChurnCandidate {
  return {
    customerId: `c-${last2}`, cardLast2: last2, topItem: null,
    avgIntervalDays: 9, daysSinceLast: Math.round(delayRatio * 9), delayRatio, lastVisit: '2026-10-03',
  };
}

function memo(action: Memo['action'], note = '원래 가을엔 뜸한 분', last2 = '07'): Memo {
  return { customerId: `c-${last2}`, cardLast2: last2, note, action, savedAt: SAVED };
}

describe('memoAdjustment', () => {
  it('exclude 면 보류한다', () => {
    expect(memoAdjustment(memo('exclude'), cand(2.9, '31'))).toEqual({
      source: 'memos', note: '메모: 원래 가을엔 뜸한 분', hold: true,
    });
  });

  it('tolerate 2.7배는 기준 3배 문구로 보류한다', () => {
    expect(memoAdjustment(memo('tolerate'), cand(2.7))).toEqual({
      source: 'memos', note: '메모: 기준 3배 적용 (2.7배)', hold: true,
    });
  });

  it('tolerate 3.2배는 보류하지 않는다', () => {
    expect(memoAdjustment(memo('tolerate'), cand(3.2))).toBeNull();
  });

  it('tolerate 3.0배 경계는 보류하지 않는다', () => {
    expect(memoAdjustment(memo('tolerate'), cand(3.0))).toBeNull();
  });

  it('none 이면 아무것도 하지 않는다', () => {
    expect(memoAdjustment(memo('none'), cand(2.7))).toBeNull();
  });

  it('메모가 없으면 null', () => {
    expect(memoAdjustment(undefined, cand(2.7))).toBeNull();
  });
});

describe('validateMemoInput', () => {
  const base = { customerId: 'c-31', cardLast2: '31', action: 'none' };

  it('전화번호 형태는 거부하고 38일째 같은 숫자는 허용한다', () => {
    expect(validateMemoInput({ ...base, note: '010-1234-5678' }, SAVED)).toEqual({ ok: false, error: MSG_PHONE });
    expect(validateMemoInput({ ...base, note: '010 1234 5678 연락' }, SAVED)).toEqual({ ok: false, error: MSG_PHONE });
    const ok = validateMemoInput({ ...base, note: '38일째 안 오심' }, SAVED);
    expect(ok).toEqual({ ok: true, memo: { ...base, note: '38일째 안 오심', savedAt: SAVED } });
  });

  it('80자 초과는 거부하고 80자는 허용한다', () => {
    expect(validateMemoInput({ ...base, note: '가'.repeat(81) }, SAVED)).toEqual({ ok: false, error: MSG_TOO_LONG });
    expect(validateMemoInput({ ...base, note: '가'.repeat(80) }, SAVED).ok).toBe(true);
  });

  it('모르는 메모 종류는 거부한다', () => {
    expect(validateMemoInput({ ...base, note: '메모', action: 'skip' }, SAVED)).toEqual({ ok: false, error: MSG_BAD_ACTION });
  });
});

describe('memos adjuster (pipeline)', () => {
  const sample = readFileSync(new URL('../fixtures/sales-sample.csv', import.meta.url), 'utf8');
  const { transactions } = parseSalesCsv(sample, 'test-salt');
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'memos-'));
    _resetAdjustersForTest();
    for (const a of feature.adjusters) registerAdjuster(a);
  });
  afterEach(async () => {
    _resetAdjustersForTest();
    await rm(dir, { recursive: true, force: true });
  });

  it('A exclude 면 A 는 보류, B 만 남는다', async () => {
    const before = await applyAdjusters(transactions, dir, '2026-10-27');
    const a = before.candidates.find((c) => c.cardLast2 === '31');
    expect(a).toBeDefined();
    await saveMemos(dir, { [a!.customerId]: { customerId: a!.customerId, cardLast2: '31', note: '원래 가을엔 뜸한 분', action: 'exclude', savedAt: SAVED } });
    const after = await applyAdjusters(transactions, dir, '2026-10-27');
    expect(after.candidates.map((c) => c.cardLast2)).toEqual(['07']);
    expect(after.heldBack.map((c) => c.cardLast2)).toEqual(['31']);
    expect(after.heldBack[0].adjustments[0].note).toBe('메모: 원래 가을엔 뜸한 분');
  });

  it('B tolerate 면 기준 3배 적용 (2.7배) 로 보류', async () => {
    const before = await applyAdjusters(transactions, dir, '2026-10-27');
    const b = before.candidates.find((c) => c.cardLast2 === '07');
    expect(b).toBeDefined();
    await saveMemos(dir, { [b!.customerId]: { customerId: b!.customerId, cardLast2: '07', note: '', action: 'tolerate', savedAt: SAVED } });
    const after = await applyAdjusters(transactions, dir, '2026-10-27');
    expect(after.heldBack.map((c) => c.adjustments[0].note)).toEqual(['메모: 기준 3배 적용 (2.7배)']);
  });
});
