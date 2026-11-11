import { describe, expect, it, vi } from 'vitest';
import { resolveToday, TODAY_ENV } from '../../src/core/today.ts';

describe('resolveToday', () => {
  it('uses REGULARS_TODAY as the env name', () => {
    expect(TODAY_ENV).toBe('REGULARS_TODAY');
  });

  it('returns undefined without warning when unset', () => {
    const warn = vi.fn();
    expect(resolveToday({}, warn)).toBeUndefined();
    expect(warn).not.toHaveBeenCalled();
  });

  it('returns undefined without warning when empty', () => {
    const warn = vi.fn();
    expect(resolveToday({ REGULARS_TODAY: '' }, warn)).toBeUndefined();
    expect(warn).not.toHaveBeenCalled();
  });

  it('returns a function yielding the fixed date for a valid value', () => {
    const warn = vi.fn();
    const today = resolveToday({ REGULARS_TODAY: '2026-10-27' }, warn);
    expect(today).toBeTypeOf('function');
    expect(today?.()).toBe('2026-10-27');
    expect(today?.()).toBe('2026-10-27');
    expect(warn).not.toHaveBeenCalled();
  });

  it('accepts a leap day', () => {
    expect(resolveToday({ REGULARS_TODAY: '2028-02-29' }, vi.fn())?.()).toBe('2028-02-29');
  });

  it.each(['2026-13-40', '2026-02-30', '20261027', '2027-02-29', '2026-00-10', 'abc'])(
    'warns once and returns undefined for %s',
    (value) => {
      const warn = vi.fn();
      expect(resolveToday({ REGULARS_TODAY: value }, warn)).toBeUndefined();
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith(`[warn] REGULARS_TODAY 형식이 잘못돼 오늘 날짜를 씁니다: ${value}`);
    },
  );

  it('writes to stderr by default', () => {
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      expect(resolveToday({ REGULARS_TODAY: 'bad' })).toBeUndefined();
      expect(spy).toHaveBeenCalledWith('[warn] REGULARS_TODAY 형식이 잘못돼 오늘 날짜를 씁니다: bad\n');
    } finally {
      spy.mockRestore();
    }
  });
});
