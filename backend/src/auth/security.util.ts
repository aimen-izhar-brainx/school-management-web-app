import { createHash, randomBytes } from 'node:crypto';

export function generateRawToken(): string {
  return randomBytes(32).toString('hex');
}

export function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

const PASSWORD_RULES: ((value: string) => boolean)[] = [
  (value) => value.length >= 8,
  (value) => /[a-z]/.test(value) && /[A-Z]/.test(value),
  (value) => /\d/.test(value),
  (value) => /[^A-Za-z0-9]/.test(value),
];

/** Mirrors frontend/src/lib/password.ts — keep both in sync. */
export function meetsPasswordRules(value: string): boolean {
  return PASSWORD_RULES.every((rule) => rule(value));
}
