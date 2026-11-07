// Encrypted, request-bound page cursor of the paged reads (#1469, backlog row of #1467). The Source adapter's cursor is opaque, may carry
// log text (a search-after key) and could be replayed against another request; the client therefore only ever holds this envelope: the
// adapter cursor and an expiry encrypted and authenticated (AES-256-GCM, key derived from the per-process secret), with the binding to the
// request (endpoint, workspace, actor, sample-set digest, query, limit) as authenticated data. A cursor from another sample set, filter,
// limit, user, endpoint or process, a changed byte or an old one is refused (`null`); the wire token never reveals the adapter cursor.

import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from 'node:crypto';

import { SOURCE_READ_CURSOR_MAX, type SourceRecordQuery } from '@ap/contract-schemas';

export const CURSOR_TTL_MS = 30 * 60 * 1000;

export interface CursorBinding {
  endpoint: 'records' | 'periods';
  workspaceId: string;
  actorId: string;
  sampleSetDigest: string;
  query: SourceRecordQuery;
  limit: number;
}

/** Key order independent JSON: the same query always gives the same binding. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function bindingDigest(binding: CursorBinding): string {
  return createHash('sha256').update(canonical(binding), 'utf8').digest('hex');
}

/** A random per-process key: a cursor does not survive a restart or reach another instance (the client restarts at the first page). */
export function newCursorKey(): Buffer {
  return randomBytes(32);
}

const IV_BYTES = 12;
const TAG_BYTES = 16;
const EXPIRY_BYTES = 8;
/** The cursor is sealed as UTF-16LE (2 bytes per code unit) so a schema-valid lone surrogate survives the round trip unchanged. */
const WORST_CURSOR_BYTES = SOURCE_READ_CURSOR_MAX * 2;
/** Longest wire token the server can issue: the worst permitted adapter cursor, encrypted, as base64url. */
export const WIRE_CURSOR_MAX = Math.ceil(((IV_BYTES + EXPIRY_BYTES + WORST_CURSOR_BYTES + TAG_BYTES) * 4) / 3);

function encryptionKey(key: Buffer): Buffer {
  return Buffer.from(hkdfSync('sha256', key, Buffer.alloc(0), 'log-explorer-cursor-v1', 32));
}

export function signCursor(key: Buffer, binding: CursorBinding, adapterCursor: string, nowMs: number): string {
  const expiry = Buffer.alloc(EXPIRY_BYTES);
  expiry.writeBigUInt64BE(BigInt(nowMs + CURSOR_TTL_MS));
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(key), iv);
  cipher.setAAD(Buffer.from(bindingDigest(binding), 'utf8'));
  const sealed = Buffer.concat([cipher.update(Buffer.concat([expiry, Buffer.from(adapterCursor, 'utf16le')])), cipher.final()]);
  return Buffer.concat([iv, sealed, cipher.getAuthTag()]).toString('base64url');
}

/** The adapter cursor inside `token`, or null when the token is malformed, forged, expired or bound to another request. */
export function verifyCursor(key: Buffer, binding: CursorBinding, token: string, nowMs: number): string | null {
  const raw = Buffer.from(token, 'base64url');
  if (raw.length < IV_BYTES + EXPIRY_BYTES + 1 + TAG_BYTES) return null;
  try {
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(key), raw.subarray(0, IV_BYTES));
    decipher.setAAD(Buffer.from(bindingDigest(binding), 'utf8'));
    decipher.setAuthTag(raw.subarray(raw.length - TAG_BYTES));
    const plain = Buffer.concat([decipher.update(raw.subarray(IV_BYTES, raw.length - TAG_BYTES)), decipher.final()]);
    if (plain.length <= EXPIRY_BYTES || (plain.length - EXPIRY_BYTES) % 2 !== 0) return null;
    if (plain.readBigUInt64BE(0) < BigInt(nowMs)) return null;
    return plain.subarray(EXPIRY_BYTES).toString('utf16le');
  } catch {
    return null;
  }
}
