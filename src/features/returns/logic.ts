import { addDays, computeReturns, latestNoticePerCustomer } from '../../core/returns.ts';
import { buildCustomerStats, daysBetween } from '../../domain/churn.ts';
import type { Notice, NoticeOutcome, ReturnStatus, Transaction } from '../../domain/types.ts';

export const WINDOW_DAYS = 14;
export const MSG_NO_BASELINE = '비교할 과거 기록이 아직 없습니다';

export interface Baseline { episodes: number; returned: number; rate: number | null; }

export interface ReturnsReport {
  noticed: number;
  returned: number;
  pending: number;
  notReturned: number;
  rate: number | null;
  baseline: Baseline;
  diffPct: number | null;
  outcomes: NoticeOutcome[];
  text: string;
  baselineText: string;
}

interface Episode { detectedOn: string; status: ReturnStatus; }

function rawAvg(visitDays: string[]): number | null {
  if (visitDays.length < 2) return null;
  let total = 0;
  for (let i = 1; i < visitDays.length; i++) total += daysBetween(visitDays[i - 1], visitDays[i]);
  return total / (visitDays.length - 1);
}

function episodeStatus(visitDays: string[], detectedOn: string, asOf: string): ReturnStatus {
  const end = addDays(detectedOn, WINDOW_DAYS);
  if (visitDays.some((d) => d > detectedOn && d <= end)) return 'returned';
  return asOf < end ? 'pending' : 'not_returned';
}

export function customerEpisodes(visitDays: string[], avg: number, asOf: string): Episode[] {
  const threshold = 2 * avg;
  const offset = Math.ceil(threshold);
  const out: Episode[] = [];
  for (let i = 1; i < visitDays.length; i++) {
    if (daysBetween(visitDays[i - 1], visitDays[i]) >= threshold) {
      const detectedOn = addDays(visitDays[i - 1], offset);
      out.push({ detectedOn, status: episodeStatus(visitDays, detectedOn, asOf) });
    }
  }
  const last = visitDays[visitDays.length - 1];
  if (daysBetween(last, asOf) >= threshold) {
    const detectedOn = addDays(last, offset);
    out.push({ detectedOn, status: episodeStatus(visitDays, detectedOn, asOf) });
  }
  return out;
}

export function computeBaseline(tx: Transaction[], notices: Notice[], asOf: string): Baseline {
  const noticed = new Set(notices.map((n) => n.customerId));
  let episodes = 0;
  let returned = 0;
  for (const s of buildCustomerStats(tx)) {
    if (noticed.has(s.customerId)) continue;
    if (s.visitDays.length < 3 || s.avgIntervalDays === null || s.avgIntervalDays > 15) continue;
    const avg = rawAvg(s.visitDays);
    if (avg === null) continue;
    for (const e of customerEpisodes(s.visitDays, avg, asOf)) {
      if (e.status === 'pending') continue;
      episodes++;
      if (e.status === 'returned') returned++;
    }
  }
  return { episodes, returned, rate: episodes > 0 ? Math.round((returned / episodes) * 100) : null };
}

export function buildReturnsReport(tx: Transaction[], notices: Notice[], asOf: string): ReturnsReport {
  const outcomes = computeReturns(tx, latestNoticePerCustomer(notices), asOf, WINDOW_DAYS);
  const noticed = outcomes.length;
  const returned = outcomes.filter((o) => o.status === 'returned').length;
  const pending = outcomes.filter((o) => o.status === 'pending').length;
  const notReturned = outcomes.filter((o) => o.status === 'not_returned').length;
  const rate = pending < noticed ? Math.round((returned / (noticed - pending)) * 100) : null;

  let text = '';
  if (noticed > 0 && rate === null) {
    text = `알림 ${String(noticed)}명 · 기다리는 중 ${String(pending)}명 (아직 결과가 나오지 않았습니다)`;
  } else if (noticed > 0) {
    text = `알림 ${String(noticed)}명 중 ${String(returned)}명이 14일 안에 돌아왔습니다 (${String(rate)}%)`;
    if (pending > 0) text += ` · 기다리는 중 ${String(pending)}명`;
  }

  const baseline = computeBaseline(tx, notices, asOf);
  const baselineText =
    baseline.rate === null
      ? MSG_NO_BASELINE
      : `알림 없이 돌아온 비율 ${String(baseline.rate)}% (과거 ${String(baseline.episodes)}번 중 ${String(baseline.returned)}번)`;
  const diffPct = rate !== null && baseline.rate !== null ? rate - baseline.rate : null;

  return { noticed, returned, pending, notReturned, rate, baseline, diffPct, outcomes, text, baselineText };
}
