import { readFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { clearDataDir } from '../core/json-store.ts';
import { appendNotices, loadNotices } from '../core/notices.ts';
import { applyAdjusters, loadReport } from '../core/pipeline.ts';
import { loadStatus } from '../core/status.ts';
import { buildVisitTimeline, type VisitTimeline } from '../core/visit-timeline.ts';
import { buildCustomerStats } from '../domain/churn.ts';
import { CsvFormatError, parseSalesCsv } from '../domain/csv.ts';
import type { AdjustedCandidate, AdjustedUploadResponse, FeatureId, Notice } from '../domain/types.ts';
import { featureRoutes, features, registerAllAdjusters } from '../features/registry.ts';
import { HOLIDAYS_KR_2026 } from '../features/weather/holidays-kr-2026.ts';
import { loadWeather, RAIN_MM } from '../features/weather/logic.ts';
import { loadLatest, saveLatest } from '../store.ts';
import { createRouteContext, matchRoute, readBody, sendJson } from './router.ts';

export interface HandlerOptions {
  dataDir: string;
  salt: string;
  today?: () => string; // "YYYY-MM-DD" 로컬
  allowReset?: boolean;
}

const INDEX_HTML_URL = new URL('../web/index.html', import.meta.url);
const LANDING_HTML_URL = new URL('../web/landing.html', import.meta.url);
const STATIC_DIR_URL = new URL('../web/static/', import.meta.url);
const STATIC_RE = /^((?:[a-z0-9-]+\/)?[A-Za-z0-9_.-]+\.(css|js|woff2|svg|csv|txt))$/;
const STATIC_TYPES: Record<string, string> = {
  css: 'text/css; charset=utf-8',
  js: 'application/javascript; charset=utf-8',
  woff2: 'font/woff2',
  svg: 'image/svg+xml',
  csv: 'text/csv; charset=utf-8',
  txt: 'text/plain; charset=utf-8',
};
const VENDOR_GSAP_FILES = new Set(['gsap.min.js', 'ScrollTrigger.min.js']);
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const LIMIT_RE = /^\d+$/;

const MSG_TOO_LARGE = '파일이 너무 큽니다(최대 5MB)';
const MSG_BAD_ASOF = 'asOf 는 YYYY-MM-DD 형식이어야 합니다';
const MSG_BAD_LIMIT = 'limit 은 1~20 사이 정수여야 합니다';
const MSG_NO_UPLOAD = '아직 업로드된 매출이 없습니다';
const MSG_BAD_NOTICE = '알림 기록 형식이 잘못되었습니다';
const MSG_NOT_FOUND = 'not found';
const NOTICE_SOURCES = new Set(['draft', 'briefing']);
const FEATURE_IDS = new Set<string>(features.map((f) => f.id));
const PANEL_RE = /^\/features\/([^/]+)\/panel\.js$/;

function localToday(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

async function handleUpload(req: IncomingMessage, res: ServerResponse, url: URL, opts: HandlerOptions, today: () => string): Promise<void> {
  const asOfParam = url.searchParams.get('asOf');
  const body = await readBody(req, MAX_UPLOAD_BYTES);
  if (body === null) {
    sendJson(res, 413, { error: MSG_TOO_LARGE });
    return;
  }
  if (asOfParam !== null && asOfParam !== '' && !DATE_RE.test(asOfParam)) {
    sendJson(res, 400, { error: MSG_BAD_ASOF });
    return;
  }
  const asOf = asOfParam ? asOfParam : today();
  let parsed;
  try {
    parsed = parseSalesCsv(body, opts.salt);
  } catch (err) {
    if (err instanceof CsvFormatError) {
      sendJson(res, 400, { error: err.message });
      return;
    }
    throw err;
  }
  await saveLatest(opts.dataDir, parsed.transactions);
  const report = await applyAdjusters(parsed.transactions, opts.dataDir, asOf);
  const response: AdjustedUploadResponse = { ...report, skippedRows: parsed.skippedRows };
  sendJson(res, 200, response);
}

async function handleChurn(res: ServerResponse, url: URL, opts: HandlerOptions, today: () => string): Promise<void> {
  const asOfParam = url.searchParams.get('asOf');
  if (asOfParam !== null && asOfParam !== '' && !DATE_RE.test(asOfParam)) {
    sendJson(res, 400, { error: MSG_BAD_ASOF });
    return;
  }
  const limitParam = url.searchParams.get('limit');
  let limit = 5;
  if (limitParam !== null && limitParam !== '') {
    limit = LIMIT_RE.test(limitParam) ? Number(limitParam) : NaN;
    if (!(limit >= 1 && limit <= 20)) {
      sendJson(res, 400, { error: MSG_BAD_LIMIT });
      return;
    }
  }
  const report = await loadReport(opts.dataDir, asOfParam ? asOfParam : today(), { limit });
  if (report === null) {
    sendJson(res, 404, { error: MSG_NO_UPLOAD });
    return;
  }
  const tx = (await loadLatest(opts.dataDir)) ?? [];
  const visitsById = new Map(buildCustomerStats(tx).map((s) => [s.customerId, s.visitDays]));
  const rainDays = new Set((await loadWeather(opts.dataDir)).filter((d) => d.rainMm >= RAIN_MM).map((d) => d.date));
  const holidays = new Set<string>(HOLIDAYS_KR_2026);
  const withTimeline = (item: AdjustedCandidate): AdjustedCandidate & { timeline: VisitTimeline } => ({
    ...item,
    timeline: buildVisitTimeline(visitsById.get(item.customerId) ?? [], item.lastVisit, report.asOf, holidays, rainDays),
  });
  sendJson(res, 200, { ...report, candidates: report.candidates.map(withTimeline), heldBack: report.heldBack.map(withTimeline) });
}

function parseNotice(body: unknown, today: () => string): Notice | null {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;
  if (typeof b.customerId !== 'string' || b.customerId === '') return null;
  if (typeof b.cardLast2 !== 'string' || b.cardLast2 === '') return null;
  if (typeof b.source !== 'string' || !NOTICE_SOURCES.has(b.source)) return null;
  let noticedOn: string;
  if (b.noticedOn === undefined || b.noticedOn === null || b.noticedOn === '') noticedOn = today();
  else if (typeof b.noticedOn === 'string' && DATE_RE.test(b.noticedOn)) noticedOn = b.noticedOn;
  else return null;
  return { customerId: b.customerId, cardLast2: b.cardLast2, noticedOn, source: b.source as Notice['source'] };
}

async function handlePostNotice(req: IncomingMessage, res: ServerResponse, opts: HandlerOptions, today: () => string): Promise<void> {
  const text = await readBody(req, 1024 * 1024);
  let body: unknown = null;
  if (text !== null) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }
  const notice = parseNotice(body, today);
  if (notice === null) {
    sendJson(res, 400, { error: MSG_BAD_NOTICE });
    return;
  }
  sendJson(res, 200, await appendNotices(opts.dataDir, [notice]));
}

function sendHtml(res: ServerResponse, fileUrl: URL, fail: () => void): void {
  readFile(fileUrl, 'utf8').then(
    (html) => {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    },
    fail,
  );
}

function isNotFound(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  return code === 'ENOENT' || code === 'EISDIR' || code === 'ENOTDIR';
}

async function sendFile(res: ServerResponse, fileUrl: URL, contentType: string): Promise<void> {
  let body: Buffer;
  try {
    body = await readFile(fileUrl);
  } catch (err) {
    if (isNotFound(err)) {
      sendJson(res, 404, { error: MSG_NOT_FOUND });
      return;
    }
    throw err;
  }
  res.writeHead(200, { 'Content-Type': contentType });
  res.end(body);
}

async function handlePanel(res: ServerResponse, id: FeatureId): Promise<void> {
  const js = await readFile(new URL(`../features/${id}/panel.js`, import.meta.url), 'utf8');
  res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
  res.end(js);
}

export function createHandler(opts: HandlerOptions): (req: IncomingMessage, res: ServerResponse) => void {
  const today = opts.today ?? localToday;
  const allowReset = opts.allowReset === true;
  registerAllAdjusters();
  return (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const path = url.pathname;
    const fail = (): void => {
      if (!res.headersSent) sendJson(res, 500, { error: 'internal error' });
      else res.end();
    };
    if (req.method === 'GET' && path === '/health') {
      sendJson(res, 200, { ok: true });
      return;
    }
    if (req.method === 'GET' && path === '/') {
      sendHtml(res, LANDING_HTML_URL, fail);
      return;
    }
    if (req.method === 'GET' && (path === '/app' || path === '/app/')) {
      sendHtml(res, INDEX_HTML_URL, fail);
      return;
    }
    const rawPath = (req.url ?? '/').split('?')[0];
    if (req.method === 'GET' && (rawPath.startsWith('/static/') || path.startsWith('/static/'))) {
      const rel = rawPath.startsWith('/static/') ? rawPath.slice('/static/'.length) : '';
      const m = rawPath.includes('%') || rel.includes('..') ? null : STATIC_RE.exec(rel);
      if (m === null) {
        sendJson(res, 404, { error: MSG_NOT_FOUND });
        return;
      }
      sendFile(res, new URL(m[1], STATIC_DIR_URL), STATIC_TYPES[m[2]]).catch(fail);
      return;
    }
    if (req.method === 'GET' && path.startsWith('/vendor/')) {
      const file = path.startsWith('/vendor/gsap/') ? path.slice('/vendor/gsap/'.length) : '';
      if (!VENDOR_GSAP_FILES.has(file)) {
        sendJson(res, 404, { error: MSG_NOT_FOUND });
        return;
      }
      sendFile(res, new URL(`../../node_modules/gsap/dist/${file}`, import.meta.url), 'application/javascript; charset=utf-8').catch(fail);
      return;
    }
    if (req.method === 'POST' && path === '/api/upload') {
      handleUpload(req, res, url, opts, today).catch(fail);
      return;
    }
    if (req.method === 'GET' && path === '/api/churn') {
      handleChurn(res, url, opts, today).catch(fail);
      return;
    }
    if (req.method === 'GET' && path === '/api/status') {
      loadStatus(opts.dataDir).then((status) => sendJson(res, 200, status), fail);
      return;
    }
    if (req.method === 'GET' && path === '/api/notices') {
      loadNotices(opts.dataDir).then((list) => sendJson(res, 200, list), fail);
      return;
    }
    if (req.method === 'POST' && path === '/api/notices') {
      handlePostNotice(req, res, opts, today).catch(fail);
      return;
    }
    if (req.method === 'DELETE' && path === '/api/data') {
      if (!allowReset) {
        sendJson(res, 404, { error: MSG_NOT_FOUND });
        return;
      }
      clearDataDir(opts.dataDir).then(() => sendJson(res, 200, { ok: true }), fail);
      return;
    }
    const panel = req.method === 'GET' ? PANEL_RE.exec(path) : null;
    if (panel !== null) {
      if (!FEATURE_IDS.has(panel[1])) {
        sendJson(res, 404, { error: MSG_NOT_FOUND });
        return;
      }
      handlePanel(res, panel[1] as FeatureId).catch(fail);
      return;
    }
    const hit = matchRoute(featureRoutes, req.method ?? '', path);
    if (hit !== null) {
      const ctx = createRouteContext(req, res, { dataDir: opts.dataDir, salt: opts.salt, allowReset, today });
      hit.route.handle(ctx, hit.params).catch(fail);
      return;
    }
    sendJson(res, 404, { error: MSG_NOT_FOUND });
  };
}
