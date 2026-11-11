import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHandler } from '../../src/http/handler.ts';

const sampleBytes = readFileSync(new URL('../fixtures/sales-sample.csv', import.meta.url));

let server: http.Server;
let base: string;
let dataDir: string;

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'regulars-static-'));
  server = http.createServer(createHandler({ dataDir, salt: 't', today: () => '2026-10-27' }));
  await new Promise<void>((resolve) => server.listen(0, resolve));
  base = `http://localhost:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  rmSync(dataDir, { recursive: true, force: true });
});

// fetch 는 경로의 `..` 를 정규화하므로 원시 경로는 http.request 로 보낸다.
function rawGet(path: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(`${base}${path}`, { method: 'GET', path }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => (body += chunk));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

async function expectNotFound(path: string): Promise<void> {
  const res = await rawGet(path);
  expect(res.status).toBe(404);
  expect(JSON.parse(res.body)).toEqual({ error: 'not found' });
}

describe('landing and app routes', () => {
  it('GET / → landing html', async () => {
    const res = await fetch(`${base}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8');
    const html = await res.text();
    expect(html).toContain('data-testid="landing"');
    expect(html).not.toContain('data-testid="tabs"');
  });

  it('GET /app → app html', async () => {
    const res = await fetch(`${base}/app`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(await res.text()).toContain('data-testid="tabs"');
  });

  it('GET /app/ → app html', async () => {
    const res = await fetch(`${base}/app/`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(await res.text()).toContain('data-testid="tabs"');
  });

  it('POST / → 404', async () => {
    const res = await fetch(`${base}/`, { method: 'POST', body: 'x' });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not found' });
  });
});

describe('static files', () => {
  it('GET /static/sample/sales-sample.csv → csv identical to fixture', async () => {
    const res = await fetch(`${base}/static/sample/sales-sample.csv`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    expect(Buffer.from(await res.arrayBuffer()).equals(sampleBytes)).toBe(true);
  });

  it('GET /static/fonts/Galmuri11.woff2 → font/woff2', async () => {
    const res = await fetch(`${base}/static/fonts/Galmuri11.woff2`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('font/woff2');
    expect((await res.arrayBuffer()).byteLength).toBeGreaterThan(0);
  });

  it('GET /static/fonts/OFL-Galmuri.txt → text/plain', async () => {
    const res = await fetch(`${base}/static/fonts/OFL-Galmuri.txt`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/plain; charset=utf-8');
  });

  it('GET /static/../package.json → 404', async () => {
    await expectNotFound('/static/../package.json');
  });

  it('GET /static/%2e%2e/package.json → 404', async () => {
    await expectNotFound('/static/%2e%2e/package.json');
  });

  it('GET /static/nope.css → 404', async () => {
    await expectNotFound('/static/nope.css');
  });

  it('GET /static/x.exe → 404', async () => {
    await expectNotFound('/static/x.exe');
  });

  it('GET /static/a/b/c.css (too deep) → 404', async () => {
    await expectNotFound('/static/a/b/c.css');
  });
});

describe('vendor gsap', () => {
  for (const file of ['gsap.min.js', 'ScrollTrigger.min.js']) {
    it(`GET /vendor/gsap/${file} → javascript with version`, async () => {
      const res = await fetch(`${base}/vendor/gsap/${file}`);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('application/javascript; charset=utf-8');
      expect(await res.text()).toContain('3.15.1');
    });
  }

  it('GET /vendor/gsap/index.js → 404', async () => {
    await expectNotFound('/vendor/gsap/index.js');
  });
});
