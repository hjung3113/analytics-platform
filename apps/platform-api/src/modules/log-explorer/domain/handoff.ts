// Evidence-location handoff, pure and DB-free (#1474 X-h, design log-explorer §5.2): the input of `logExplorer.evidenceHandoff`,
// the choice of the stored refs, the per-ref Source resolution mapping and the hash-mismatch judgment for a knowledge draft.
// Pointers only: `{ fileRef, line, fileSha256 }` in the request, the note comes from the stored ref; nothing here holds a body.
//
// Codes: `required`, `malformed`, `too_many`, `duplicate`, `not_available` (a defect target has no receiver yet),
// `not_in_investigation` (a requested ref is not stored in that investigation).

import { isUuid } from '../../../lib/input/fields.js';
import type { FieldError } from '../../menu-dispatch/types.js';
import { EVIDENCE_REFS_MAX } from './evidence-ref.js';
import { type EvidenceRef, parseEvidenceRef, sameLocation } from './evidence.js';

export type HandoffTarget =
  | { kind: 'round'; roundId: string }
  | { kind: 'knowledgeDraft'; mode: 'create'; owner: { modelId: string } | { softwareId: string }; title: string; observation: string }
  | { kind: 'knowledgeDraft'; mode: 'append'; draftId: string; draftExpectedVersion: string };

export interface RequestedRef {
  fileRef: string;
  line: number;
  fileSha256: string;
}

export interface HandoffInput {
  id: string;
  refs: RequestedRef[];
  target: HandoffTarget;
}

type Parse<T> = { ok: true; value: T } | { ok: false; errors: FieldError[] };
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const fail = (path: string[], code: string): { ok: false; errors: FieldError[] } => ({ ok: false, errors: [{ path, code }] });

function strictKeys(raw: Record<string, unknown>, allowed: readonly string[], root: string[]): FieldError[] {
  return Object.keys(raw)
    .filter((key) => !allowed.includes(key))
    .map((key) => ({ path: [...root, key], code: 'malformed' }));
}

function requiredUuid(raw: Record<string, unknown>, key: string, root: string[]): Parse<string> {
  const value = raw[key];
  if (value === undefined || value === null) return fail([...root, key], 'required');
  if (typeof value !== 'string' || !isUuid(value)) return fail([...root, key], 'malformed');
  return { ok: true, value: value.toLowerCase() };
}

function requiredString(raw: Record<string, unknown>, key: string, root: string[]): Parse<string> {
  const value = raw[key];
  if (value === undefined || value === null) return fail([...root, key], 'required');
  if (typeof value !== 'string') return fail([...root, key], 'malformed');
  return { ok: true, value };
}

export function parseHandoffRefs(raw: unknown): Parse<RequestedRef[]> {
  if (raw === undefined || raw === null) return fail(['refs'], 'required');
  if (!Array.isArray(raw)) return fail(['refs'], 'malformed');
  if (raw.length === 0) return fail(['refs'], 'required');
  if (raw.length > EVIDENCE_REFS_MAX) return fail(['refs'], 'too_many');
  const errors: FieldError[] = [];
  const out: RequestedRef[] = [];
  const seen: RequestedRef[] = [];
  raw.forEach((item, index) => {
    const at = String(index);
    if (isRecord(item) && 'note' in item) {
      // The note is the stored ref's; a request cannot set it.
      errors.push({ path: ['refs', at, 'note'], code: 'malformed' });
      return;
    }
    const one = parseEvidenceRef(item);
    if (!one.ok) {
      errors.push(...one.errors.map((e) => ({ path: ['refs', at, ...e.path.slice(1)], code: e.code })));
      return;
    }
    if (seen.some((held) => sameLocation(held, one.value))) {
      errors.push({ path: ['refs', at], code: 'duplicate' });
      return;
    }
    const ref = { fileRef: one.value.fileRef, line: one.value.line, fileSha256: one.value.fileSha256 };
    seen.push(ref);
    out.push(ref);
  });
  return errors.length > 0 ? { ok: false, errors } : { ok: true, value: out };
}

const TARGET = ['target'];

function parseOwner(raw: unknown): Parse<{ modelId: string } | { softwareId: string }> {
  if (raw === undefined || raw === null) return fail([...TARGET, 'owner'], 'required');
  if (!isRecord(raw)) return fail([...TARGET, 'owner'], 'malformed');
  const extra = strictKeys(raw, ['modelId', 'softwareId'], [...TARGET, 'owner']);
  if (extra.length > 0) return { ok: false, errors: extra };
  const hasModel = raw.modelId !== undefined && raw.modelId !== null;
  const hasSoftware = raw.softwareId !== undefined && raw.softwareId !== null;
  if (hasModel === hasSoftware) return fail([...TARGET, 'owner'], 'required_one');
  const key = hasModel ? 'modelId' : 'softwareId';
  const id = requiredUuid(raw, key, [...TARGET, 'owner']);
  if (!id.ok) return id;
  return { ok: true, value: hasModel ? { modelId: id.value } : { softwareId: id.value } };
}

