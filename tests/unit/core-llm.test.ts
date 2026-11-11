import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateText } from '../../src/core/llm.ts';

const OPTS = { system: '시스템', user: '사용자', maxTokens: 100 };
const ENV = { LLM_API_KEY: 'test-key', LLM_BASE_URL: 'http://localhost:9/v1', LLM_MODEL: 'test-model' };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('generateText', () => {
  it('returns template without calling fetch when key is missing', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await generateText(OPTS, {})).toEqual({ text: null, source: 'template' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns model text on 200 and sends an OpenAI-compatible request', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: '안녕하세요' } }] }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    expect(await generateText(OPTS, ENV)).toEqual({ text: '안녕하세요', source: 'model' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://localhost:9/v1/chat/completions');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer test-key');
    expect(JSON.parse(init.body as string)).toEqual({
      model: 'test-model',
      messages: [
        { role: 'system', content: '시스템' },
        { role: 'user', content: '사용자' },
      ],
      max_tokens: 100,
    });
  });

  it('uses default base url and model when not set', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: 'x' } }] }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    await generateText(OPTS, { LLM_API_KEY: 'k' });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions');
    expect(JSON.parse(init.body as string).model).toBe('qwen3.7-flash');
  });

  it('defaults to qwen3.7-flash with enable_thinking false on the DashScope endpoint', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: 'x' } }] }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    await generateText(OPTS, { LLM_API_KEY: 'k' });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('qwen3.7-flash');
    expect(body.enable_thinking).toBe(false);
  });

  it('omits enable_thinking for a non-DashScope base url', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: 'x' } }] }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    await generateText(OPTS, { LLM_API_KEY: 'k', LLM_BASE_URL: 'http://localhost:9/v1' });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect('enable_thinking' in JSON.parse(init.body as string)).toBe(false);
  });

  it('uses LLM_MODEL when set, keeping enable_thinking false on an uppercase DashScope url', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: 'x' } }] }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    await generateText(OPTS, {
      LLM_API_KEY: 'k',
      LLM_BASE_URL: 'https://DashScope-intl.aliyuncs.com/compatible-mode/v1',
      LLM_MODEL: 'qwen-max',
    });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('qwen-max');
    expect(body.enable_thinking).toBe(false);
  });

  it('returns template on non-2xx', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 500 })));
    expect(await generateText(OPTS, ENV)).toEqual({ text: null, source: 'template' });
  });

  it('returns template when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network'); }));
    expect(await generateText(OPTS, ENV)).toEqual({ text: null, source: 'template' });
  });

  it('returns template on timeout via AbortController', async () => {
    let aborted = false;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => {
              aborted = true;
              reject(new DOMException('aborted', 'AbortError'));
            });
          }),
      ),
    );
    expect(await generateText({ ...OPTS, timeoutMs: 20 }, ENV)).toEqual({ text: null, source: 'template' });
    expect(aborted).toBe(true);
  });
});
