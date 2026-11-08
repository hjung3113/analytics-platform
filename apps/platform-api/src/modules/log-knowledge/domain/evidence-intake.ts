// Evidence-location intake of the knowledge drafts (#1474 X-h), pure and DB-free. The sender (the log explorer) hands body-free
// pointers `{ fileRef, line, fileSha256, note?, sourceResolved, hashMismatch? }`; this module re-validates the shape and maps each
// to the item proposal's evidence pointer `{ sourceKind: 'log_file', sourceOwner, sourceRef: fileRef, contentHash: fileSha256,
// locator: 'line:<n>', note }`. The knowledge side has no Source: the caller says whether the original was found
// (`sourceResolved`; `false` is refused, `['refs', i] unresolved`) and whether the hash differs from the sample set
// (`hashMismatch`; the note then starts with the fixed marker `[해시 불일치]` so a reviewer sees it). It does not import the explorer.
//
// Codes (paths under `refs.<i>` / `origin` / `sourceOwner`): `required`, `malformed`, `too_long`, `too_many` (more pointers than
// an item may carry, `EVIDENCE_MAX`), `duplicate`, `unresolved`.

import { isUuid } from '../../../lib/input/fields.js';
import { unsafeText } from '../../../lib/text-safety.js';
import type { FieldError } from '../../menu-dispatch/types.js';
import { EVIDENCE_FIELD_MAX, EVIDENCE_MAX, EVIDENCE_NOTE_MAX, type EvidencePointer } from './item-input.js';

/** The fixed marker at the start of the note of a pointer whose hash differs from the sample set's. */
export const HASH_MISMATCH_MARKER = '[해시 불일치]';
export const EVIDENCE_ORIGIN_KINDS = ['log_explorer'] as const;

export interface DraftEvidenceRefInput {
  fileRef: string;
  line: number;
  fileSha256: string;
  note?: string | null;
  /** `false` = the original is gone from the Source: the pointer is refused. */
  sourceResolved: boolean;
  /** `true` = the hash differs from the sample set's: stored with the marker on the note. */
  hashMismatch?: boolean;
}

export interface DraftEvidenceOrigin {
  kind: (typeof EVIDENCE_ORIGIN_KINDS)[number];
  id: string;
}

const REF_KEYS = ['fileRef', 'line', 'fileSha256', 'note', 'sourceResolved', 'hashMismatch'] as const;
const SHA256_ANY_CASE = /^[0-9a-fA-F]{64}$/;
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function hasControl(value: string): boolean {
  if (unsafeText(value)) return true;
  for (let i = 0; i < value.length; i += 1) {
    const c = value.charCodeAt(i);
    if (c < 0x20 || (c >= 0x7f && c <= 0x9f)) return true;
  }
  return false;
}

/** The marker plus the note, cut to the note limit by code points. */
export function markHashMismatch(note: string | null): string {
  const text = note === null ? HASH_MISMATCH_MARKER : `${HASH_MISMATCH_MARKER} ${note}`;
  return [...text].slice(0, EVIDENCE_NOTE_MAX).join('');
}

export const pointerKey = (p: Pick<EvidencePointer, 'sourceRef' | 'locator' | 'contentHash'>): string =>
  `${p.sourceRef}\u0000${p.locator ?? ''}\u0000${p.contentHash ?? ''}`;

export type PointersParse = { ok: true; value: EvidencePointer[] } | { ok: false; errors: FieldError[] };

/** The `sourceOwner` of the pointers (a sample set's source owner): required, trimmed, within the evidence field limit. */
export function parseSourceOwner(raw: unknown): { ok: true; value: string } | { ok: false; errors: FieldError[] } {
  if (raw === undefined || raw === null) return { ok: false, errors: [{ path: ['sourceOwner'], code: 'required' }] };
  if (typeof raw !== 'string' || hasControl(raw)) return { ok: false, errors: [{ path: ['sourceOwner'], code: 'malformed' }] };
  const text = raw.trim();
  if (text === '') return { ok: false, errors: [{ path: ['sourceOwner'], code: 'required' }] };
  if ([...text].length > EVIDENCE_FIELD_MAX) return { ok: false, errors: [{ path: ['sourceOwner'], code: 'too_long' }] };
  return { ok: true, value: text };
}

/**
 * Validates the pointer list and maps it to evidence pointers (same order, so index `i` of the result is `refs[i]`). More than
 * `EVIDENCE_MAX` pointers → `['refs'] too_many`. Every wrong pointer is reported at `['refs', i, field]`.
 */
