import { addDays } from '../../core/returns.ts';
import { buildCustomerStats, daysBetween, scoreChurn } from '../../domain/churn.ts';
import type { ChurnCandidate, CustomerStats, Transaction } from '../../domain/types.ts';

export interface PersonalHint { sudden: boolean; companions: number; text: string; }
export interface StoreCluster { count: number; from: string; to: string; }
export interface StoreHint { cluster: StoreCluster | null; text: string; }
export interface ChangeHint { before: number; after: number; changePct: number | null; text: string; }

const CLUSTER_DAYS = 14;
const SLOW_FACTOR = 1.3;

const TEXT_SUDDEN = '평소대로 오시다가 갑자기 끊겼습니다';
const TEXT_SLOW = '서서히 뜸해지다가 끊겼습니다';
const TEXT_NO_CLUSTER = '같은 시기에 몰려서 끊긴 단골은 없습니다';

function intervals(visitDays: string[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < visitDays.length; i++) out.push(daysBetween(visitDays[i - 1], visitDays[i]));
  return out;
}

// 마지막 두 간격 평균이 전체 평균의 1.3배를 넘으면 서서히 뜸해진 것으로 본다.
export function isSudden(visitDays: string[]): boolean {
  const gaps = intervals(visitDays);
  if (gaps.length < 2) return true;
  const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  const lastTwo = (gaps[gaps.length - 1] + gaps[gaps.length - 2]) / 2;
  return !(lastTwo > avg * SLOW_FACTOR);
}

function churnCandidates(tx: Transaction[], asOf: string): ChurnCandidate[] {
  return scoreChurn(tx, asOf, { limit: 20 }).candidates;
}

export function findStats(tx: Transaction[], customerId: string): CustomerStats | null {
  return buildCustomerStats(tx).find((s) => s.customerId === customerId) ?? null;
}

export function personalHint(tx: Transaction[], customerId: string, asOf: string): PersonalHint | null {
  const s = findStats(tx, customerId);
  if (s === null) return null;
  const sudden = isSudden(s.visitDays);
  const companions = churnCandidates(tx, asOf).filter(
    (c) => c.customerId !== customerId && Math.abs(daysBetween(c.lastVisit, s.lastVisit)) <= CLUSTER_DAYS,
  ).length;
  let text = sudden ? TEXT_SUDDEN : TEXT_SLOW;
  if (companions >= 1) text += ` 같은 시기에 다른 단골 ${String(companions)}명도 끊겼습니다 — 가게 쪽 이유일 수 있어요`;
  return { sudden, companions, text };
}

function monthDay(date: string): string {
  const [, m, d] = date.split('-').map(Number);
  return `${String(m)}월 ${String(d)}일`;
}

export function storeHint(tx: Transaction[], asOf: string): StoreHint {
  const sorted = churnCandidates(tx, asOf)
    .map((c, i) => ({ c, i }))
    .sort((a, b) => (a.c.lastVisit < b.c.lastVisit ? -1 : a.c.lastVisit > b.c.lastVisit ? 1 : a.i - b.i))
    .map((x) => x.c);
  const groups: ChurnCandidate[][] = [];
  for (const c of sorted) {
    const cur = groups[groups.length - 1];
    if (cur && daysBetween(cur[cur.length - 1].lastVisit, c.lastVisit) <= CLUSTER_DAYS) cur.push(c);
    else groups.push([c]);
  }
  let best: ChurnCandidate[] | null = null;
  for (const g of groups) {
    if (g.length >= 2 && (best === null || g.length > best.length)) best = g;
  }
  if (best === null) return { cluster: null, text: TEXT_NO_CLUSTER };
  const cluster = { count: best.length, from: best[0].lastVisit, to: best[best.length - 1].lastVisit };
  return {
    cluster,
    text: `단골 ${String(cluster.count)}명이 ${monthDay(cluster.from)}부터 ${monthDay(cluster.to)} 사이에 발길이 끊겼습니다. 가게 쪽 변화(가격·메뉴·영업시간)가 있었는지 돌아보세요.`,
  };
}

// scoreChurn 과 같은 단골 판정(방문일 3일 이상, 평균 간격 15일 이하).
function regularStats(tx: Transaction[]): CustomerStats[] {
  return buildCustomerStats(tx).filter(
    (s) => s.visitDays.length >= 3 && s.avgIntervalDays !== null && s.avgIntervalDays <= 15,
  );
}

function countVisits(stats: CustomerStats[], from: string, to: string): number {
  let n = 0;
  for (const s of stats) for (const d of s.visitDays) if (d >= from && d <= to) n++;
  return n;
}

export function changeHint(tx: Transaction[], date: string, asOf: string): ChangeHint {
  const regulars = regularStats(tx);
  const before = countVisits(regulars, addDays(date, -28), addDays(date, -1));
  const afterEnd = addDays(date, 27);
  const after = countVisits(regulars, date, afterEnd < asOf ? afterEnd : asOf);
  let changePct: number | null = null;
  let label = '변화 없음';
  if (before > 0) {
    const raw = ((after - before) / before) * 100;
    // 반올림은 0에서 먼 쪽으로 (62.5% 감소 → 63%).
    changePct = Math.sign(raw) * Math.round(Math.abs(raw));
    if (changePct < 0) label = `${String(Math.abs(changePct))}% 감소`;
    else if (changePct > 0) label = `${String(changePct)}% 증가`;
  }
  return { before, after, changePct, text: `${String(before)}번 → ${String(after)}번 (${label})` };
}
