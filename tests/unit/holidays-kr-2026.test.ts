import { describe, expect, it } from 'vitest';
import { HOLIDAYS_KR_2026 } from '../../src/features/weather/holidays-kr-2026.ts';

const EXPECTED = [
  '2026-01-01', '2026-02-16', '2026-02-17', '2026-02-18', '2026-03-01',
  '2026-03-02', '2026-05-05', '2026-05-24', '2026-05-25', '2026-06-03',
  '2026-06-06', '2026-08-15', '2026-08-17', '2026-09-24', '2026-09-25',
  '2026-09-26', '2026-10-03', '2026-10-05', '2026-10-09', '2026-12-25',
];

const utcDay = (d: string) => new Date(d + 'T00:00:00Z').getUTCDay();

describe('HOLIDAYS_KR_2026 (관공서의 공휴일에 관한 규정)', () => {
  it('20일 목록과 정확히 같다', () => {
    expect(HOLIDAYS_KR_2026).toEqual(EXPECTED);
  });

  it('중복이 없고 오름차순이다', () => {
    expect(new Set(HOLIDAYS_KR_2026).size).toBe(HOLIDAYS_KR_2026.length);
    expect([...HOLIDAYS_KR_2026].sort()).toEqual([...HOLIDAYS_KR_2026]);
  });

  it('09-28·07-17·05-01 은 포함하지 않는다', () => {
    expect(HOLIDAYS_KR_2026).not.toContain('2026-09-28');
    expect(HOLIDAYS_KR_2026).not.toContain('2026-07-17');
    expect(HOLIDAYS_KR_2026).not.toContain('2026-05-01');
  });

  it.each(['2026-03-02', '2026-05-25', '2026-08-17', '2026-10-05'])('대체공휴일 %s 은 월요일이다', (d) => {
    expect(HOLIDAYS_KR_2026).toContain(d);
    expect(utcDay(d)).toBe(1);
  });

  it('지방선거일 2026-06-03 은 수요일이다', () => {
    expect(HOLIDAYS_KR_2026).toContain('2026-06-03');
    expect(utcDay('2026-06-03')).toBe(3);
  });
});
