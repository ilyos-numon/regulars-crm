import type { Notice } from '../domain/types.ts';
import { readJsonFile, writeJsonFile } from './json-store.ts';

const FILE = 'notices.json';

export async function loadNotices(dataDir: string): Promise<Notice[]> {
  return readJsonFile<Notice[]>(dataDir, FILE, []);
}

export async function appendNotices(dataDir: string, items: Notice[]): Promise<Notice[]> {
  const all = [...(await loadNotices(dataDir)), ...items];
  await writeJsonFile(dataDir, FILE, all);
  return all;
}
