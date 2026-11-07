// EvidenceRef normalisation (#1468 b, design §3.2, ADR-0119): `{ fileRef, line, fileSha256, note? }`. A location in a
// file, never its content: there is no body or excerpt field, and an unknown key is refused so none can be smuggled in.
// Pure and DB-free. An EvidenceRef is identified by `(fileRef, line)`; the same location is held once.

import { unsafeText } from '../../../lib/text-safety.js';
import type { FieldError } from '../../menu-dispatch/types.js';
import { EVIDENCE_FILE_REF_MAX, EVIDENCE_NOTE_MAX, EVIDENCE_REFS_MAX, type EvidenceRef } from './evidence-ref.js';

// The type and the three caps are node a's (`./evidence-ref.ts`): one definition. This file adds the field-error parsing and the
// location-keyed add/remove the investigation actions need (node a's list normaliser keys on (fileRef, line, fileSha256)).
export type { EvidenceRef };
export const EVIDENCE_MAX = EVIDENCE_REFS_MAX;
export const FILE_REF_MAX = EVIDENCE_FILE_REF_MAX;
export const NOTE_MAX = EVIDENCE_NOTE_MAX;
export const LINE_MAX = 2_000_000_000;
export interface EvidenceKey {
  fileRef: string;
  line: number;
}

type Parse<T> = { ok: true; value: T } | { ok: false; errors: FieldError[] };

const SHA256 = /^[0-9a-f]{64}$/;
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const fail = (path: string[], code: string): { ok: false; errors: FieldError[] } => ({ ok: false, errors: [{ path, code }] });

function hasControl(value: string): boolean {
  if (unsafeText(value)) return true;
  for (let i = 0; i < value.length; i += 1) {
    const c = value.charCodeAt(i);
    if (c < 0x20 || (c >= 0x7f && c <= 0x9f)) return true;
  }
  return false;
}

function parseKeyFields(raw: Record<string, unknown>, root: string): Parse<EvidenceKey> {
  const { fileRef, line } = raw;
  if (typeof fileRef !== 'string') return fail([root, 'fileRef'], 'required');
  const ref = fileRef.trim();
  if (ref === '') return fail([root, 'fileRef'], 'required');
  if (hasControl(ref)) return fail([root, 'fileRef'], 'malformed');
  if ([...ref].length > FILE_REF_MAX) return fail([root, 'fileRef'], 'too_long');
  if (line === undefined || line === null) return fail([root, 'line'], 'required');
  if (typeof line !== 'number' || !Number.isInteger(line) || line < 1 || line > LINE_MAX) return fail([root, 'line'], 'malformed');
  return { ok: true, value: { fileRef: ref, line } };
}

/** Codes (path under `ref`): `required`, `malformed` (unknown key, bad value), `too_long`. A blank note is dropped. */
export function parseEvidenceRef(raw: unknown): Parse<EvidenceRef> {
  if (raw === undefined || raw === null) return fail(['ref'], 'required');
  if (!isRecord(raw)) return fail(['ref'], 'malformed');
  for (const key of Object.keys(raw)) {
    if (key !== 'fileRef' && key !== 'line' && key !== 'fileSha256' && key !== 'note') return fail(['ref', key], 'malformed');
  }
  const keyed = parseKeyFields(raw, 'ref');
  if (!keyed.ok) return keyed;
  const { fileSha256, note } = raw;
  if (typeof fileSha256 !== 'string') return fail(['ref', 'fileSha256'], 'required');
  if (!SHA256.test(fileSha256)) return fail(['ref', 'fileSha256'], 'malformed');
  const value: EvidenceRef = { ...keyed.value, fileSha256 };
  if (note !== undefined && note !== null) {
    if (typeof note !== 'string') return fail(['ref', 'note'], 'malformed');
    if (hasControl(note)) return fail(['ref', 'note'], 'malformed');
    const trimmed = note.trim();
    if ([...trimmed].length > NOTE_MAX) return fail(['ref', 'note'], 'too_long');
    if (trimmed !== '') value.note = trimmed;
  }
  return { ok: true, value };
}

/** The identity of a location to remove: `{ fileRef, line }` only. */
export function parseEvidenceKey(raw: unknown): Parse<EvidenceKey> {
  if (raw === undefined || raw === null) return fail(['ref'], 'required');
  if (!isRecord(raw)) return fail(['ref'], 'malformed');
  for (const key of Object.keys(raw)) if (key !== 'fileRef' && key !== 'line') return fail(['ref', key], 'malformed');
  return parseKeyFields(raw, 'ref');
}

export const sameLocation = (a: EvidenceKey, b: EvidenceKey): boolean => a.fileRef === b.fileRef && a.line === b.line;

export type AddResult = { ok: true; evidence: EvidenceRef[] } | { ok: false; code: 'too_many' | 'duplicate' };

/** Appends `ref`; the cap is 100 per investigation and a location already held is refused (`duplicate`). */
export function addEvidence(current: readonly EvidenceRef[], ref: EvidenceRef): AddResult {
  if (current.some((held) => sameLocation(held, ref))) return { ok: false, code: 'duplicate' };
  if (current.length >= EVIDENCE_MAX) return { ok: false, code: 'too_many' };
  return { ok: true, evidence: [...current, ref] };
}

export type RemoveResult = { ok: true; evidence: EvidenceRef[] } | { ok: false; code: 'not_found' };

export function removeEvidence(current: readonly EvidenceRef[], key: EvidenceKey): RemoveResult {
  const next = current.filter((held) => !sameLocation(held, key));
  return next.length === current.length ? { ok: false, code: 'not_found' } : { ok: true, evidence: next };
}

/** Reads the stored jsonb back as refs, keeping only well-formed entries' fields (a stored ref never carries more). */
export function storedEvidence(raw: unknown): EvidenceRef[] {
  if (!Array.isArray(raw)) return [];
  const out: EvidenceRef[] = [];
  for (const item of raw as unknown[]) {
    if (!isRecord(item)) continue;
    const { fileRef, line, fileSha256, note } = item;
    if (typeof fileRef !== 'string' || typeof line !== 'number' || typeof fileSha256 !== 'string') continue;
    out.push({ fileRef, line, fileSha256, ...(typeof note === 'string' ? { note } : {}) });
  }
  return out;
}
