import { generateText } from '../../core/llm.ts';
import { daysBetween } from '../../domain/churn.ts';
import type { CustomerStats } from '../../domain/types.ts';

export const TONES = ['정중한', '친근한', '짧은'] as const;
export type Tone = (typeof TONES)[number];
export const BANNED_WORDS = ['쿠폰', '할인', '이벤트', '증정', '적립', '무료', '세일', '특가'];
export const SOURCE_TEMPLATE = '기본 문구';
export const SOURCE_MODEL = 'AI 문구';
export const DEFAULT_ITEM = '자주 드시던 메뉴';
export const DEFAULT_STORE_NAME = '저희 가게';

export type DraftSource = typeof SOURCE_TEMPLATE | typeof SOURCE_MODEL;
export interface DraftItem { tone: Tone; text: string; }
export interface DraftSet { source: DraftSource; drafts: DraftItem[]; }

// 모델에 보내는 값은 이 다섯 개뿐이다 (손님 식별값·원본 카드번호는 넣지 않는다).
export interface DraftInput {
  cardLast2: string;
  topItem: string | null;
  avgIntervalDays: number | null;
  daysSinceLast: number;
  storeName: string;
}

export const SYSTEM_PROMPT = [
  '당신은 동네 가게 사장님이 오랜만에 뜸한 단골에게 보낼 안부 문구를 쓰는 도우미입니다.',
  '규칙:',
  '- 쿠폰·할인·이벤트·증정·적립·무료·세일·특가 같은 혜택 유도 표현은 절대 쓰지 않는다.',
  '- 존댓말로 쓴다.',
  '- 각 문구는 60자 이내.',
  '- 정중한, 친근한, 짧은 순서로 3개를 쓴다.',
  '- 답은 문자열 JSON 배열 3개 항목 하나만 출력한다(JSON 배열 3개 외 다른 글 금지). 예: ["...", "...", "..."]',
].join('\n');

export function templateText(tone: Tone, topItem: string | null, daysSinceLast: number): string {
  const item = topItem ?? DEFAULT_ITEM;
  if (tone === '정중한') {
    return `안녕하세요. 평소 ${item} 자주 찾아 주셨는데 ${daysSinceLast}일째 뵙지 못해 안부 여쭙니다. 별일 없으시죠? 언제든 편하게 들러 주세요.`;
  }
  if (tone === '친근한') {
    return `요즘 통 안 보이셔서 궁금했어요! ${item} 생각나실 때 편하게 들러 주세요. 늘 그 자리에 있을게요.`;
  }
  return `잘 지내시죠? ${item} 준비해 두고 기다리고 있을게요.`;
}

export function buildDraftInput(stats: CustomerStats, asOf: string, storeName: string): DraftInput {
  return {
    cardLast2: stats.cardLast2,
    topItem: stats.topItem,
    avgIntervalDays: stats.avgIntervalDays,
    daysSinceLast: daysBetween(stats.lastVisit, asOf),
    storeName,
  };
}

export function containsBanned(text: string): boolean {
  return BANNED_WORDS.some((w) => text.includes(w));
}

// 모델 답을 톤별 문구로 바꾼다. JSON 배열 3개가 아니면 전부 null, 금지어가 든 칸은 null.
export function parseModelDrafts(text: string | null): (string | null)[] {
  const none = [null, null, null];
  if (text === null) return none;
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start < 0 || end <= start) return none;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return none;
  }
  if (!Array.isArray(parsed) || parsed.length !== 3) return none;
  return parsed.map((v) => {
    if (typeof v !== 'string') return null;
    const t = v.trim();
    if (t === '' || containsBanned(t)) return null;
    return t;
  });
}

export function composeDrafts(input: DraftInput, modelText: string | null): DraftSet {
  const fromModel = parseModelDrafts(modelText);
  let everyFromModel = true;
  const drafts = TONES.map((tone, i) => {
    const m = fromModel[i];
    if (m === null) {
      everyFromModel = false;
      return { tone, text: templateText(tone, input.topItem, input.daysSinceLast) };
    }
    return { tone, text: m };
  });
  return { source: everyFromModel ? SOURCE_MODEL : SOURCE_TEMPLATE, drafts };
}

export type Generate = typeof generateText;

export async function makeDrafts(
  input: DraftInput,
  env: NodeJS.ProcessEnv = process.env,
  generate: Generate = generateText,
): Promise<DraftSet> {
  const result = await generate({ system: SYSTEM_PROMPT, user: JSON.stringify(input), maxTokens: 400 }, env);
  return composeDrafts(input, result.source === 'model' ? result.text : null);
}
