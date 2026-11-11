import { parse } from 'csv-parse/sync';
import { readJsonFile, writeJsonFile } from '../../core/json-store.ts';
import type { Adjuster, AdjusterFn, Adjustment, ChurnCandidate } from '../../domain/types.ts';
import { HOLIDAYS_KR_2026 } from './holidays-kr-2026.ts';

export interface WeatherDay { date: string; rainMm: number; }

export const WEATHER_FILE = 'weather.json';
export const RAIN_MM = 10;

export const COL_DATE = '날짜';
export const COL_RAIN = '강수량';
export const MSG_NO_ROWS = '날씨 행이 없습니다';

export class WeatherFormatError extends Error {}

const DATE_RE = /^(\d{4})([-./])(\d{2})\2(\d{2})$/;

function normalizeDate(raw: string): string | null {
  const m = DATE_RE.exec(raw.trim());
  if (!m) return null;
  const [, y, , mo, d] = m;
  const year = Number(y), month = Number(mo), day = Number(d);
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (dt.getUTCFullYear() !== year || dt.getUTCMonth() !== month - 1 || dt.getUTCDate() !== day) return null;
  return `${y}-${mo}-${d}`;
}

function parseRain(raw: string): number | null {
  const cleaned = raw.replace(/mm/gi, '').trim();
  if (cleaned === '') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function headerIndex(header: string[], names: string[]): number {
  for (const name of names) {
    const exact = header.indexOf(name);
    if (exact >= 0) return exact;
  }
  // `강수량(mm)` 같은 단위 표기 허용
  for (const name of names) {
    const i = header.findIndex((h) => h.startsWith(`${name}(`));
    if (i >= 0) return i;
  }
  return -1;
}

// 기상자료개방포털 일자료의 열 이름도 받는다.
const DATE_ALIASES = [COL_DATE, '일시'];
const RAIN_ALIASES = [COL_RAIN, '일강수량'];

// 표 프로그램에서 복사한 탭 구분 붙여넣기: 첫 줄에 탭이 있고 쉼표가 없으면 탭으로 나눈다.
function detectDelimiter(text: string): string {
  const first = text.replace(/^\uFEFF/, '').split(/\r?\n/, 1)[0] ?? '';
  return first.includes('\t') && !first.includes(',') ? '\t' : ',';
}

// 날짜 오름차순, 같은 날짜는 뒤 행이 이긴다.
export function parseWeatherCsv(text: string): WeatherDay[] {
  const rows: string[][] = parse(text, {
    bom: true, skip_empty_lines: true, relax_column_count: true, delimiter: detectDelimiter(text),
  });
  const header = (rows[0] ?? []).map((h) => h.trim());
  const iDate = headerIndex(header, DATE_ALIASES);
  const iRain = headerIndex(header, RAIN_ALIASES);
  const missing: string[] = [];
  if (iDate < 0) missing.push(COL_DATE);
  if (iRain < 0) missing.push(COL_RAIN);
  if (missing.length > 0) throw new WeatherFormatError(`필수 열이 없습니다: ${missing.join(', ')}`);

  const byDate = new Map<string, number>();
  for (const row of rows.slice(1)) {
    const date = normalizeDate(row[iDate] ?? '');
    const rain = parseRain(row[iRain] ?? '');
    if (date === null || rain === null) continue;
    byDate.set(date, rain);
  }
  if (byDate.size === 0) throw new WeatherFormatError(MSG_NO_ROWS);
  return [...byDate.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([date, rainMm]) => ({ date, rainMm }));
}

export function countRainy(days: WeatherDay[]): number {
  return days.filter((d) => d.rainMm >= RAIN_MM).length;
}

export function weatherSummary(days: WeatherDay[]): string {
  if (days.length === 0) return '아직 날씨 기록이 없습니다';
  return `날씨 ${days.length}일 · 비 온 날 ${countRainy(days)}일`;
}

export function holidayLine(): string {
  return `연휴·공휴일 ${HOLIDAYS_KR_2026.length}일 반영`;
}

// 비 ≥ 10mm 날과 공휴일의 합집합.
export function badDaySet(days: WeatherDay[]): Set<string> {
  const set = new Set<string>(HOLIDAYS_KR_2026);
  for (const d of days) if (d.rainMm >= RAIN_MM) set.add(d.date);
  return set;
}

// (lastVisit, asOf] 안의 날 수. YYYY-MM-DD 문자열 비교.
export function countBadDays(bad: Set<string>, lastVisit: string, asOf: string): number {
  let n = 0;
  for (const d of bad) if (d > lastVisit && d <= asOf) n++;
  return n;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function weatherAdjustment(c: ChurnCandidate, badDays: number): Adjustment | null {
  if (badDays <= 0) return null;
  const r = round1((c.daysSinceLast - badDays) / c.avgIntervalDays);
  const ratio = r.toFixed(1);
  if (r >= 2.0) return { source: 'weather', note: `비·연휴 ${badDays}일을 빼도 ${ratio}배`, hold: false };
  return { source: 'weather', note: `비·연휴 ${badDays}일을 빼면 ${ratio}배 — 날씨 영향일 수 있어 이번 주는 보류`, hold: true };
}

export async function loadWeather(dataDir: string): Promise<WeatherDay[]> {
  const raw = await readJsonFile<unknown>(dataDir, WEATHER_FILE, []);
  return Array.isArray(raw) ? (raw as WeatherDay[]) : [];
}

export async function saveWeather(dataDir: string, days: WeatherDay[]): Promise<void> {
  await writeJsonFile(dataDir, WEATHER_FILE, days);
}

export const weatherAdjuster: Adjuster = {
  id: 'weather',
  async prepare(ctx): Promise<AdjusterFn> {
    const bad = badDaySet(await loadWeather(ctx.dataDir));
    return (c) => weatherAdjustment(c, countBadDays(bad, c.lastVisit, ctx.asOf));
  },
};
