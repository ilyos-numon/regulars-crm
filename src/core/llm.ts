import type { LlmResult } from '../domain/types.ts';

export interface LlmOptions { system: string; user: string; maxTokens?: number; timeoutMs?: number /* 기본 8000 */; }

const DEFAULT_BASE_URL = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';
const DEFAULT_MODEL = 'qwen3.7-flash';
const TEMPLATE: LlmResult = { text: null, source: 'template' };

interface ChatResponse { choices?: { message?: { content?: unknown } }[]; }

export async function generateText(opts: LlmOptions, env: NodeJS.ProcessEnv = process.env): Promise<LlmResult> {
  const key = env.LLM_API_KEY;
  if (!key) return { ...TEMPLATE };
  const base = (env.LLM_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
  const model = env.LLM_MODEL || DEFAULT_MODEL;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 8000);
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: opts.system },
          { role: 'user', content: opts.user },
        ],
        max_tokens: opts.maxTokens ?? 512,
        ...(base.toLowerCase().includes('dashscope') ? { enable_thinking: false } : {}),
      }),
      signal: controller.signal,
    });
    if (!res.ok) return { ...TEMPLATE };
    const body = (await res.json()) as ChatResponse;
    const text = body.choices?.[0]?.message?.content;
    if (typeof text !== 'string' || text.trim() === '') return { ...TEMPLATE };
    return { text, source: 'model' };
  } catch {
    return { ...TEMPLATE };
  } finally {
    clearTimeout(timer);
  }
}
