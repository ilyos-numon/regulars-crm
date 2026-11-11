import type { ChurnCandidate, ChurnReport, CustomerStats, ScoreOptions, Transaction } from './types.ts';

const DAY_MS = 86_400_000;

function utcMidnight(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function daysBetween(from: string, to: string): number {
  return Math.round((utcMidnight(to) - utcMidnight(from)) / DAY_MS);
}

function pickTopItem(counts: Map<string, number>): string | null {
  let best: string | null = null;
  let bestCount = 0;
  for (const [item, count] of counts) {
    if (count > bestCount || (count === bestCount && best !== null && item < best)) {
      best = item;
      bestCount = count;
    }
  }
  return best;
}

function rawAvgInterval(visitDays: string[]): number | null {
  if (visitDays.length < 2) return null;
  let total = 0;
  for (let i = 1; i < visitDays.length; i++) total += daysBetween(visitDays[i - 1], visitDays[i]);
  return total / (visitDays.length - 1);
}

interface Acc { cardLast2: string; days: Set<string>; items: Map<string, number>; }

function group(tx: Transaction[]): Map<string, Acc> {
  const byCustomer = new Map<string, Acc>();
  for (const t of tx) {
    let acc = byCustomer.get(t.customerId);
    if (!acc) {
      acc = { cardLast2: t.cardLast2, days: new Set(), items: new Map() };
      byCustomer.set(t.customerId, acc);
    }
    acc.days.add(t.date);
    if (t.item !== null) acc.items.set(t.item, (acc.items.get(t.item) ?? 0) + 1);
  }
  return byCustomer;
}

export function buildCustomerStats(tx: Transaction[]): CustomerStats[] {
  const stats: CustomerStats[] = [];
  for (const [customerId, acc] of group(tx)) {
    const visitDays = [...acc.days].sort();
    const avg = rawAvgInterval(visitDays);
    stats.push({
      customerId,
      cardLast2: acc.cardLast2,
      visitDays,
      avgIntervalDays: avg === null ? null : round1(avg),
      lastVisit: visitDays[visitDays.length - 1],
      topItem: pickTopItem(acc.items),
    });
  }
  return stats;
}

export function scoreChurn(tx: Transaction[], asOf: string, opts: ScoreOptions = {}): ChurnReport {
  const limit = opts.limit ?? 5;
  const minRatio = opts.minRatio ?? 2.0;
  const maxAvgInterval = opts.maxAvgInterval ?? 15;
  const minVisits = opts.minVisits ?? 3;

  const stats = buildCustomerStats(tx);
  let regulars = 0;
  const candidates: ChurnCandidate[] = [];
  for (const s of stats) {
    const avg = rawAvgInterval(s.visitDays);
    if (s.visitDays.length < minVisits || avg === null || s.avgIntervalDays === null || s.avgIntervalDays > maxAvgInterval) continue;
    regulars++;
    const daysSinceLast = daysBetween(s.lastVisit, asOf);
    const delayRatio = round1(daysSinceLast / avg);
    if (delayRatio < minRatio) continue;
    candidates.push({
      customerId: s.customerId,
      cardLast2: s.cardLast2,
      topItem: s.topItem,
      avgIntervalDays: s.avgIntervalDays,
      daysSinceLast,
      delayRatio,
      lastVisit: s.lastVisit,
    });
  }
  candidates.sort(
    (a, b) =>
      b.daysSinceLast - a.daysSinceLast ||
      b.delayRatio - a.delayRatio ||
      (a.customerId < b.customerId ? -1 : a.customerId > b.customerId ? 1 : 0),
  );

  return {
    asOf,
    transactions: tx.length,
    customers: stats.length,
    regulars,
    candidates: candidates.slice(0, limit),
  };
}

export function formatCandidateLine(c: ChurnCandidate): string {
  const item = c.topItem === null ? '' : ` · ${c.topItem}`;
  return `카드 ··${c.cardLast2}${item} — 평소 ${String(c.avgIntervalDays)}일마다 → ${String(c.daysSinceLast)}일째 (${String(c.delayRatio)}배)`;
}
