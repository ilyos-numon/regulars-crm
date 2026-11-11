import { buildCustomerStats, scoreChurn } from '../domain/churn.ts';
import type { AdjustedCandidate, AdjustedReport, Adjuster, Adjustment, Transaction } from '../domain/types.ts';
import { loadLatest } from '../store.ts';

const adjusters: Adjuster[] = [];

export function registerAdjuster(a: Adjuster): void {
  if (adjusters.some((x) => x.id === a.id)) throw new Error(`adjuster already registered: ${a.id}`);
  adjusters.push(a);
}

export function listAdjusters(): Adjuster[] {
  return [...adjusters];
}

export function _resetAdjustersForTest(): void {
  adjusters.length = 0;
}

export async function loadReport(dataDir: string, asOf: string, opts?: { limit?: number }): Promise<AdjustedReport | null> {
  const tx = await loadLatest(dataDir);
  if (tx === null) return null;
  return applyAdjusters(tx, dataDir, asOf, opts);
}

export async function applyAdjusters(
  tx: Transaction[],
  dataDir: string,
  asOf: string,
  opts?: { limit?: number },
): Promise<AdjustedReport> {
  const limit = opts?.limit ?? 5;
  const base = scoreChurn(tx, asOf, { limit: 20 });
  const stats = buildCustomerStats(tx);
  const ctx = { dataDir, asOf, stats, transactions: tx };
  const fns = [];
  for (const a of adjusters) fns.push(await a.prepare(ctx));

  const candidates: AdjustedCandidate[] = [];
  const heldBack: AdjustedCandidate[] = [];
  for (const c of base.candidates) {
    const adjustments: Adjustment[] = [];
    for (const fn of fns) {
      const adj = fn(c);
      if (adj !== null) adjustments.push(adj);
    }
    const item: AdjustedCandidate = { ...c, adjustments };
    if (adjustments.some((x) => x.hold)) heldBack.push(item);
    else candidates.push(item);
  }

  return {
    asOf: base.asOf,
    transactions: base.transactions,
    customers: base.customers,
    regulars: base.regulars,
    candidates: candidates.slice(0, limit),
    heldBack,
  };
}
