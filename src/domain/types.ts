export interface Transaction {
  customerId: string;      // sha256(salt + cardNormalized) hex, 64자
  cardLast2: string;       // "31"
  date: string;            // "YYYY-MM-DD"
  time: string;            // "HH:mm"
  amount: number;
  item: string | null;
}
export interface ParseResult { transactions: Transaction[]; skippedRows: number; }
export interface CustomerStats {
  customerId: string; cardLast2: string;
  visitDays: string[];          // 오름차순 고유 날짜
  avgIntervalDays: number | null; // 방문일 2개 미만이면 null, 소수 1자리 반올림
  lastVisit: string; topItem: string | null;
}
export interface ChurnCandidate {
  customerId: string; cardLast2: string; topItem: string | null;
  avgIntervalDays: number; daysSinceLast: number; delayRatio: number; lastVisit: string;
}
export interface ChurnReport {
  asOf: string; transactions: number; customers: number; regulars: number;
  candidates: ChurnCandidate[];
}
export interface UploadResponse extends ChurnReport { skippedRows: number; }
export interface ScoreOptions { limit?: number; minRatio?: number; maxAvgInterval?: number; minVisits?: number; }
// 기본값: limit 5, minRatio 2.0, maxAvgInterval 15, minVisits 3

export type FeatureId = 'profile' | 'hint' | 'draft' | 'memos' | 'briefing' | 'returns' | 'reviews' | 'weather';
export interface Adjustment { source: FeatureId; note: string; hold: boolean; }
export interface AdjustedCandidate extends ChurnCandidate { adjustments: Adjustment[]; }
export interface AdjustedReport extends ChurnReport { candidates: AdjustedCandidate[]; heldBack: AdjustedCandidate[]; }
export interface AdjustedUploadResponse extends AdjustedReport { skippedRows: number; }
export interface AdjustContext { dataDir: string; asOf: string; stats: CustomerStats[]; transactions: Transaction[]; }
export type AdjusterFn = (c: ChurnCandidate) => Adjustment | null;
export interface Adjuster { id: FeatureId; prepare(ctx: AdjustContext): Promise<AdjusterFn>; }
export type NoticeSource = 'draft' | 'briefing';
export interface Notice { customerId: string; cardLast2: string; noticedOn: string; source: NoticeSource; }
export type ReturnStatus = 'returned' | 'pending' | 'not_returned';
export interface NoticeOutcome { customerId: string; cardLast2: string; noticedOn: string; source: NoticeSource; returnedOn: string | null; status: ReturnStatus; }
export interface DataStatus { hasUpload: boolean; uploadedAt: string | null; transactions: number; customers: number; regulars: number; notices: number; memos: number; reviews: number; weatherDays: number; }
export interface LlmResult { text: string | null; source: 'model' | 'template'; }
export type RouteMethod = 'GET' | 'POST' | 'DELETE';
export interface RouteContext {
  dataDir: string; salt: string; allowReset: boolean; today(): string; url: URL;
  readText(maxBytes: number): Promise<string | null>;   // 한도 초과 null
  readJson<T>(maxBytes?: number): Promise<T | null>;    // 파싱 실패·초과 null (기본 1MB)
  sendJson(status: number, body: unknown): void;
}
export interface Route { method: RouteMethod; path: string; handle(ctx: RouteContext, params: Record<string, string>): Promise<void>; }
// path: '/api/profile/:id' 처럼 마지막 세그먼트 하나만 ':id' 허용. 나머지는 정확 일치.
export interface FeatureModule { id: FeatureId; routes: Route[]; adjusters: Adjuster[]; }
