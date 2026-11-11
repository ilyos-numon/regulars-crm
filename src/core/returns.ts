import type { Notice, NoticeOutcome, ReturnStatus, Transaction } from '../domain/types.ts';

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function latestNoticePerCustomer(notices: Notice[]): Notice[] {
  const latest = new Map<string, Notice>();
  for (const n of notices) {
    const prev = latest.get(n.customerId);
    if (!prev || n.noticedOn > prev.noticedOn) latest.set(n.customerId, n);
  }
  return [...latest.values()].sort((a, b) => (a.customerId < b.customerId ? -1 : a.customerId > b.customerId ? 1 : 0));
}

export function computeReturns(tx: Transaction[], notices: Notice[], asOf: string, windowDays = 14): NoticeOutcome[] {
  const daysByCustomer = new Map<string, Set<string>>();
  for (const t of tx) {
    let days = daysByCustomer.get(t.customerId);
    if (!days) {
      days = new Set();
      daysByCustomer.set(t.customerId, days);
    }
    days.add(t.date);
  }
  return notices.map((n) => {
    const windowEnd = addDays(n.noticedOn, windowDays);
    let returnedOn: string | null = null;
    for (const d of daysByCustomer.get(n.customerId) ?? []) {
      if (d > n.noticedOn && d <= windowEnd && (returnedOn === null || d < returnedOn)) returnedOn = d;
    }
    const status: ReturnStatus = returnedOn !== null ? 'returned' : asOf < windowEnd ? 'pending' : 'not_returned';
    return {
      customerId: n.customerId,
      cardLast2: n.cardLast2,
      noticedOn: n.noticedOn,
      source: n.source,
      returnedOn,
      status,
    };
  });
}
