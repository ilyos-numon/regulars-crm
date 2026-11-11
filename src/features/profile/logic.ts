import { buildCustomerStats } from '../../domain/churn.ts';
import type { Transaction } from '../../domain/types.ts';

export type Band = '아침' | '점심' | '오후' | '저녁' | '밤';

export interface Profile {
  customerId: string;
  cardLast2: string;
  visits: number;
  avgIntervalDays: number | null;
  spendPerVisit: number;
  topItem: string | null;
  band: Band;
  weekday: string;
  line: string;
}

const BAND_ORDER: Band[] = ['아침', '점심', '오후', '저녁', '밤'];
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export function bandOf(time: string): Band {
  const [hh, mm] = time.split(':').map(Number);
  const minutes = hh * 60 + mm;
  if (minutes >= 6 * 60 && minutes < 11 * 60) return '아침';
  if (minutes >= 11 * 60 && minutes < 14 * 60) return '점심';
  if (minutes >= 14 * 60 && minutes < 18 * 60) return '오후';
  if (minutes >= 18 * 60 && minutes < 22 * 60) return '저녁';
  return '밤';
}

function weekdayIndex(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function formatWon(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// 그 손님의 거래가 없으면 null.
export function buildProfile(tx: Transaction[], customerId: string): Profile | null {
  const mine = tx.filter((t) => t.customerId === customerId);
  if (mine.length === 0) return null;
  const stats = buildCustomerStats(mine)[0];
  const visits = stats.visitDays.length;

  let total = 0;
  const firstTime = new Map<string, string>();
  for (const t of mine) {
    total += t.amount;
    const prev = firstTime.get(t.date);
    if (prev === undefined || t.time < prev) firstTime.set(t.date, t.time);
  }
  const spendPerVisit = Math.round(total / visits);

  const bandCounts = new Map<Band, number>();
  for (const time of firstTime.values()) {
    const b = bandOf(time);
    bandCounts.set(b, (bandCounts.get(b) ?? 0) + 1);
  }
  let band: Band = BAND_ORDER[0];
  let bandBest = -1;
  for (const b of BAND_ORDER) {
    const c = bandCounts.get(b) ?? 0;
    if (c > bandBest) {
      band = b;
      bandBest = c;
    }
  }

  const dayCounts = new Array<number>(7).fill(0);
  for (const d of stats.visitDays) dayCounts[weekdayIndex(d)]++;
  const maxDay = Math.max(...dayCounts);
  const leaders = dayCounts.filter((c) => c === maxDay).length;
  const weekday = maxDay * 2 >= visits && leaders === 1
    ? `주로 ${WEEKDAYS[dayCounts.indexOf(maxDay)]}요일`
    : '요일은 일정하지 않음';

  const avg = stats.avgIntervalDays;
  const parts = [
    `방문 ${String(visits)}번`,
    avg === null ? '평소 주기 아직 몰라요' : `평소 ${String(avg)}일마다`,
    `한 번에 ${formatWon(spendPerVisit)}원`,
  ];
  if (stats.topItem !== null) parts.push(`주로 ${stats.topItem}`);
  parts.push(`${band} 시간대`, weekday);

  return {
    customerId,
    cardLast2: stats.cardLast2,
    visits,
    avgIntervalDays: avg,
    spendPerVisit,
    topItem: stats.topItem,
    band,
    weekday,
    line: parts.join(' · '),
  };
}
