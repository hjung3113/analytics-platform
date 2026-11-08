// Evidence-location intake of a validation round (#1474 X-h), pure and DB-free. The sender (the log explorer) hands
// body-free pointers `{ fileRef, line, fileSha256, note?, sourceResolved }`; this module re-validates the shape (the caller
// is not trusted) and decides each pointer's status against the round's sample set. It does not import the explorer: the
// input type is declared here, structurally the same as the explorer's `EvidenceRef` plus the Source read result.
//
// Codes (paths under `refs.<i>` / `origin` / `target`): `required`, `malformed` (wrong type, unknown key, control char,
// bad hash), `too_long`, `too_many`, `duplicate` (same fileRef/line/hash twice in one call).

import type { FieldError } from '../../menu-dispatch/types.js';
import { isUuid } from '../../../lib/input/fields.js';
import { unsafeText } from '../../../lib/text-safety.js';
import { FILE_REF_MAX, type SampleSet } from './sample-set.js';

export const EVIDENCE_REFS_PER_CALL_MAX = 100;
export const EVIDENCE_REF_NOTE_MAX = 500;
/** Rows one round may hold (the `seq` CHECK in the table). */
export const ROUND_EVIDENCE_REF_MAX = 1000;
export const EVIDENCE_REF_STATUSES = ['match', 'hash_mismatch', 'unresolved'] as const;
export type EvidenceRefStatus = (typeof EVIDENCE_REF_STATUSES)[number];
export const EVIDENCE_REF_ORIGIN_KINDS = ['log_explorer'] as const;

export interface RoundEvidenceRefInput {
  fileRef: string;
  line: number;
  fileSha256: string;
  note?: string | null;
  /** `false` = the explorer could not find the original in the Source any more. */
  sourceResolved: boolean;
}

export interface NormalizedEvidenceRef {
  fileRef: string;
  line: number;
  /** Lower-cased. */
  fileSha256: string;
  note: string | null;
  sourceResolved: boolean;
}

export interface EvidenceRefOrigin {
  kind: (typeof EVIDENCE_REF_ORIGIN_KINDS)[number];
  id: string;
}

const REF_KEYS = ['fileRef', 'line', 'fileSha256', 'note', 'sourceResolved'] as const;
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

export type RefsParse = { ok: true; value: NormalizedEvidenceRef[] } | { ok: false; errors: FieldError[] };

/** Validates the pointer list. Every wrong pointer is reported (not only the first), each at `['refs', i, field]`. */
export function parseEvidenceRefs(raw: unknown): RefsParse {
  if (raw === undefined || raw === null) return { ok: false, errors: [{ path: ['refs'], code: 'required' }] };
  if (!Array.isArray(raw)) return { ok: false, errors: [{ path: ['refs'], code: 'malformed' }] };
  if (raw.length === 0) return { ok: false, errors: [{ path: ['refs'], code: 'required' }] };
  if (raw.length > EVIDENCE_REFS_PER_CALL_MAX) return { ok: false, errors: [{ path: ['refs'], code: 'too_many' }] };
  const errors: FieldError[] = [];
  const out: NormalizedEvidenceRef[] = [];
  const seen = new Set<string>();
  raw.forEach((item, i) => {
    const at = (field?: string): string[] => (field ? ['refs', String(i), field] : ['refs', String(i)]);
    if (!isRecord(item)) {
      errors.push({ path: at(), code: 'malformed' });
      return;
    }
    const before = errors.length;
    for (const key of Object.keys(item)) if (!(REF_KEYS as readonly string[]).includes(key)) errors.push({ path: at(key), code: 'malformed' });
    const { fileRef, line, fileSha256, note, sourceResolved } = item;
    if (typeof fileRef !== 'string' || fileRef === '') errors.push({ path: at('fileRef'), code: fileRef === undefined || fileRef === '' ? 'required' : 'malformed' });
    else if (hasControl(fileRef)) errors.push({ path: at('fileRef'), code: 'malformed' });
    else if ([...fileRef].length > FILE_REF_MAX) errors.push({ path: at('fileRef'), code: 'too_long' });
    if (line === undefined) errors.push({ path: at('line'), code: 'required' });
    else if (typeof line !== 'number' || !Number.isSafeInteger(line) || line < 1) errors.push({ path: at('line'), code: 'malformed' });
    if (fileSha256 === undefined) errors.push({ path: at('fileSha256'), code: 'required' });
    else if (typeof fileSha256 !== 'string' || !SHA256_ANY_CASE.test(fileSha256)) errors.push({ path: at('fileSha256'), code: 'malformed' });
    let cleanNote: string | null = null;
    if (note !== undefined && note !== null) {
      if (typeof note !== 'string' || hasControl(note)) errors.push({ path: at('note'), code: 'malformed' });
      else if ([...note].length > EVIDENCE_REF_NOTE_MAX) errors.push({ path: at('note'), code: 'too_long' });
      else cleanNote = note.trim() === '' ? null : note.trim();
    }
    if (sourceResolved === undefined) errors.push({ path: at('sourceResolved'), code: 'required' });
    else if (typeof sourceResolved !== 'boolean') errors.push({ path: at('sourceResolved'), code: 'malformed' });
    if (errors.length > before) return;
    const sha = (fileSha256 as string).toLowerCase();
    const key = `${fileRef as string}\u0000${line as number}\u0000${sha}`;
    if (seen.has(key)) {
      errors.push({ path: at(), code: 'duplicate' });
      return;
    }
    seen.add(key);
    out.push({ fileRef: fileRef as string, line: line as number, fileSha256: sha, note: cleanNote, sourceResolved: sourceResolved as boolean });
  });
  return errors.length > 0 ? { ok: false, errors } : { ok: true, value: out };
}

