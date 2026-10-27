// Cursor pages of `entityAudit` (ADR-0085): the page size and the opaque keyset token.
// The token is bound to the gated ref (type + id), so a cursor issued for one destination
// is `Invalid cursor` at another. Cursor content never goes into a log line or message.

import { z } from 'zod';

/** Mirror of `ENTITY_AUDIT_PAGE_MAX` in packages/sdk/contracts/src/audit.ts:33 (check-boundaries rule 11 forbids the import); platform-conformance.integration.test.ts pins equality. */
export const ENTITY_AUDIT_PAGE_MAX = 50;

const BASE64URL = /^[A-Za-z0-9_-]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const cursorSchema = z
  .object({
    v: z.literal(1),
    type: z.string(),
    ref: z.string().regex(UUID),
    at: z.string(),
    id: z.string().regex(UUID),
  })
  .strict();

export interface EntityAuditKey {
  /** The instant exactly as emitted: a millisecond ISO string. */
  at: string;
  id: string;
}

export function encodeEntityAuditCursor(
  ref: { type: string; id: string },
  last: EntityAuditKey,
): string {
  return Buffer.from(
    JSON.stringify({ v: 1, type: ref.type, ref: ref.id, at: last.at, id: last.id }),
    'utf8',
  ).toString('base64url');
}

/** `null` for anything that is not a cursor this server issued for `ref`. */
export function decodeEntityAuditCursor(
  ref: { type: string; id: string },
  raw: unknown,
): EntityAuditKey | null {
  if (typeof raw !== 'string' || raw === '' || !BASE64URL.test(raw)) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  const result = cursorSchema.safeParse(parsed);
  if (!result.success) return null;
  const { type, ref: refId, at, id } = result.data;
  if (type !== ref.type || refId.toLowerCase() !== ref.id.toLowerCase()) return null;
  const ms = Date.parse(at);
  if (Number.isNaN(ms) || new Date(ms).toISOString() !== at) return null;
  return { at, id };
}

/**
 * Takes an own-property `cursor` off a plain-object body so the rest is the ref `gateEntity`
 * judges (`parseEntityRef` stays strict: `getEntity` shares it and takes no cursor).
 */
export function splitEntityAuditBody(body: unknown): {
  ref: unknown;
  cursor: unknown;
  hasCursor: boolean;
} {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ref: body, cursor: undefined, hasCursor: false };
  }
  if (!Object.hasOwn(body, 'cursor')) return { ref: body, cursor: undefined, hasCursor: false };
  const { cursor, ...rest } = body as Record<string, unknown>;
  return { ref: rest, cursor, hasCursor: true };
}
