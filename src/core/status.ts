import { scoreChurn } from '../domain/churn.ts';
import type { DataStatus, Transaction } from '../domain/types.ts';
import { readJsonFile } from './json-store.ts';

interface LatestFile { uploadedAt?: string; transactions?: Transaction[]; }

function count(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  if (value !== null && typeof value === 'object') return Object.keys(value).length;
  return 0;
}

export async function loadStatus(dataDir: string): Promise<DataStatus> {
  const latest = await readJsonFile<LatestFile | null>(dataDir, 'latest.json', null);
  const tx = latest?.transactions ?? null;
  let customers = 0;
  let regulars = 0;
  if (tx !== null) {
    // 단골 수는 기준일과 무관하므로 마지막 거래일을 기준일로 쓴다.
    const lastDate = tx.reduce((max, t) => (t.date > max ? t.date : max), '');
    const report = scoreChurn(tx, lastDate || new Date().toISOString().slice(0, 10));
    customers = report.customers;
    regulars = report.regulars;
  }
  return {
    hasUpload: tx !== null,
    uploadedAt: latest?.uploadedAt ?? null,
    transactions: tx?.length ?? 0,
    customers,
    regulars,
    notices: count(await readJsonFile<unknown>(dataDir, 'notices.json', [])),
    memos: count(await readJsonFile<unknown>(dataDir, 'memos.json', {})),
    reviews: count(await readJsonFile<unknown>(dataDir, 'reviews.json', [])),
    weatherDays: count(await readJsonFile<unknown>(dataDir, 'weather.json', [])),
  };
}
