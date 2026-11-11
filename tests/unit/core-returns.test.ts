import { describe, expect, it } from 'vitest';
import { addDays, computeReturns, latestNoticePerCustomer } from '../../src/core/returns.ts';
import type { Notice, Transaction } from '../../src/domain/types.ts';

function tx(customerId: string, date: string): Transaction {
  return { customerId, cardLast2: customerId.slice(-2), date, time: '10:00', amount: 5000, item: '라떼' };
}

function notice(customerId: string, noticedOn: string, source: Notice['source'] = 'draft'): Notice {
  return { customerId, cardLast2: customerId.slice(-2), noticedOn, source };
}

describe('addDays', () => {
  it('crosses month and year boundaries in UTC', () => {
    expect(addDays('2026-10-13', 14)).toBe('2026-10-27');
    expect(addDays('2026-09-25', 14)).toBe('2026-10-09');
    expect(addDays('2026-02-20', 10)).toBe('2026-03-02');
    expect(addDays('2026-12-25', 14)).toBe('2027-01-08');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('latestNoticePerCustomer', () => {
  it('keeps one latest notice per customer, sorted by customerId', () => {
    const out = latestNoticePerCustomer([
      notice('cc', '2026-10-01'),
      notice('aa', '2026-10-05', 'briefing'),
      notice('cc', '2026-10-13', 'briefing'),
      notice('aa', '2026-10-02'),
    ]);
    expect(out).toEqual([notice('aa', '2026-10-05', 'briefing'), notice('cc', '2026-10-13', 'briefing')]);
  });
});

describe('computeReturns', () => {
  const asOf = '2026-10-27';

  it('returned: earliest visit after notice within the window', () => {
    const [o] = computeReturns(
      [tx('b7', '2026-10-13'), tx('b7', '2026-10-25'), tx('b7', '2026-10-20')],
      [notice('b7', '2026-10-13')],
      asOf,
    );
    expect(o.returnedOn).toBe('2026-10-20');
    expect(o.status).toBe('returned');
  });

  it('returned on the last day of the window (noticedOn + 14)', () => {
    const [o] = computeReturns([tx('b7', '2026-10-27')], [notice('b7', '2026-10-13')], asOf);
    expect(o).toMatchObject({ returnedOn: '2026-10-27', status: 'returned', source: 'draft', cardLast2: 'b7' });
  });

  it('pending: no visit yet and asOf is before the window end', () => {
    const [o] = computeReturns([tx('a1', '2026-09-19')], [notice('a1', '2026-10-14')], asOf);
    expect(o.returnedOn).toBeNull();
    expect(o.status).toBe('pending');
  });

  it('not_returned: window end equals asOf', () => {
    const [o] = computeReturns([tx('a1', '2026-09-19')], [notice('a1', '2026-10-13')], asOf);
    expect(o.returnedOn).toBeNull();
    expect(o.status).toBe('not_returned');
  });

  it('ignores a visit after the window and a visit on the notice day', () => {
    const [o] = computeReturns(
      [tx('a1', '2026-09-01'), tx('a1', '2026-09-16')],
      [notice('a1', '2026-09-01')],
      asOf,
    );
    expect(o.returnedOn).toBeNull();
    expect(o.status).toBe('not_returned');
  });
});
