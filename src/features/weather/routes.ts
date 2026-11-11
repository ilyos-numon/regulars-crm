import type { Route } from '../../domain/types.ts';
import { HOLIDAYS_KR_2026 } from './holidays-kr-2026.ts';
import {
  countRainy,
  holidayLine,
  loadWeather,
  parseWeatherCsv,
  saveWeather,
  WeatherFormatError,
  weatherSummary,
} from './logic.ts';

const MAX_WEATHER_BYTES = 1024 * 1024;
const MSG_TOO_LARGE = '파일이 너무 큽니다(최대 1MB)';

export const routes: Route[] = [
  {
    method: 'POST',
    path: '/api/weather/import',
    async handle(ctx) {
      const text = await ctx.readText(MAX_WEATHER_BYTES);
      if (text === null) {
        ctx.sendJson(413, { error: MSG_TOO_LARGE });
        return;
      }
      let days;
      try {
        days = parseWeatherCsv(text);
      } catch (err) {
        if (err instanceof WeatherFormatError) {
          ctx.sendJson(400, { error: err.message });
          return;
        }
        throw err;
      }
      await saveWeather(ctx.dataDir, days);
      ctx.sendJson(200, { days: days.length, rainy: countRainy(days), summary: weatherSummary(days) });
    },
  },
  {
    method: 'GET',
    path: '/api/weather',
    async handle(ctx) {
      const days = await loadWeather(ctx.dataDir);
      ctx.sendJson(200, {
        days: days.length,
        rainy: countRainy(days),
        holidays: HOLIDAYS_KR_2026.length,
        summary: weatherSummary(days),
        holidayLine: holidayLine(),
      });
    },
  },
];
