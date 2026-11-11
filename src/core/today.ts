export const TODAY_ENV = 'REGULARS_TODAY';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isCalendarDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** 값이 없거나 '' → undefined. YYYY-MM-DD 이고 실제 달력 날짜 → () => 그 값.
 *  그 밖 → warn 1회 후 undefined. */
export function resolveToday(
  env: NodeJS.ProcessEnv,
  warn: (msg: string) => void = (m) => process.stderr.write(m + '\n'),
): (() => string) | undefined {
  const value = env[TODAY_ENV];
  if (value === undefined || value === '') return undefined;
  if (!isCalendarDate(value)) {
    warn(`[warn] REGULARS_TODAY 형식이 잘못돼 오늘 날짜를 씁니다: ${value}`);
    return undefined;
  }
  return () => value;
}
