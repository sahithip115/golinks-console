import { createHash, randomInt, randomUUID } from 'node:crypto';

/** Codes avoid characters that are easy to confuse when read aloud (0/o, 1/l). */
const CODE_SYMBOLS = 'abcdefghijkmnopqrstuvwxyz23456789';

export function newId(): string {
  return randomUUID();
}

export function randomCode(length = 7): string {
  let code = '';
  for (let index = 0; index < length; index += 1) {
    code += CODE_SYMBOLS[randomInt(CODE_SYMBOLS.length)];
  }
  return code;
}

/**
 * Truncated SHA-256. Stable enough to count distinct visitors, useless for
 * identifying one — the raw address or agent never reaches storage.
 */
export function fingerprint(value: string | undefined | null): string | null {
  if (!value || value.trim() === '') return null;
  return createHash('sha256').update(value, 'utf8').digest('hex').slice(0, 32);
}

export function digest(content: string, length = 40): string {
  return createHash('sha256').update(content, 'utf8').digest('hex').slice(0, length);
}
