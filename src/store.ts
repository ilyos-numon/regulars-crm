import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Transaction } from './domain/types.ts';

interface LatestFile {
  uploadedAt: string;
  transactions: Transaction[];
}

export async function saveLatest(dataDir: string, tx: Transaction[]): Promise<void> {
  await mkdir(dataDir, { recursive: true });
  const body: LatestFile = { uploadedAt: new Date().toISOString(), transactions: tx };
  await writeFile(join(dataDir, 'latest.json'), JSON.stringify(body), 'utf8');
}

export async function loadLatest(dataDir: string): Promise<Transaction[] | null> {
  let raw: string;
  try {
    raw = await readFile(join(dataDir, 'latest.json'), 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
  return (JSON.parse(raw) as LatestFile).transactions;
}
