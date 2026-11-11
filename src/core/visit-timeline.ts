export type ExcludedKind = 'holiday' | 'rain';
export interface ExcludedDay { date: string; kind: ExcludedKind; } // date "YYYY-MM-DD"
export interface VisitTimeline { visitDays: string[]; excludedDays: ExcludedDay[]; }

// visitDays: 고유 방문일 오름차순. excludedDays: lastVisit < d <= asOf 이고 공휴일·비 온 날, 오름차순, 둘 다면 holiday.
export function buildVisitTimeline(
  visitDays: readonly string[],
  lastVisit: string,
  asOf: string,
  holidays: ReadonlySet<string>,
  rainDays: ReadonlySet<string>,
): VisitTimeline {
  const kinds = new Map<string, ExcludedKind>();
  for (const d of rainDays) if (d > lastVisit && d <= asOf) kinds.set(d, 'rain');
  for (const d of holidays) if (d > lastVisit && d <= asOf) kinds.set(d, 'holiday');
  const excludedDays = [...kinds.keys()].sort().map((date) => ({ date, kind: kinds.get(date) as ExcludedKind }));
  return { visitDays: [...new Set(visitDays)].sort(), excludedDays };
}
