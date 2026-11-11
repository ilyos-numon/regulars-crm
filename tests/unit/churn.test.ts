import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildCustomerStats, daysBetween, formatCandidateLine, scoreChurn } from '../../src/domain/churn.ts';
import { parseSalesCsv } from '../../src/domain/csv.ts';
import type { ChurnCandidate, Transaction } from '../../src/domain/types.ts';

const SALT = 'test-salt';
const sample = readFileSync(new URL('../fixtures/sales-sample.csv', import.meta.url), 'utf8');

function tx(customerId: string, date: string, item: string | null = '아메리카노', cardLast2 = '00'): Transaction {
  return { customerId, cardLast2, date, time: '10:00', amount: 5000, item };
}

function visits(customerId: string, dates: string[], cardLast2 = '00'): Transaction[] {
  return dates.map((d) => tx(customerId, d, '아메리카노', cardLast2));
}

describe('daysBetween', () => {
  it('counts whole days between UTC midnights', () => {
    expect(daysBetween('2026-09-19', '2026-10-27')).toBe(38);
    expect(daysBetween('2026-10-27', '2026-10-27')).toBe(0);
  });
});

describe('scoreChurn — sample CSV', () => {
  const { transactions } = parseSalesCsv(sample, SALT);
  const report = scoreChurn(transactions, '2026-10-27');

  it('reports totals: 24 transactions, 5 customers, 3 regulars', () => {
    expect(report.asOf).toBe('2026-10-27');
    expect(report.transactions).toBe(24);
    expect(report.customers).toBe(5);
    expect(report.regulars).toBe(3);
  });

  it('selects A then B with expected values', () => {
    const picked = report.candidates.map((c) => ({
      cardLast2: c.cardLast2,
      topItem: c.topItem,
      avgIntervalDays: c.avgIntervalDays,
      daysSinceLast: c.daysSinceLast,
      delayRatio: c.delayRatio,
      lastVisit: c.lastVisit,
    }));
    expect(picked).toEqual([
      { cardLast2: '31', topItem: '아메리카노', avgIntervalDays: 13, daysSinceLast: 38, delayRatio: 2.9, lastVisit: '2026-09-19' },
      { cardLast2: '07', topItem: '라떼', avgIntervalDays: 9, daysSinceLast: 24, delayRatio: 2.7, lastVisit: '2026-10-03' },
    ]);
  });
});

describe('buildCustomerStats', () => {
  it('counts two transactions on the same day as one visit', () => {
    const stats = buildCustomerStats([
      ...visits('c1', ['2026-10-01', '2026-10-08']),
      tx('c1', '2026-10-08'),
    ]);
    expect(stats).toHaveLength(1);
    expect(stats[0].visitDays).toEqual(['2026-10-01', '2026-10-08']);
    expect(stats[0].avgIntervalDays).toBe(7);
    expect(stats[0].lastVisit).toBe('2026-10-08');
  });

  it('picks the most bought item, ties broken by string order, null when no items', () => {
    const stats = buildCustomerStats([
      tx('a', '2026-10-01', '라떼'),
      tx('a', '2026-10-02', '녹차'),
      tx('b', '2026-10-01', null),
    ]);
    const byId = Object.fromEntries(stats.map((s) => [s.customerId, s]));
    expect(byId.a.topItem).toBe('녹차');
    expect(byId.b.topItem).toBeNull();
    expect(byId.b.avgIntervalDays).toBeNull();
  });
});

describe('scoreChurn — rules', () => {
  it('does not treat a customer with only 2 visits as regular', () => {
    const report = scoreChurn(visits('two', ['2026-09-01', '2026-09-05']), '2026-10-27');
    expect(report.regulars).toBe(0);
    expect(report.candidates).toEqual([]);
  });

  it('does not select a regular who visited recently', () => {
    const report = scoreChurn(visits('recent', ['2026-10-06', '2026-10-13', '2026-10-20']), '2026-10-27');
    expect(report.regulars).toBe(1);
    expect(report.candidates).toEqual([]);
  });

  it('returns at most 5 of 7 qualified, sorted by days since last visit desc', () => {
    const tx7: Transaction[] = [];
    for (let i = 0; i < 7; i++) {
      // 7-day interval, last visit i days earlier for each customer → all ratio >= 2
      const last = new Date(Date.UTC(2026, 9, 10 - i));
      const dates = [14, 7, 0].map((back) => new Date(last.getTime() - back * 86_400_000).toISOString().slice(0, 10));
      tx7.push(...visits(`c${i}`, dates, String(10 + i)));
    }
    const report = scoreChurn(tx7, '2026-10-27');
    expect(report.regulars).toBe(7);
    expect(report.candidates).toHaveLength(5);
    expect(report.candidates.map((c) => c.customerId)).toEqual(['c6', 'c5', 'c4', 'c3', 'c2']);
    const days = report.candidates.map((c) => c.daysSinceLast);
    expect(days).toEqual([...days].sort((a, b) => b - a));
  });

  it('breaks ties by delayRatio desc then customerId asc', () => {
    const report = scoreChurn(
      [
        ...visits('z', ['2026-09-01', '2026-09-08', '2026-09-15']), // interval 7
        ...visits('y', ['2026-09-05', '2026-09-10', '2026-09-15']), // interval 5
        ...visits('x', ['2026-09-01', '2026-09-08', '2026-09-15']), // interval 7
      ],
      '2026-10-27',
    );
    expect(report.candidates.map((c) => c.customerId)).toEqual(['y', 'x', 'z']);
  });
});

describe('formatCandidateLine', () => {
  const base: ChurnCandidate = {
    customerId: 'x', cardLast2: '31', topItem: '아메리카노',
    avgIntervalDays: 13, daysSinceLast: 38, delayRatio: 2.9, lastVisit: '2026-09-19',
  };

  it('formats a line with item', () => {
    expect(formatCandidateLine(base)).toBe('카드 ··31 · 아메리카노 — 평소 13일마다 → 38일째 (2.9배)');
  });

  it('omits item when topItem is null and prints decimals as-is', () => {
    expect(formatCandidateLine({ ...base, topItem: null, avgIntervalDays: 12.5 })).toBe(
      '카드 ··31 — 평소 12.5일마다 → 38일째 (2.9배)',
    );
  });
});
