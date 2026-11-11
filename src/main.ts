import http from 'node:http';
import { createHandler } from './http/handler.ts';
import { createDemoHandler, readDemoOptions } from './http/demo.ts';
import { resolveToday } from './core/today.ts';

const port = Number(process.env.PORT ?? '8790');
const dataDir = process.env.REGULARS_DATA_DIR ?? 'data';
let salt = process.env.REGULARS_HASH_SALT;
if (!salt) {
  salt = 'dev-salt';
  process.stderr.write('[warn] REGULARS_HASH_SALT not set, using dev-salt\n');
}

const today = resolveToday(process.env);
const handlerOptions = { dataDir, salt, allowReset: process.env.REGULARS_ALLOW_RESET === '1', ...(today ? { today } : {}) };

const demo = readDemoOptions(process.env, dataDir);
const demoServer = demo
  ? createDemoHandler({ salt, allowReset: handlerOptions.allowReset, ...(today ? { today } : {}) }, demo)
  : null;

const httpServer = http.createServer(demoServer ? demoServer.handle : createHandler(handlerOptions)).listen(port, () => {
  process.stdout.write(`regulars-crm listening on http://localhost:${port}\n`);
  if (demo) {
    process.stdout.write(`[demo] visitor data under ${dataDir}/visitors, kept ${String(demo.ttlMs / 3_600_000)}h\n`);
  }
});

const shutdown = (): void => {
  demoServer?.stop();
  setTimeout(() => process.exit(0), 1000).unref();
  httpServer.close(() => process.exit(0));
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
