import { randomBytes } from 'node:crypto';
import { readdir, readFile, rm, stat } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { join } from 'node:path';
import { createHandler, type HandlerOptions } from './handler.ts';

export const DEMO_COOKIE = 'rc_demo';
export const VISITOR_ID_RE = /^[a-f0-9]{32}$/;
export const VISITORS_SUBDIR = 'visitors';

export interface DemoOptions {
  rootDir: string;
  ttlMs: number;
  sweepMs: number;
  maxVisitors: number;
}

const DEFAULT_TTL_HOURS = 24;
const DEFAULT_SWEEP_MINUTES = 30;
const DEFAULT_MAX_VISITORS = 100;

const INDEX_HTML_URL = new URL('../web/index.html', import.meta.url);

function positiveNumber(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function readDemoOptions(env: NodeJS.ProcessEnv, rootDir: string): DemoOptions | null {
  if (env.REGULARS_DEMO_MODE !== '1') return null;
  const ttlHours = positiveNumber(env.REGULARS_DEMO_TTL_HOURS, DEFAULT_TTL_HOURS);
  const sweepMinutes = positiveNumber(env.REGULARS_DEMO_SWEEP_MINUTES, DEFAULT_SWEEP_MINUTES);
  const maxRaw = Math.floor(positiveNumber(env.REGULARS_DEMO_MAX_VISITORS, DEFAULT_MAX_VISITORS));
  const maxVisitors = maxRaw >= 1 ? maxRaw : DEFAULT_MAX_VISITORS;
  return { rootDir, ttlMs: ttlHours * 3_600_000, sweepMs: sweepMinutes * 60_000, maxVisitors };
}

export function visitorIdFrom(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() !== DEMO_COOKIE) continue;
    const value = part.slice(eq + 1).trim();
    return VISITOR_ID_RE.test(value) ? value : null;
  }
  return null;
}

export function newVisitorId(): string {
  return randomBytes(16).toString('hex');
}

export function visitorCookie(id: string, ttlSec: number, secure: boolean): string {
  return `${DEMO_COOKIE}=${id}; Path=/; Max-Age=${ttlSec}; HttpOnly; SameSite=Lax` + (secure ? '; Secure' : '');
}

export const UPLOAD_NOTE_MARKER = '<form id="upload-form">';

function uploadNote(ttlHours: number): string {
  const hours = String(ttlHours);
  return `<p class="demo-upload-note" data-testid="demo-upload-note" role="note">데모에는 예시 파일만 올려 주세요. 올린 매출은 이 브라우저에서만 보이고 늦어도 ${hours}시간 뒤 지워집니다.</p>`;
}

export function injectUploadNote(html: string, ttlHours: number): string {
  const at = html.indexOf(UPLOAD_NOTE_MARKER);
  if (at < 0) return html;
  return html.slice(0, at) + uploadNote(ttlHours) + '\n    ' + html.slice(at);
}

async function lastActivity(dir: string): Promise<number> {
  let latest = (await stat(dir)).mtimeMs;
  const entries = await readdir(dir);
  for (const name of entries) {
    try {
      const s = await stat(join(dir, name));
      if (s.mtimeMs > latest) latest = s.mtimeMs;
    } catch {
      // 파일이 그 사이 지워졌으면 건너뛴다
    }
  }
  return latest;
}

export async function sweepVisitors(
  rootDir: string,
  ttlMs: number,
  maxVisitors: number,
  now: number,
): Promise<{ removed: string[]; kept: number }> {
  const visitorsDir = join(rootDir, VISITORS_SUBDIR);
  let entries;
  try {
    entries = await readdir(visitorsDir, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { removed: [], kept: 0 };
    throw err;
  }
  const alive: { id: string; at: number }[] = [];
  const removed: string[] = [];
  for (const e of entries) {
    if (!e.isDirectory() || !VISITOR_ID_RE.test(e.name)) continue;
    const dir = join(visitorsDir, e.name);
    let at: number;
    try {
      at = await lastActivity(dir);
    } catch {
      continue;
    }
    if (now - at > ttlMs) {
      await rm(dir, { recursive: true, force: true });
      removed.push(e.name);
    } else {
      alive.push({ id: e.name, at });
    }
  }
  if (alive.length > maxVisitors) {
    alive.sort((a, b) => a.at - b.at);
    const excess = alive.splice(0, alive.length - maxVisitors);
    for (const v of excess) {
      await rm(join(visitorsDir, v.id), { recursive: true, force: true });
      removed.push(v.id);
    }
  }
  return { removed, kept: alive.length };
}

export interface DemoServer {
  handle: (req: IncomingMessage, res: ServerResponse) => void;
  stop: () => void;
}

function isSharedPath(path: string): boolean {
  return path === '/health' || path.startsWith('/static/') || path.startsWith('/vendor/');
}

export function createDemoHandler(base: Omit<HandlerOptions, 'dataDir'>, demo: DemoOptions): DemoServer {
  const shared = createHandler({ ...base, dataDir: demo.rootDir });
  const ttlSec = Math.round(demo.ttlMs / 1000);
  const ttlHours = demo.ttlMs / 3_600_000;
  const sweep = (): void => {
    sweepVisitors(demo.rootDir, demo.ttlMs, demo.maxVisitors, Date.now()).catch(() => {});
  };
  sweep();
  const timer = setInterval(sweep, demo.sweepMs);
  timer.unref();

  const handle = (req: IncomingMessage, res: ServerResponse): void => {
    const path = new URL(req.url ?? '/', 'http://localhost').pathname;
    if (isSharedPath(path)) {
      shared(req, res);
      return;
    }
    const known = visitorIdFrom(req.headers.cookie);
    const id = known ?? newVisitorId();
    if (known === null) {
      res.setHeader('Set-Cookie', visitorCookie(id, ttlSec, req.headers['x-forwarded-proto'] === 'https'));
    }
    if (req.method === 'GET' && (path === '/app' || path === '/app/')) {
      readFile(INDEX_HTML_URL, 'utf8').then(
        (html) => {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(injectUploadNote(html, ttlHours));
        },
        () => {
          if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ error: 'internal error' }));
          } else res.end();
        },
      );
      return;
    }
    createHandler({ ...base, dataDir: join(demo.rootDir, VISITORS_SUBDIR, id) })(req, res);
  };

  return { handle, stop: () => clearInterval(timer) };
}