export function parseHandoffTarget(raw: unknown): Parse<HandoffTarget> {
  if (raw === undefined || raw === null) return fail(TARGET, 'required');
  if (!isRecord(raw)) return fail(TARGET, 'malformed');
  if (raw.kind === undefined) return fail([...TARGET, 'kind'], 'required');
  if (raw.kind === 'defect') {
    const extra = strictKeys(raw, ['kind'], TARGET);
    return extra.length > 0 ? { ok: false, errors: extra } : fail(TARGET, 'not_available');
  }
  if (raw.kind === 'round') {
    const extra = strictKeys(raw, ['kind', 'roundId'], TARGET);
    if (extra.length > 0) return { ok: false, errors: extra };
    const roundId = requiredUuid(raw, 'roundId', TARGET);
    return roundId.ok ? { ok: true, value: { kind: 'round', roundId: roundId.value } } : roundId;
  }
  if (raw.kind !== 'knowledgeDraft') return fail([...TARGET, 'kind'], 'malformed');
  if (raw.mode === undefined) return fail([...TARGET, 'mode'], 'required');
  if (raw.mode === 'create') {
    const extra = strictKeys(raw, ['kind', 'mode', 'owner', 'title', 'observation'], TARGET);
    if (extra.length > 0) return { ok: false, errors: extra };
    const owner = parseOwner(raw.owner);
    const title = requiredString(raw, 'title', TARGET);
    const observation = requiredString(raw, 'observation', TARGET);
    const errors = [owner, title, observation].flatMap((p) => (p.ok ? [] : p.errors));
    if (errors.length > 0 || !owner.ok || !title.ok || !observation.ok) return { ok: false, errors };
    return { ok: true, value: { kind: 'knowledgeDraft', mode: 'create', owner: owner.value, title: title.value, observation: observation.value } };
  }
  if (raw.mode === 'append') {
    const extra = strictKeys(raw, ['kind', 'mode', 'draftId', 'draftExpectedVersion'], TARGET);
    if (extra.length > 0) return { ok: false, errors: extra };
    const draftId = requiredUuid(raw, 'draftId', TARGET);
    const version = requiredString(raw, 'draftExpectedVersion', TARGET);
    const errors = [draftId, version].flatMap((p) => (p.ok ? [] : p.errors));
    if (errors.length > 0 || !draftId.ok || !version.ok) return { ok: false, errors };
    if (version.value === '') return fail([...TARGET, 'draftExpectedVersion'], 'required');
    return { ok: true, value: { kind: 'knowledgeDraft', mode: 'append', draftId: draftId.value, draftExpectedVersion: version.value } };
  }
  return fail([...TARGET, 'mode'], 'malformed');
}

export function parseHandoff(input: Record<string, unknown>): Parse<HandoffInput> {
  const id = requiredUuid(input, 'id', []);
  const refs = parseHandoffRefs(input.refs);
  const target = parseHandoffTarget(input.target);
  const errors = [id, refs, target].flatMap((p) => (p.ok ? [] : p.errors));
  if (errors.length > 0 || !id.ok || !refs.ok || !target.ok) return { ok: false, errors };
  return { ok: true, value: { id: id.value, refs: refs.value, target: target.value } };
}

/**
 * The stored refs behind the requested ones, in request order, with the stored note. A requested ref counts as stored only when
 * `(fileRef, line)` and the hash all match what the investigation holds (the person saw that hash).
 */
export function selectStoredRefs(requested: readonly RequestedRef[], stored: readonly EvidenceRef[]): Parse<EvidenceRef[]> {
  const errors: FieldError[] = [];
  const out: EvidenceRef[] = [];
  requested.forEach((ref, index) => {
    const held = stored.find((s) => sameLocation(s, ref) && s.fileSha256 === ref.fileSha256);
    if (!held) errors.push({ path: ['refs', String(index)], code: 'not_in_investigation' });
    else out.push(held);
  });
  return errors.length > 0 ? { ok: false, errors } : { ok: true, value: out };
}

/** What a `getWindow(before 0, after 0)` answer says about the original: found, gone, or not known (never guessed). */
export function resolutionOf(status: string): boolean | null {
  if (status === 'ok') return true;
  if (status === 'source_absent') return false;
  return null;
}

/** A knowledge draft marks a pointer whose hash differs from the sample set's file (a file the sample set lacks differs too). */
export function hashMismatchOf(ref: Pick<EvidenceRef, 'fileRef' | 'fileSha256'>, files: readonly { fileRef: string; sha256: string }[]): boolean {
  const sample = files.find((f) => f.fileRef === ref.fileRef);
  return sample === undefined || sample.sha256 !== ref.fileSha256;
}