export type OriginParse = { ok: true; value: EvidenceRefOrigin } | { ok: false; errors: FieldError[] };

export function parseEvidenceRefOrigin(raw: unknown): OriginParse {
  if (raw === undefined || raw === null) return { ok: false, errors: [{ path: ['origin'], code: 'required' }] };
  if (!isRecord(raw)) return { ok: false, errors: [{ path: ['origin'], code: 'malformed' }] };
  const errors: FieldError[] = [];
  for (const key of Object.keys(raw)) if (key !== 'kind' && key !== 'id') errors.push({ path: ['origin', key], code: 'malformed' });
  if (!(EVIDENCE_REF_ORIGIN_KINDS as readonly unknown[]).includes(raw.kind)) errors.push({ path: ['origin', 'kind'], code: raw.kind === undefined ? 'required' : 'malformed' });
  if (raw.id === undefined) errors.push({ path: ['origin', 'id'], code: 'required' });
  else if (typeof raw.id !== 'string' || !isUuid(raw.id)) errors.push({ path: ['origin', 'id'], code: 'malformed' });
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: { kind: raw.kind as EvidenceRefOrigin['kind'], id: (raw.id as string).toLowerCase() } };
}

/** The status the round gives a pointer: the Source's miss wins, then a hash that differs from the sample set's, else a match. */
export function evidenceRefStatus(ref: Pick<NormalizedEvidenceRef, 'sourceResolved' | 'fileSha256'>, sampleSha256: string): EvidenceRefStatus {
  if (!ref.sourceResolved) return 'unresolved';
  return ref.fileSha256 === sampleSha256 ? 'match' : 'hash_mismatch';
}

/** `['refs', i, 'fileRef'] not_in_sample_set` for every pointer whose file is not in the round's sample set. */
export function sampleSetMisses(refs: readonly NormalizedEvidenceRef[], sampleSet: SampleSet): FieldError[] {
  const known = new Set(sampleSet.files.map((f) => f.fileRef));
  const errors: FieldError[] = [];
  refs.forEach((ref, i) => {
    if (!known.has(ref.fileRef)) errors.push({ path: ['refs', String(i), 'fileRef'], code: 'not_in_sample_set' });
  });
  return errors;
}

export const evidenceRefTripleKey = (ref: { fileRef: string; line: number; fileSha256: string }): string =>
  `${ref.fileRef}\u0000${ref.line}\u0000${ref.fileSha256}`;
