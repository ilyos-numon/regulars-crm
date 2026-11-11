import { createHash } from 'node:crypto';

export function normalizeCard(raw: string): string {
  return raw.replace(/[^0-9*]/g, '');
}

export function hashCard(raw: string, salt: string): string {
  return createHash('sha256').update(salt + normalizeCard(raw)).digest('hex');
}

export function cardLast2(raw: string): string {
  return raw.replace(/\D/g, '').slice(-2);
}
