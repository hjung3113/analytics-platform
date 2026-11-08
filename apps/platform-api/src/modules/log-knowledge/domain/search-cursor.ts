// Keyset cursor of the knowledge search (#1507 S-d): the sort key tuple `(stage, score desc, published desc, item id)` of the last row of a page, plus a
// digest binding the query, workspace and actor. HMAC authenticates the complete payload. A process-local secret follows the explorer
// cursor lifecycle: restart or another instance invalidates the cursor and the client starts again at the first page.

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import { z } from 'zod';

import type { SearchAfter } from '../repositories/search-port.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const cursorKey = randomBytes(32);
const signatureOf = (payload: string): Buffer => createHmac('sha256', cursorKey).update('knowledge-search-cursor-v1.').update(payload).digest();
const cursorSchema = z
  .object({
    s: z.number().int().min(1).max(6),
    m: z.number().int().min(0).max(2_000_000_000),
    p: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    i: z.string().regex(UUID),
    h: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .strict();

/** Digest of everything that decides the ordering and the member set of a result: the interpreted query and the filters. */
export function queryDigest(parts: unknown): string {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}

export function encodeSearchCursor(after: SearchAfter, digest: string): string {
  const payload = Buffer.from(JSON.stringify({ s: after.stage, m: after.scoreMicro, p: after.publishedAtMicro, i: after.itemId, h: digest }), 'utf8').toString('base64url');
  return `${payload}.${signatureOf(payload).toString('base64url')}`;
}

/** The position, or null when the text is not a cursor of THIS query. */
export function decodeSearchCursor(raw: string, digest: string): SearchAfter | null {
  if (raw.length > 512 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(raw)) return null;
  const [payload, signature] = raw.split('.');
  if (!payload || !signature) return null;
  const supplied = Buffer.from(signature, 'base64url');
  const expected = signatureOf(payload);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  const parsed = cursorSchema.safeParse(value);
  if (!parsed.success || parsed.data.h !== digest) return null;
  return { stage: parsed.data.s, scoreMicro: parsed.data.m, publishedAtMicro: parsed.data.p, itemId: parsed.data.i };
}
