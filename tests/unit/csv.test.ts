import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CsvFormatError, parseSalesCsv } from '../../src/domain/csv.ts';
import { cardLast2, hashCard, normalizeCard } from '../../src/domain/hash.ts';

const SALT = 'test-salt';
const sample = readFileSync(new URL('../fixtures/sales-sample.csv', import.meta.url), 'utf8');
const CARD_A = '1234-56**-****-7831';
const CARD_B = '9876-54**-****-1207';

describe('parseSalesCsv — sample', () => {
  const result = parseSalesCsv(sample, SALT);

  it('reads 24 transactions, 1 skipped row, 5 unique customers', () => {
    expect(result.transactions).toHaveLength(24);
    expect(result.skippedRows).toBe(1);
    expect(new Set(result.transactions.map((t) => t.customerId)).size).toBe(5);
  });

  it('gives the same customerId for the same card', () => {
    const idA = hashCard(CARD_A, SALT);
    const aRows = result.transactions.filter((t) => t.customerId === idA);
    expect(aRows).toHaveLength(9);
    expect(hashCard(' 1234-56**-****-7831 ', SALT)).toBe(idA);
  });

  it('customerId is 64-char hex and raw card strings are not stored', () => {
    for (const t of result.transactions) {
      expect(t.customerId).toMatch(/^[0-9a-f]{64}$/);
    }
    const json = JSON.stringify(result);
    for (const raw of ['1234-56', '9876-54', '5555-44', '4111-11', '3782-82']) {
      expect(json).not.toContain(raw);
    }
  });

  it('cardLast2 is the last 2 digits', () => {
    const a = result.transactions.find((t) => t.customerId === hashCard(CARD_A, SALT));
    const b = result.transactions.find((t) => t.customerId === hashCard(CARD_B, SALT));
    expect(a?.cardLast2).toBe('31');
    expect(b?.cardLast2).toBe('07');
    expect(a?.date).toBe('2026-06-07');
    expect(a?.time).toBe('08:10');
    expect(a?.amount).toBe(4500);
    expect(a?.item).toBe('아메리카노');
  });
});

describe('hash helpers', () => {
  it('normalizeCard keeps digits and *, cardLast2 uses digits only', () => {
    expect(normalizeCard('1234-56**-****-7831')).toBe('123456******7831');
    expect(cardLast2('1234-56**-****-7831')).toBe('31');
    expect(hashCard('1234-56**-****-7831', 's')).not.toBe(hashCard('1234-56**-****-7831', 't'));
  });
});

describe('parseSalesCsv — format errors', () => {
  it('reports missing required columns', () => {
    expect(() => parseSalesCsv('거래일시,금액\n2026-10-01,5000\n', SALT)).toThrowError(
      new CsvFormatError('필수 열이 없습니다: 카드번호'),
    );
    expect(() => parseSalesCsv('상품명\n녹차\n', SALT)).toThrowError(
      '필수 열이 없습니다: 거래일시, 카드번호, 금액',
    );
  });

  it('rejects header-only CSV', () => {
    expect(() => parseSalesCsv('거래일시,카드번호,금액\n', SALT)).toThrowError(CsvFormatError);
    expect(() => parseSalesCsv('거래일시,카드번호,금액\n', SALT)).toThrowError('매출 행이 없습니다');
  });
});

describe('parseSalesCsv — flexible input', () => {
  it('accepts BOM, any column order, YYYY.MM.DD and dates without time', () => {
    const text =
      '﻿금액,카드번호,거래일시\n' +
      '"5,000원",1111-22**-****-3344,2026.10.01\n' +
      '4500,1111-22**-****-3344,2026/10/02 09:30\n' +
      '4500,1111-22**-****-3344,2026-10-03 07:05:09\n';
    const r = parseSalesCsv(text, SALT);
    expect(r.skippedRows).toBe(0);
    expect(r.transactions.map((t) => [t.date, t.time, t.amount, t.item])).toEqual([
      ['2026-10-01', '00:00', 5000, null],
      ['2026-10-02', '09:30', 4500, null],
      ['2026-10-03', '07:05', 4500, null],
    ]);
    expect(r.transactions[0].cardLast2).toBe('44');
  });

  it('skips rows with bad date, bad amount or empty card', () => {
    const text =
      '거래일시,카드번호,금액,상품명\n' +
      '2026-13-01,1111,4500,a\n' +
      'yesterday,1111,4500,a\n' +
      '2026-10-01,1111,0,a\n' +
      '2026-10-01,1111,-5,a\n' +
      '2026-10-01,,4500,a\n' +
      '2026-10-01,1111,4500,\n';
    const r = parseSalesCsv(text, SALT);
    expect(r.skippedRows).toBe(5);
    expect(r.transactions).toHaveLength(1);
    expect(r.transactions[0].item).toBeNull();
  });
});
