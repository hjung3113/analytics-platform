// EvidenceRef: a pointer to a source line, never the line (design §3.2, ADR-0119 §3). `{ fileRef, line, fileSha256, note? }` and nothing
// else: an extra key such as `text` or `excerpt` is refused, not dropped, so a caller cannot smuggle a body into stored state. Pure.

export const EVIDENCE_FILE_REF_MAX = 1024;
export const EVIDENCE_NOTE_MAX = 500;
export const EVIDENCE_REFS_MAX = 100;

export interface EvidenceRef {
  fileRef: string;
  line: number;
  fileSha256: string;
  note?: string;
}

export type EvidenceRefError = 'not_object' | 'unknown_key' | 'file_ref' | 'line' | 'file_sha256' | 'note' | 'too_many' | 'duplicate';
export type EvidenceRefResult = { ok: true; value: EvidenceRef } | { ok: false; error: EvidenceRefError };

const KEYS = new Set(['fileRef', 'line', 'fileSha256', 'note']);

export function normalizeEvidenceRef(input: unknown): EvidenceRefResult {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return { ok: false, error: 'not_object' };
  const record = input as Record<string, unknown>;
  if (Object.keys(record).some((key) => !KEYS.has(key))) return { ok: false, error: 'unknown_key' };
  const { fileRef, line, fileSha256, note } = record;
  if (typeof fileRef !== 'string' || fileRef.trim() === '' || fileRef.length > EVIDENCE_FILE_REF_MAX) return { ok: false, error: 'file_ref' };
  if (typeof line !== 'number' || !Number.isSafeInteger(line) || line < 1) return { ok: false, error: 'line' };
  if (typeof fileSha256 !== 'string' || !/^[0-9a-fA-F]{64}$/.test(fileSha256)) return { ok: false, error: 'file_sha256' };
  const value: EvidenceRef = { fileRef, line, fileSha256: fileSha256.toLowerCase() };
  if (note !== undefined) {
    if (typeof note !== 'string' || note.length > EVIDENCE_NOTE_MAX) return { ok: false, error: 'note' };
    const trimmed = note.trim();
    if (trimmed !== '') value.note = trimmed;
  }
  return { ok: true, value };
}

/** Normalises a list: at most EVIDENCE_REFS_MAX, one entry per `(fileRef, line, fileSha256)`. Input order is kept. */
export function normalizeEvidenceRefs(input: unknown): { ok: true; value: EvidenceRef[] } | { ok: false; error: EvidenceRefError; index: number } {
  if (!Array.isArray(input)) return { ok: false, error: 'not_object', index: -1 };
  if (input.length > EVIDENCE_REFS_MAX) return { ok: false, error: 'too_many', index: EVIDENCE_REFS_MAX };
  const seen = new Set<string>();
  const value: EvidenceRef[] = [];
  for (const [index, item] of input.entries()) {
    const one = normalizeEvidenceRef(item);
    if (!one.ok) return { ok: false, error: one.error, index };
    const key = JSON.stringify([one.value.fileRef, one.value.line, one.value.fileSha256]);
    if (seen.has(key)) return { ok: false, error: 'duplicate', index };
    seen.add(key);
    value.push(one.value);
  }
  return { ok: true, value };
}
