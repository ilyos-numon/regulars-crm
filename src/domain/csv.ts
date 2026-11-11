import { parse } from 'csv-parse/sync';
import { cardLast2, hashCard } from './hash.ts';
import type { ParseResult, Transaction } from './types.ts';

export class CsvFormatError extends Error {}

const REQUIRED = ['거래일시', '카드번호', '금액'] as const;
const DATE_RE = /^(\d{4})([-./])(\d{2})\2(\d{2})(?: (\d{2}):(\d{2})(?::(\d{2}))?)?$/;

function parseDateTime(raw: string): { date: string; time: string } | null {
  const m = DATE_RE.exec(raw.trim());
  if (!m) return null;
  const [, y, , mo, d, hh = '00', mm = '00', ss = '00'] = m;
  const year = Number(y), month = Number(mo), day = Number(d);
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (dt.getUTCFullYear() !== year || dt.getUTCMonth() !== month - 1 || dt.getUTCDate() !== day) return null;
  if (Number(hh) > 23 || Number(mm) > 59 || Number(ss) > 59) return null;
  return { date: `${y}-${mo}-${d}`, time: `${hh}:${mm}` };
}

function parseAmount(raw: string): number | null {
  const cleaned = raw.replace(/[,원\s]/g, '');
  if (cleaned === '') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function parseSalesCsv(text: string, salt: string): ParseResult {
  const rows: string[][] = parse(text, { bom: true, skip_empty_lines: true, relax_column_count: true });
  const header = (rows[0] ?? []).map((h) => h.trim());
  const missing = REQUIRED.filter((name) => !header.includes(name));
  if (missing.length > 0) throw new CsvFormatError(`필수 열이 없습니다: ${missing.join(', ')}`);
  const dataRows = rows.slice(1);
  if (dataRows.length === 0) throw new CsvFormatError('매출 행이 없습니다');

  const iDate = header.indexOf('거래일시');
  const iCard = header.indexOf('카드번호');
  const iAmount = header.indexOf('금액');
  const iItem = header.indexOf('상품명');

  const transactions: Transaction[] = [];
  let skippedRows = 0;
  for (const row of dataRows) {
    const card = (row[iCard] ?? '').trim();
    const dt = parseDateTime(row[iDate] ?? '');
    const amount = parseAmount(row[iAmount] ?? '');
    if (card === '' || dt === null || amount === null) {
      skippedRows++;
      continue;
    }
    const item = iItem >= 0 ? (row[iItem] ?? '').trim() : '';
    transactions.push({
      customerId: hashCard(card, salt),
      cardLast2: cardLast2(card),
      date: dt.date,
      time: dt.time,
      amount,
      item: item === '' ? null : item,
    });
  }
  return { transactions, skippedRows };
}
