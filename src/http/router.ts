import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Route, RouteContext } from '../domain/types.ts';

const DEFAULT_JSON_BYTES = 1024 * 1024;

export function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

// 본문을 끝까지 읽는다. 한도를 넘으면 나머지는 버리고 null 을 돌려준다.
export function readBody(req: IncomingMessage, maxBytes: number): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let tooLarge = false;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) {
        tooLarge = true;
        chunks.length = 0;
        return;
      }
      if (!tooLarge) chunks.push(chunk);
    });
    req.on('end', () => resolve(tooLarge ? null : Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

// path 는 정확 일치, 또는 마지막 세그먼트 하나만 ':name' 으로 받는다.
export function matchRoute(
  routes: Route[],
  method: string,
  pathname: string,
): { route: Route; params: Record<string, string> } | null {
  for (const route of routes) {
    if (route.method !== method) continue;
    if (route.path === pathname) return { route, params: {} };
  }
  for (const route of routes) {
    if (route.method !== method) continue;
    const cut = route.path.lastIndexOf('/');
    const last = route.path.slice(cut + 1);
    if (!last.startsWith(':')) continue;
    const prefix = route.path.slice(0, cut + 1);
    if (!pathname.startsWith(prefix)) continue;
    const rest = pathname.slice(prefix.length);
    if (rest === '' || rest.includes('/')) continue;
    let value: string;
    try {
      value = decodeURIComponent(rest);
    } catch {
      continue;
    }
    return { route, params: { [last.slice(1)]: value } };
  }
  return null;
}

export function createRouteContext(
  req: IncomingMessage,
  res: ServerResponse,
  opts: { dataDir: string; salt: string; allowReset: boolean; today: () => string },
): RouteContext {
  const url = new URL(req.url ?? '/', 'http://localhost');
  return {
    dataDir: opts.dataDir,
    salt: opts.salt,
    allowReset: opts.allowReset,
    today: opts.today,
    url,
    readText: (maxBytes: number) => readBody(req, maxBytes),
    async readJson<T>(maxBytes = DEFAULT_JSON_BYTES): Promise<T | null> {
      const text = await readBody(req, maxBytes);
      if (text === null) return null;
      try {
        return JSON.parse(text) as T;
      } catch {
        return null;
      }
    },
    sendJson: (status: number, body: unknown) => sendJson(res, status, body),
  };
}
