import { parse } from 'csv-parse/sync';
import { generateText } from '../../core/llm.ts';
import { addDays } from '../../core/returns.ts';
import { buildCustomerStats } from '../../domain/churn.ts';
import type { CustomerStats, Transaction } from '../../domain/types.ts';

export interface Review { date: string; rating: number; text: string; }
export type ReplySource = '기본 문구' | 'AI 문구';
export interface ReviewImpact {
  date: string; rating: number; text: string;
  before: number; after: number; line: string;
  reply: string; replySource: ReplySource;
}
export interface ImportSummary { count: number; avgRating: number; low: number; summary: string; }

export class ReviewCsvError extends Error {}

export const REVIEWS_FILE = 'reviews.json';
export const LOW_RATING = 2;
export const BANNED_WORDS = ['쿠폰', '할인', '이벤트', '증정', '적립', '무료', '세일', '특가'];
export const SOURCE_TEMPLATE: ReplySource = '기본 문구';
export const SOURCE_MODEL: ReplySource = 'AI 문구';
export const TEXT_NO_REVIEWS = '아직 가져온 리뷰가 없습니다';

const REQUIRED = ['작성일', '별점', '내용'] as const;
const WINDOW_DAYS = 14;
const DATE_RE = /^(\d{4})([-./])(\d{2})\2(\d{2})$/;
const MAX_REPLY_CHARS = 200;

function parseDate(raw: string): string | null {
  const m = DATE_RE.exec(raw.trim());
  if (!m) return null;
  const [, y, , mo, d] = m;
  const year = Number(y), month = Number(mo), day = Number(d);
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (dt.getUTCFullYear() !== year || dt.getUTCMonth() !== month - 1 || dt.getUTCDate() !== day) return null;
  return `${y}-${mo}-${d}`;
}

function parseRating(raw: string): number | null {
  const t = raw.trim();
  if (!/^[1-5]$/.test(t)) return null;
  return Number(t);
}

// 표 프로그램에서 복사한 탭 구분 붙여넣기: 첫 줄에 탭이 있고 쉼표가 없으면 탭으로 나눈다.
function detectDelimiter(text: string): string {
  const first = text.replace(/^\uFEFF/, '').split(/\r?\n/, 1)[0] ?? '';
  return first.includes('\t') && !first.includes(',') ? '\t' : ',';
}

// 필수 열이 없으면 throw. 날짜·별점이 잘못된 행은 건너뛴다. 남은 행이 없으면 throw.
export function parseReviewsCsv(text: string): Review[] {
  const rows: string[][] = parse(text, {
    bom: true, skip_empty_lines: true, relax_column_count: true, delimiter: detectDelimiter(text),
  });
  const header = (rows[0] ?? []).map((h) => h.trim());
  const missing = REQUIRED.filter((name) => !header.includes(name));
  if (missing.length > 0) throw new ReviewCsvError(`필수 열이 없습니다: ${missing.join(', ')}`);
  const iDate = header.indexOf('작성일');
  const iRating = header.indexOf('별점');
  const iText = header.indexOf('내용');
  const reviews: Review[] = [];
  for (const row of rows.slice(1)) {
    const date = parseDate(row[iDate] ?? '');
    const rating = parseRating(row[iRating] ?? '');
    if (date === null || rating === null) continue;
    reviews.push({ date, rating, text: (row[iText] ?? '').trim() });
  }
  if (reviews.length === 0) throw new ReviewCsvError('리뷰 행이 없습니다');
  return reviews;
}

export function summarize(reviews: Review[]): ImportSummary {
  const count = reviews.length;
  const low = reviews.filter((r) => r.rating <= LOW_RATING).length;
  if (count === 0) return { count, avgRating: 0, low, summary: TEXT_NO_REVIEWS };
  const avgRating = Math.round((reviews.reduce((a, r) => a + r.rating, 0) / count) * 10) / 10;
  return {
    count, avgRating, low,
    summary: `리뷰 ${String(count)}건 · 평균 별점 ${avgRating.toFixed(1)} · 낮은 별점 ${String(low)}건`,
  };
}

// 단골 판정(방문일 3일 이상, 평균 간격 15일 이하)은 매출 쪽 계산과 같다.
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

