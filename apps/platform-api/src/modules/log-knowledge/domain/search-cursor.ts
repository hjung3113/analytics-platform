// Keyset cursor of the knowledge search (#1507 S-d): the sort key tuple `(stage, score desc, published desc, item id)` of the last row of a page, plus a short
// digest of the query it belongs to, so a cursor of another query (or filter) is refused instead of silently paging somewhere else. Pure.

import { createHash } from 'node:crypto';

import { z } from 'zod';

import type { SearchAfter } from '../repositories/search-port.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const cursorSchema = z
  .object({
    s: z.number().int().min(1).max(6),
    m: z.number().int().min(0).max(2_000_000_000),
    p: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    i: z.string().regex(UUID),
    h: z.string().regex(/^[0-9a-f]{12}$/),
  })
  .strict();

/** Digest of everything that decides the ordering and the member set of a result: the interpreted query and the filters. */
export function queryDigest(parts: unknown): string {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 12);
}

export function encodeSearchCursor(after: SearchAfter, digest: string): string {
  return Buffer.from(JSON.stringify({ s: after.stage, m: after.scoreMicro, p: after.publishedAtMicro, i: after.itemId, h: digest }), 'utf8').toString('base64url');
}

/** The position, or null when the text is not a cursor of THIS query. */
export function decodeSearchCursor(raw: string, digest: string): SearchAfter | null {
  if (!/^[A-Za-z0-9_-]+$/.test(raw)) return null;
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  const parsed = cursorSchema.safeParse(value);
  if (!parsed.success || parsed.data.h !== digest) return null;
  return { stage: parsed.data.s, scoreMicro: parsed.data.m, publishedAtMicro: parsed.data.p, itemId: parsed.data.i };
}