export function parseDraftEvidenceRefs(raw: unknown, sourceOwner: string): PointersParse {
  if (raw === undefined || raw === null) return { ok: false, errors: [{ path: ['refs'], code: 'required' }] };
  if (!Array.isArray(raw)) return { ok: false, errors: [{ path: ['refs'], code: 'malformed' }] };
  if (raw.length === 0) return { ok: false, errors: [{ path: ['refs'], code: 'required' }] };
  if (raw.length > EVIDENCE_MAX) return { ok: false, errors: [{ path: ['refs'], code: 'too_many' }] };
  const errors: FieldError[] = [];
  const out: EvidencePointer[] = [];
  const seen = new Set<string>();
  raw.forEach((item, i) => {
    const at = (field?: string): string[] => (field ? ['refs', String(i), field] : ['refs', String(i)]);
    if (!isRecord(item)) {
      errors.push({ path: at(), code: 'malformed' });
      return;
    }
    const before = errors.length;
    for (const key of Object.keys(item)) if (!(REF_KEYS as readonly string[]).includes(key)) errors.push({ path: at(key), code: 'malformed' });
    const { line, fileSha256, note, sourceResolved, hashMismatch } = item;
    // The pointer is trimmed once here, like the proposal's `requiredText` sourceRef, so the duplicate check and the append merge
    // compare the stored form.
    const fileRef = typeof item.fileRef === 'string' ? item.fileRef.trim() : item.fileRef;
    if (fileRef === undefined || fileRef === '') errors.push({ path: at('fileRef'), code: 'required' });
    else if (typeof fileRef !== 'string' || hasControl(fileRef)) errors.push({ path: at('fileRef'), code: 'malformed' });
    else if ([...fileRef].length > EVIDENCE_FIELD_MAX) errors.push({ path: at('fileRef'), code: 'too_long' });
    if (line === undefined) errors.push({ path: at('line'), code: 'required' });
    else if (typeof line !== 'number' || !Number.isSafeInteger(line) || line < 1) errors.push({ path: at('line'), code: 'malformed' });
    if (fileSha256 === undefined) errors.push({ path: at('fileSha256'), code: 'required' });
    else if (typeof fileSha256 !== 'string' || !SHA256_ANY_CASE.test(fileSha256)) errors.push({ path: at('fileSha256'), code: 'malformed' });
    let cleanNote: string | null = null;
    if (note !== undefined && note !== null) {
      if (typeof note !== 'string' || hasControl(note)) errors.push({ path: at('note'), code: 'malformed' });
      else if ([...note].length > EVIDENCE_NOTE_MAX) errors.push({ path: at('note'), code: 'too_long' });
      else cleanNote = note.trim() === '' ? null : note.trim();
    }
    if (sourceResolved === undefined) errors.push({ path: at('sourceResolved'), code: 'required' });
    else if (typeof sourceResolved !== 'boolean') errors.push({ path: at('sourceResolved'), code: 'malformed' });
    if (hashMismatch !== undefined && typeof hashMismatch !== 'boolean') errors.push({ path: at('hashMismatch'), code: 'malformed' });
    if (errors.length > before) return;
    if (sourceResolved === false) {
      errors.push({ path: at(), code: 'unresolved' });
      return;
    }
    const pointer: EvidencePointer = {
      sourceKind: 'log_file',
      sourceOwner,
      sourceRef: fileRef as string,
      sourceVersion: null,
      contentHash: (fileSha256 as string).toLowerCase(),
      locator: `line:${line as number}`,
      note: hashMismatch === true ? markHashMismatch(cleanNote) : cleanNote,
    };
    const key = pointerKey(pointer);
    if (seen.has(key)) {
      errors.push({ path: at(), code: 'duplicate' });
      return;
    }
    seen.add(key);
    out.push(pointer);
  });
  return errors.length > 0 ? { ok: false, errors } : { ok: true, value: out };
}

export type OriginParse = { ok: true; value: DraftEvidenceOrigin } | { ok: false; errors: FieldError[] };

export function parseDraftEvidenceOrigin(raw: unknown): OriginParse {
  if (raw === undefined || raw === null) return { ok: false, errors: [{ path: ['origin'], code: 'required' }] };
  if (!isRecord(raw)) return { ok: false, errors: [{ path: ['origin'], code: 'malformed' }] };
  const errors: FieldError[] = [];
  for (const key of Object.keys(raw)) if (key !== 'kind' && key !== 'id') errors.push({ path: ['origin', key], code: 'malformed' });
  if (!(EVIDENCE_ORIGIN_KINDS as readonly unknown[]).includes(raw.kind)) errors.push({ path: ['origin', 'kind'], code: raw.kind === undefined ? 'required' : 'malformed' });
  if (raw.id === undefined) errors.push({ path: ['origin', 'id'], code: 'required' });
  else if (typeof raw.id !== 'string' || !isUuid(raw.id)) errors.push({ path: ['origin', 'id'], code: 'malformed' });
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: { kind: raw.kind as DraftEvidenceOrigin['kind'], id: (raw.id as string).toLowerCase() } };
}

/**
 * The latest revision's evidence plus the new pointers, de-duplicated by `(sourceRef, locator, contentHash)` (an already stored
 * pointer wins). `added` is how many were new.
 */
export function mergePointers(existing: readonly EvidencePointer[], incoming: readonly EvidencePointer[]): { merged: EvidencePointer[]; added: number } {
  const keys = new Set(existing.map(pointerKey));
  const merged = [...existing];
  let added = 0;
  for (const pointer of incoming) {
    const key = pointerKey(pointer);
    if (keys.has(key)) continue;
    keys.add(key);
    merged.push(pointer);
    added += 1;
  }
  return { merged, added };
}
