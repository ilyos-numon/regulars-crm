import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function readJsonFile<T>(dataDir: string, name: string, fallback: T): Promise<T> {
  let raw: string;
  try {
    raw = await readFile(join(dataDir, name), 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return fallback;
    throw err;
  }
  return JSON.parse(raw) as T;
}

export async function writeJsonFile(dataDir: string, name: string, value: unknown): Promise<void> {
  await mkdir(dataDir, { recursive: true });
  await writeFile(join(dataDir, name), JSON.stringify(value), 'utf8');
}

export async function clearDataDir(dataDir: string): Promise<void> {
  let entries;
  try {
    entries = await readdir(dataDir, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw err;
  }
  for (const e of entries) {
    if (e.isFile()) await rm(join(dataDir, e.name), { force: true });
  }
}
