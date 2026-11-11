import { mkdtemp, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  _resetAdjustersForTest,
  applyAdjusters,
  listAdjusters,
  loadReport,
  registerAdjuster,
} from '../../src/core/pipeline.ts';
import { scoreChurn } from '../../src/domain/churn.ts';
import { parseSalesCsv } from '../../src/domain/csv.ts';
import type { AdjustContext, Adjuster, AdjusterFn, Transaction } from '../../src/domain/types.ts';
import { saveLatest } from '../../src/store.ts';

const SALT = 'test-salt';
const ASOF = '2026-10-27';
const sample = readFileSync(new URL('../fixtures/sales-sample.csv', import.meta.url), 'utf8');
const { transactions: sampleTx } = parseSalesCsv(sample, SALT);

function adjuster(id: Adjuster['id'], fn: AdjusterFn, seen?: AdjustContext[]): Adjuster {
  return {
    id,
    async prepare(ctx) {
      seen?.push(ctx);
      return fn;
    },
  };
}

// 6명: 모두 5일 간격 4번 방문 후 끊김. 마지막 방문일이 서로 달라 정렬이 정해진다.
function sixCandidates(): Transaction[] {
  const out: Transaction[] = [];
  const lastVisits = ['2026-09-01', '2026-09-03', '2026-09-05', '2026-09-07', '2026-09-09', '2026-09-11'];
  lastVisits.forEach((last, i) => {
    const id = `c${String(i)}`;
    const [y, m, d] = last.split('-').map(Number);
    for (let k = 3; k >= 0; k--) {
      const date = new Date(Date.UTC(y, m - 1, d - k * 5)).toISOString().slice(0, 10);
      out.push({ customerId: id, cardLast2: `0${String(i)}`, date, time: '09:00', amount: 4000, item: '라떼' });
    }
  });
  return out;
}

let dir: string;
beforeEach(async () => {
  _resetAdjustersForTest();
  dir = await mkdtemp(join(tmpdir(), 'core-pipeline-'));
});
afterEach(async () => {
  _resetAdjustersForTest();
  await rm(dir, { recursive: true, force: true });
});

describe('applyAdjusters', () => {
  it('without adjusters equals scoreChurn (sample: 2 candidates, heldBack 0)', async () => {
    const report = await applyAdjusters(sampleTx, dir, ASOF);
    const base = scoreChurn(sampleTx, ASOF);
    expect(report.candidates).toEqual(base.candidates.map((c) => ({ ...c, adjustments: [] })));
    expect(report.candidates.map((c) => c.cardLast2)).toEqual(['31', '07']);
    expect(report.heldBack).toEqual([]);
    expect(report).toMatchObject({ asOf: ASOF, transactions: 24, customers: 5, regulars: 3 });
  });

  it('holding 1 of 6 candidates leaves 5 candidates and 1 heldBack', async () => {
    const tx = sixCandidates();
    expect(scoreChurn(tx, ASOF, { limit: 20 }).candidates).toHaveLength(6);
    registerAdjuster(
      adjuster('weather', (c) => (c.customerId === 'c2' ? { source: 'weather', note: '보류', hold: true } : null)),
    );
    const report = await applyAdjusters(tx, dir, ASOF);
    expect(report.candidates.map((c) => c.customerId)).toEqual(['c0', 'c1', 'c3', 'c4', 'c5']);
    expect(report.heldBack.map((c) => c.customerId)).toEqual(['c2']);
    expect(report.heldBack[0].adjustments).toEqual([{ source: 'weather', note: '보류', hold: true }]);
  });

  it('applies limit to candidates only', async () => {
    const report = await applyAdjusters(sixCandidates(), dir, ASOF, { limit: 2 });
    expect(report.candidates.map((c) => c.customerId)).toEqual(['c0', 'c1']);
    expect(report.heldBack).toEqual([]);
  });

  it('collects notes from adjusters in registration order and passes context', async () => {
    const seen: AdjustContext[] = [];
    registerAdjuster(adjuster('weather', (c) => ({ source: 'weather', note: `w${c.cardLast2}`, hold: false }), seen));
    registerAdjuster(
      adjuster('memos', (c) => (c.cardLast2 === '07' ? { source: 'memos', note: '메모: 원래 뜸함', hold: true } : null)),
    );
    const report = await applyAdjusters(sampleTx, dir, ASOF);
    expect(report.candidates.map((c) => c.cardLast2)).toEqual(['31']);
    expect(report.candidates[0].adjustments).toEqual([{ source: 'weather', note: 'w31', hold: false }]);
    expect(report.heldBack[0].adjustments.map((a) => a.note)).toEqual(['w07', '메모: 원래 뜸함']);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ dataDir: dir, asOf: ASOF });
    expect(seen[0].stats).toHaveLength(5);
    expect(seen[0].transactions).toBe(sampleTx);
  });
});

describe('registerAdjuster', () => {
  it('throws on duplicate id', () => {
    registerAdjuster(adjuster('memos', () => null));
    expect(() => registerAdjuster(adjuster('memos', () => null))).toThrow();
    expect(listAdjusters().map((a) => a.id)).toEqual(['memos']);
  });
});

describe('loadReport', () => {
  it('returns null before upload and the adjusted report after', async () => {
    expect(await loadReport(dir, ASOF)).toBeNull();
    await saveLatest(dir, sampleTx);
    const report = await loadReport(dir, ASOF);
    expect(report?.candidates.map((c) => c.cardLast2)).toEqual(['31', '07']);
    expect(report?.heldBack).toEqual([]);
  });
});
