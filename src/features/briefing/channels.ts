export interface BriefingPayload {
  text: string;
  sentAt: string;
  candidates: number;
  returned: number;
}

export type ChannelName = 'webhook' | 'telegram' | 'none';

export interface Channel {
  send(payload: BriefingPayload, env: NodeJS.ProcessEnv): Promise<void>;
}

async function postJson(url: string, body: unknown): Promise<void> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`push failed: ${String(res.status)}`);
}

export const webhookChannel: Channel = {
  async send(payload, env) {
    const url = env.PUSH_WEBHOOK_URL;
    if (!url) throw new Error('PUSH_WEBHOOK_URL is not set');
    await postJson(url, payload);
  },
};

export function telegramUrl(token: string): string {
  return `https://api.telegram.org/bot${token}/sendMessage`;
}

export const telegramChannel: Channel = {
  async send(payload, env) {
    const token = env.PUSH_TELEGRAM_TOKEN;
    const chatId = env.PUSH_TELEGRAM_CHAT_ID;
    if (!token || !chatId) throw new Error('telegram channel is not configured');
    await postJson(telegramUrl(token), { chat_id: chatId, text: payload.text });
  },
};

export const noneChannel: Channel = {
  async send() {
    // 전송하지 않는다
  },
};

export const channels: Record<ChannelName, Channel> = {
  webhook: webhookChannel,
  telegram: telegramChannel,
  none: noneChannel,
};

/** PUSH_CHANNEL 값. 비어 있으면 none, 모르는 값이면 throw. */
export function resolveChannel(env: NodeJS.ProcessEnv): ChannelName {
  const raw = (env.PUSH_CHANNEL ?? '').trim();
  if (raw === '') return 'none';
  if (raw === 'webhook' || raw === 'telegram' || raw === 'none') return raw;
  throw new Error(`unknown PUSH_CHANNEL: ${raw}`);
}

/** 채널로 보낸다. 실패하면 throw. 성공 시 사용한 채널 이름. */
export async function sendBriefing(payload: BriefingPayload, env: NodeJS.ProcessEnv = process.env): Promise<ChannelName> {
  const name = resolveChannel(env);
  await channels[name].send(payload, env);
  return name;
}
