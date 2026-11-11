import { readJsonFile, writeJsonFile } from '../../core/json-store.ts';
import { appendNotices, loadNotices } from '../../core/notices.ts';
import { loadReport } from '../../core/pipeline.ts';
import { addDays, computeReturns, latestNoticePerCustomer } from '../../core/returns.ts';
import { formatCandidateLine } from '../../domain/churn.ts';
import type { ChurnCandidate, Notice, Transaction } from '../../domain/types.ts';
import { loadLatest } from '../../store.ts';
import { type ChannelName, sendBriefing } from './channels.ts';

export const HISTORY_FILE = 'briefing-history.json';
export const MSG_SEND_FAILED = '브리핑을 보내지 못했습니다';

export interface BriefingRecord {
  sentAt: string;
  asOf: string;
  candidates: number;
  returned: number;
  channel: ChannelName;
}

export interface Briefing {
  asOf: string;
  text: string;
  candidates: number;
  returned: number;
  list: ChurnCandidate[];
}

export function composeBriefingText(candidates: ChurnCandidate[], returned: number): string {
  const head = candidates.length === 0 ? '이번 주 챙길 단골이 없습니다' : `이번 주 챙길 단골 ${String(candidates.length)}명`;
  return [head, ...candidates.map(formatCandidateLine), `지난주 돌아온 단골 ${String(returned)}명`].join('\n');
}

/** 알림 뒤 돌아온 날이 (asOf-7, asOf] 안에 있는 단골 수 */
export function countReturnedLastWeek(tx: Transaction[], notices: Notice[], asOf: string): number {
  const from = addDays(asOf, -7);
  return computeReturns(tx, latestNoticePerCustomer(notices), asOf).filter(
    (o) => o.returnedOn !== null && o.returnedOn > from && o.returnedOn <= asOf,
  ).length;
}

/** 업로드 전이면 null */
export async function buildBriefing(dataDir: string, asOf: string): Promise<Briefing | null> {
  const tx = await loadLatest(dataDir);
  if (tx === null) return null;
  const report = await loadReport(dataDir, asOf);
  if (report === null) return null;
  const returned = countReturnedLastWeek(tx, await loadNotices(dataDir), asOf);
  return {
    asOf,
    text: composeBriefingText(report.candidates, returned),
    candidates: report.candidates.length,
    returned,
    list: report.candidates,
  };
}

export async function loadHistory(dataDir: string): Promise<BriefingRecord[]> {
  return readJsonFile<BriefingRecord[]>(dataDir, HISTORY_FILE, []);
}

/** 최신순 */
export async function listHistory(dataDir: string): Promise<BriefingRecord[]> {
  const all = await loadHistory(dataDir);
  return [...all].sort((a, b) => (a.sentAt < b.sentAt ? 1 : a.sentAt > b.sentAt ? -1 : 0));
}

/** 보내고, 성공하면 알림·기록을 남긴다. 전송 실패는 throw (알림·기록 없음). */
export async function deliverBriefing(
  dataDir: string,
  briefing: Briefing,
  sentAt: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<BriefingRecord> {
  const channel = await sendBriefing(
    { text: briefing.text, sentAt, candidates: briefing.candidates, returned: briefing.returned },
    env,
  );
  if (briefing.list.length > 0) {
    await appendNotices(
      dataDir,
      briefing.list.map((c) => ({ customerId: c.customerId, cardLast2: c.cardLast2, noticedOn: briefing.asOf, source: 'briefing' as const })),
    );
  }
  const record: BriefingRecord = {
    sentAt,
    asOf: briefing.asOf,
    candidates: briefing.candidates,
    returned: briefing.returned,
    channel,
  };
  await writeJsonFile(dataDir, HISTORY_FILE, [...(await loadHistory(dataDir)), record]);
  return record;
}
