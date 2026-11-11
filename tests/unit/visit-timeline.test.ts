import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyAdjusters } from '../../src/core/pipeline.ts';
import { buildVisitTimeline } from '../../src/core/visit-timeline.ts';
import { createHandler } from '../../src/http/handler.ts';
import { loadLatest } from '../../src/store.ts';

const sample = readFileSync(new URL('../fixtures/sales-sample.csv', import.meta.url), 'utf8');

describe('buildVisitTimeline', () => {
  it('excludes lastVisit itself and includes asOf', () => {
    const t = buildVisitTimeline(
      ['2026-10-01', '2026-10-05'],
      '2026-10-05',
      '2026-10-10',
      new Set(['2026-10-05', '2026-10-10']),
      new Set(['2026-10-04', '2026-10-11']),
    );
    expect(t.excludedDays).toEqual([{ date: '2026-10-10', kind: 'holiday' }]);
  });

  it('a day that is both holiday and rain appears once as holiday', () => {
    const t = buildVisitTimeline(['2026-10-01'], '2026-10-01', '2026-10-31', new Set(['2026-10-09']), new Set(['2026-10-09', '2026-10-15']));
    expect(t.excludedDays).toEqual([
      { date: '2026-10-09', kind: 'holiday' },
      { date: '2026-10-15', kind: 'rain' },
    ]);
  });

  it('sorts visitDays unique ascending and excludedDays ascending', () => {
    const t = buildVisitTimeline(
      ['2026-09-10', '2026-09-01', '2026-09-10', '2026-09-05'],
      '2026-09-10',
      '2026-09-30',
      new Set(['2026-09-25', '2026-09-12']),
      new Set(['2026-09-20', '2026-09-11']),
    );
    expect(t.visitDays).toEqual(['2026-09-01', '2026-09-05', '2026-09-10']);
    expect(t.excludedDays.map((d) => d.date)).toEqual(['2026-09-11', '2026-09-12', '2026-09-20', '2026-09-25']);
  });
});

describe('GET /api/churn timeline', () => {
  let server: http.Server;
  let base: string;
  let dataDir: string;

  beforeAll(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'regulars-timeline-'));
    server = http.createServer(createHandler({ dataDir, salt: 't', today: () => '2026-10-27' }));
    await new Promise<void>((resolve) => server.listen(0, resolve));
    base = `http://localhost:${(server.address() as AddressInfo).port}`;
    const res = await fetch(`${base}/api/upload?asOf=2026-10-27`, { method: 'POST', headers: { 'Content-Type': 'text/csv' }, body: sample });
    expect(res.status).toBe(200);
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(dataDir, { recursive: true, force: true });
  });

  async function churn(): Promise<any> {
    const res = await fetch(`${base}/api/churn?asOf=2026-10-27`);
    expect(res.status).toBe(200);
    return res.json();
  }

  it('first regular ··31 has 6 holiday excludedDays and visitDays ending at lastVisit', async () => {
    const body = await churn();
    const first = body.candidates[0];
    expect(first.cardLast2).toBe('31');
    expect(first.timeline.excludedDays).toHaveLength(6);
    expect(first.timeline.excludedDays.every((d: { kind: string }) => d.kind === 'holiday')).toBe(true);
    expect(first.timeline.visitDays[first.timeline.visitDays.length - 1]).toBe(first.lastVisit);
  });

  it('items without timeline equal applyAdjusters output', async () => {
    const body = await churn();
    const tx = await loadLatest(dataDir);
    expect(tx).not.toBeNull();
    const expected = await applyAdjusters(tx!, dataDir, '2026-10-27', { limit: 5 });
    const strip = (list: any[]): any[] => list.map(({ timeline, ...rest }) => {
      expect(timeline).toBeDefined();
      return rest;
    });
    expect(strip(body.candidates)).toEqual(expected.candidates);
    expect(strip(body.heldBack)).toEqual(expected.heldBack);
    const { candidates: _c, heldBack: _h, ...root } = body;
    const { candidates: _ec, heldBack: _eh, ...expectedRoot } = expected;
    expect(Object.keys(root)).toEqual(Object.keys(expectedRoot));
    expect(root).toEqual(expectedRoot);
  });

  it('a 10mm rain day becomes rain and count matches weather note N', async () => {
    const csv = '날짜,강수량\n2026-10-15,10\n2026-10-09,25\n2026-10-20,9.9\n';
    const imp = await fetch(`${base}/api/weather/import`, { method: 'POST', headers: { 'Content-Type': 'text/csv' }, body: csv });
    expect(imp.status).toBe(200);
    const body = await churn();
    const all = [...body.candidates, ...body.heldBack];
    const c31 = all.find((c: { cardLast2: string }) => c.cardLast2 === '31');
    expect(c31).toBeDefined();
    const ex = c31.timeline.excludedDays;
    expect(ex).toContainEqual({ date: '2026-10-15', kind: 'rain' });
    expect(ex).toContainEqual({ date: '2026-10-09', kind: 'holiday' });
    expect(ex.some((d: { date: string }) => d.date === '2026-10-20')).toBe(false);
    expect(ex).toHaveLength(7);
    for (const c of all) {
      const note = c.adjustments.find((a: { source: string }) => a.source === 'weather')?.note as string | undefined;
      if (note === undefined) continue;
      const m = /비·연휴 (\d+)일/.exec(note);
      expect(m).not.toBeNull();
      expect(c.timeline.excludedDays).toHaveLength(Number(m![1]));
    }
  });
});
