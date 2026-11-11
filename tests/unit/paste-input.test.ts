import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseReviewsCsv, summarize } from '../../src/features/reviews/logic.ts';
import { parseWeatherCsv, weatherSummary } from '../../src/features/weather/logic.ts';

const WEATHER_SAMPLE = '날짜,강수량\n2026-10-12,14\n2026-10-13,30\n2026-10-14,0';
const REVIEWS_SAMPLE =
  '작성일,별점,내용\n2026-10-05,5,아메리카노가 늘 맛있어요\n2026-10-12,2,주문이 늦게 나왔어요\n2026-10-20,4,창가 자리가 좋아요';

describe('weather paste input', () => {
  it('accepts tab-separated text', () => {
    const days = parseWeatherCsv('날짜\t강수량\n2026-10-12\t14\n2026-10-13\t30');
    expect(days).toEqual([
      { date: '2026-10-12', rainMm: 14 },
      { date: '2026-10-13', rainMm: 30 },
    ]);
  });

  it('accepts portal column names with extra columns (spec scenario)', () => {
    const days = parseWeatherCsv('지점\t지점명\t일시\t일강수량(mm)\n108\t서울\t2026-10-13\t30');
    expect(weatherSummary(days)).toBe('날씨 1일 · 비 온 날 1일');
  });

  it('accepts portal column names in comma form, with BOM', () => {
    const days = parseWeatherCsv('﻿지점,지점명,일시,평균기온(°C),일강수량\n108,서울,2026-10-12,15.2,3\n108,서울,2026-10-13,14.1,12');
    expect(days).toEqual([
      { date: '2026-10-12', rainMm: 3 },
      { date: '2026-10-13', rainMm: 12 },
    ]);
  });

  it('still rejects 일자 as the date column', () => {
    expect(() => parseWeatherCsv('일자,강수량\n2026-10-12,14')).toThrow('필수 열이 없습니다: 날짜');
    expect(() => parseWeatherCsv('일자\t강수량\n2026-10-12\t14')).toThrow('필수 열이 없습니다: 날짜');
  });

  it('keeps comma input results unchanged', () => {
    const fixture = readFileSync(new URL('../fixtures/weather-sample.csv', import.meta.url), 'utf8');
    const days = parseWeatherCsv(fixture);
    expect(days.length).toBeGreaterThan(0);
    expect(parseWeatherCsv('날짜,강수량(mm)\n2026-10-12,35mm')).toEqual([{ date: '2026-10-12', rainMm: 35 }]);
  });

  it('sample fill text gives the expected summary', () => {
    expect(weatherSummary(parseWeatherCsv(WEATHER_SAMPLE))).toBe('날씨 3일 · 비 온 날 2일');
  });
});

describe('reviews paste input', () => {
  it('accepts tab-separated text (spec scenario)', () => {
    const reviews = parseReviewsCsv('작성일\t별점\t내용\n2026-09-20\t2\t커피가 식어서 나왔어요');
    expect(reviews).toEqual([{ date: '2026-09-20', rating: 2, text: '커피가 식어서 나왔어요' }]);
    expect(summarize(reviews).summary).toBe('리뷰 1건 · 평균 별점 2.0 · 낮은 별점 1건');
  });

  it('keeps comma input with commas inside quoted text', () => {
    const reviews = parseReviewsCsv('작성일,별점,내용\n2026-09-20,2,"늦었고, 식었어요"');
    expect(reviews).toEqual([{ date: '2026-09-20', rating: 2, text: '늦었고, 식었어요' }]);
  });

  it('keeps comma input results unchanged for the fixture', () => {
    const fixture = readFileSync(new URL('../fixtures/reviews-sample.csv', import.meta.url), 'utf8');
    expect(parseReviewsCsv(fixture).length).toBeGreaterThan(0);
  });

  it('sample fill text gives the expected summary', () => {
    expect(summarize(parseReviewsCsv(REVIEWS_SAMPLE)).summary).toBe('리뷰 3건 · 평균 별점 3.7 · 낮은 별점 1건');
  });
});
