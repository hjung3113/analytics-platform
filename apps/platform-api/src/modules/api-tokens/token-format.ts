// API token value format (ADR-0116 decision 7; `v0`, provisional, may change without compatibility):
//   ap_<prefix>_<secret>
//   prefix = 8 lowercase hex chars (stored, shown in lists); secret = 32 CSPRNG bytes as base64url (43 chars).
// Only the SHA-256 (hex) of the whole value is stored. The value is a long random lookup key, so no slow hash.

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const TOKEN_PATTERN = /^ap_([0-9a-f]{8})_([A-Za-z0-9_-]{43,})$/;

export function generateToken(): { value: string; prefix: string; hash: string } {
  const prefix = randomBytes(4).toString('hex');
  const secret = randomBytes(32).toString('base64url');
  const value = `ap_${prefix}_${secret}`;
  return { value, prefix, hash: hashToken(value) };
}

export function hashToken(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** The prefix of a well-formed value, else null. Never returns any part of the secret. */
export function parseTokenPrefix(value: string): string | null {
  const m = TOKEN_PATTERN.exec(value);
  return m?.[1] ?? null;
}

export function hashesEqual(a: string, b: string): boolean {
  const x = Buffer.from(a, 'hex');
  const y = Buffer.from(b, 'hex');
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}

/**
 * `Authorization: Bearer <value>` → value; null only when the header has no Bearer scheme at all. A Bearer scheme with
 * no, blank or malformed credential returns '' (or the junk), so the caller treats it as a failed token authentication
 * and never falls back to the cookie.
 */
export function bearerValue(header: unknown): string | null {
  if (typeof header !== 'string') return null;
  const m = /^Bearer(?:[ \t]+(.*))?$/i.exec(header);
  return m ? (m[1] ?? '').trim() : null;
}