export function compareAround(tx: Transaction[], date: string, asOf: string): { before: number; after: number; line: string } {
  const regulars = regularStats(tx);
  const before = countVisits(regulars, addDays(date, -WINDOW_DAYS), addDays(date, -1));
  const afterEnd = addDays(date, WINDOW_DAYS - 1);
  const after = countVisits(regulars, date, afterEnd < asOf ? afterEnd : asOf);
  let label = '변화 없음';
  if (before > 0) {
    const raw = ((after - before) / before) * 100;
    const p = Math.sign(raw) * Math.round(Math.abs(raw));
    if (p < 0) label = `${String(Math.abs(p))}% 감소`;
    else if (p > 0) label = `${String(p)}% 증가`;
  }
  return { before, after, line: `${date} 낮은 별점 전후 단골 방문 ${String(before)}번 → ${String(after)}번 (${label})` };
}

export function templateReply(text: string): string {
  const head = Array.from(text).slice(0, 20).join('');
  return `소중한 의견 감사합니다. 말씀해 주신 점("${head}") 바로 살펴보고 고치겠습니다. 불편을 드려 죄송합니다. 다음에 오시면 더 신경 쓰겠습니다.`;
}

export function containsBanned(text: string): boolean {
  return BANNED_WORDS.some((w) => text.includes(w));
}

// 모델에 보내기 전에 전화번호처럼 보이는 숫자와 "○○씨/○○님" 같은 호칭을 지운다.
export function scrubReviewText(text: string): string {
  return text
    .replace(/\d[\d\s-]{5,}\d/g, '')
    .replace(/\d{4,}/g, '')
    .replace(/[가-힣]{2,4}(씨|님)/g, (m) => (m.endsWith('사장님') || m.endsWith('직원분') ? m : ''))
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export const SYSTEM_PROMPT = [
  '당신은 동네 가게 사장님이 낮은 별점 리뷰에 남길 답글을 쓰는 도우미입니다.',
  '규칙:',
  '- 쿠폰·할인·이벤트·증정·적립·무료·세일·특가 같은 혜택 유도 표현은 절대 쓰지 않는다.',
  '- 존댓말로, 사과와 개선 약속을 담아 두세 문장으로 쓴다.',
  '- 손님 이름이나 연락처는 쓰지 않는다.',
  '- 답글 본문만 출력한다.',
].join('\n');

export type Generate = typeof generateText;

export async function makeReply(
  review: Review,
  env: NodeJS.ProcessEnv = process.env,
  generate: Generate = generateText,
): Promise<{ reply: string; replySource: ReplySource }> {
  const user = JSON.stringify({ rating: review.rating, review: scrubReviewText(review.text) });
  const result = await generate({ system: SYSTEM_PROMPT, user, maxTokens: 300 }, env);
  const text = result.source === 'model' && result.text !== null ? result.text.trim() : '';
  if (text === '' || containsBanned(text) || Array.from(text).length > MAX_REPLY_CHARS) {
    return { reply: templateReply(review.text), replySource: SOURCE_TEMPLATE };
  }
  return { reply: text, replySource: SOURCE_MODEL };
}

// 기준일까지 쓰인 낮은 별점 리뷰마다 전후 단골 방문 비교와 답글 초안. 작성일 오름차순.
export async function buildImpacts(
  reviews: Review[],
  tx: Transaction[],
  asOf: string,
  env: NodeJS.ProcessEnv = process.env,
  generate: Generate = generateText,
): Promise<ReviewImpact[]> {
  const low = reviews
    .filter((r) => r.rating <= LOW_RATING && r.date <= asOf)
    .map((r, i) => ({ r, i }))
    .sort((a, b) => (a.r.date < b.r.date ? -1 : a.r.date > b.r.date ? 1 : a.i - b.i))
    .map((x) => x.r);
  const out: ReviewImpact[] = [];
  for (const r of low) {
    const cmp = compareAround(tx, r.date, asOf);
    const rep = await makeReply(r, env, generate);
    out.push({ date: r.date, rating: r.rating, text: r.text, ...cmp, ...rep });
  }
  return out;
}
