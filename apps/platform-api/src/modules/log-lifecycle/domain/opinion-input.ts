// The body of the worker `opinions` call (ADR-0117 amendment 2, decisions 2, 4, 5 and 6) and the opinion scale declaration.
// Pure and DB-free: strict parse, the input checks (length caps, control characters removed, secret patterns refused), the
// declared-scale and sample-list checks, and the content fingerprint that makes a resend idempotent. Limits are start values,
// refused with `validation.failed` fields, never cut. Nothing here can reach a verdict: opinions have their own axis.
//   { submissionId, opinions: [{ itemKey, grade, mark?, note?, evidence?: [{ fileRef, line, fileSha256 }], inputRevision?, producer? }] }
// The per-attempt totals (rows, note bytes) need the database and are judged by `judgeAttemptTotals`.

import { z } from 'zod';

import type { FieldError } from '../../menu-dispatch/types.js';
import { looksSecret } from './result-payload.js';

export const OPINION_NOTE_MAX = 1000;
export const OPINION_TEXT_MAX = 200;
export const OPINIONS_PER_CALL_MAX = 500;
export const OPINION_EVIDENCE_MAX = 20;
export const OPINIONS_PER_ATTEMPT_MAX = 2000;
export const OPINION_NOTE_BYTES_PER_ATTEMPT_MAX = 256 * 1024;
export const SCALE_KEY_PATTERN = /^[a-z0-9_-]{1,32}$/;
export const SCALE_LABEL_MAX = 40;
export const SCALE_ENTRIES_MAX = 12;

export interface ScaleEntry {
  key: string;
  label: string;
}
export interface OpinionScale {
  grades: ScaleEntry[];
  marks: ScaleEntry[];
}
export const EMPTY_OPINION_SCALE: OpinionScale = { grades: [], marks: [] };

export interface OpinionEvidence {
  fileRef: string;
  line: number;
  fileSha256: string;
}
export interface ParsedOpinion {
  itemKey: string;
  grade: string;
  mark: string | null;
  note: string | null;
  evidence: OpinionEvidence[];
  inputRevision: string | null;
  producer: string | null;
}
export interface ParsedOpinionBody {
  submissionId: string;
  opinions: ParsedOpinion[];
}

// eslint-disable-next-line no-control-regex -- the point: strip C0 / DEL / C1 controls
const CONTROL_ANY = /[\u0000-\u001f\u007f-\u009f]/g;
// eslint-disable-next-line no-control-regex -- a note keeps tab and line feed
const CONTROL_KEEP_WS = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g;
const oneLine = (s: string): string => s.replace(CONTROL_ANY, '').trim();
const multiLine = (s: string): string => s.replace(CONTROL_KEEP_WS, '').trim();
const chars = (s: string): number => [...s].length;
const SHA256 = /^[0-9a-f]{64}$/;

const text = z.string({ required_error: 'required', invalid_type_error: 'malformed' });
const bodySchema = z
  .object({
    submissionId: text,
    opinions: z.array(z.unknown(), { required_error: 'required', invalid_type_error: 'malformed' }),
  })
  .strict();
const itemSchema = z
  .object({
    itemKey: text,
    grade: text,
    mark: text.nullish(),
    note: text.nullish(),
    evidence: z.array(z.unknown(), { invalid_type_error: 'malformed' }).nullish(),
    inputRevision: text.nullish(),
    producer: text.nullish(),
  })
  .strict();
const evidenceSchema = z
  .object({
    fileRef: text,
    line: z.number({ required_error: 'required', invalid_type_error: 'malformed' }).int('malformed').min(1, 'malformed'),
    fileSha256: text.regex(SHA256, 'malformed'),
  })
  .strict();

const KNOWN = ['required', 'malformed'];
function zodErrors(error: z.ZodError, base: (string | number)[]): FieldError[] {
  const seen = new Set<string>();
  const out: FieldError[] = [];
  for (const issue of error.issues) {
    if (issue.code === 'unrecognized_keys') {
      for (const k of issue.keys) out.push({ path: [...base, ...issue.path, k].map(String), code: 'malformed' });
      continue;
    }
    const path = [...base, ...issue.path].map(String);
    const key = path.join('.');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ path, code: KNOWN.includes(issue.message) ? issue.message : 'malformed' });
  }
  return out;
}

export type OpinionParse = { ok: true; value: ParsedOpinionBody } | { ok: false; errors: FieldError[] };

/**
 * Strict parse + input checks. `sampleRefs` = the fileRefs of the request subject's sample list (evidence must be one of them);
 * `scale` = the workspace's declaration (an empty grade list refuses the whole call as `opinion.scale_undeclared`); `null` skips the
 * scale checks so the caller can compare a resend with the stored rows first and judge only the NEW rows with `checkOpinionScale`.
 */
export function parseOpinionBody(raw: unknown, sampleRefs: ReadonlySet<string>, scale: OpinionScale | null): OpinionParse {
  const head = bodySchema.safeParse(raw);
  if (!head.success) return { ok: false, errors: zodErrors(head.error, []) };
  const body = head.data;
  const errors: FieldError[] = [];
  const add = (path: (string | number)[], code: string) => errors.push({ path: path.map(String), code });

  const submissionId = oneLine(body.submissionId);
  if (submissionId === '') add(['submissionId'], 'required');
  else if (chars(submissionId) > OPINION_TEXT_MAX) add(['submissionId'], 'too_long');
  if (body.opinions.length === 0) return { ok: false, errors: [...errors, { path: ['opinions'], code: 'required' }] };
  if (body.opinions.length > OPINIONS_PER_CALL_MAX) return { ok: false, errors: [{ path: ['opinions'], code: 'too_many' }] };
  if (scale !== null && scale.grades.length === 0) return { ok: false, errors: [{ path: ['opinions'], code: 'opinion.scale_undeclared' }] };
  const grades = new Set((scale ?? EMPTY_OPINION_SCALE).grades.map((g) => g.key));
  const marks = new Set((scale ?? EMPTY_OPINION_SCALE).marks.map((m) => m.key));

  const opinions: ParsedOpinion[] = [];
  const seenKeys = new Set<string>();
  body.opinions.forEach((rawItem, i) => {
    const r = itemSchema.safeParse(rawItem);
    if (!r.success) {
      errors.push(...zodErrors(r.error, ['opinions', i]));
      return;
    }
    const d = r.data;
    const itemKey = oneLine(d.itemKey);
    if (itemKey === '') add(['opinions', i, 'itemKey'], 'required');
    else if (chars(itemKey) > OPINION_TEXT_MAX) add(['opinions', i, 'itemKey'], 'too_long');
    else if (looksSecret(itemKey) || looksSecret(d.itemKey)) add(['opinions', i, 'itemKey'], 'secret_detected');
    else if (seenKeys.has(itemKey)) add(['opinions', i, 'itemKey'], 'duplicate');
    seenKeys.add(itemKey);

    const grade = d.grade.trim();
    if (grade === '') add(['opinions', i, 'grade'], 'required');
    else if (scale !== null && !grades.has(grade)) add(['opinions', i, 'grade'], 'not_declared');
    let mark: string | null = null;
    if (d.mark !== undefined && d.mark !== null && d.mark.trim() !== '') {
      mark = d.mark.trim();
      if (scale !== null && !marks.has(mark)) add(['opinions', i, 'mark'], 'not_declared');
    }

    let note: string | null = null;
    if (d.note !== undefined && d.note !== null) {
      const n = multiLine(d.note);
      if (chars(n) > OPINION_NOTE_MAX) add(['opinions', i, 'note'], 'too_long');
      else if (looksSecret(n) || looksSecret(d.note)) add(['opinions', i, 'note'], 'secret_detected');
      else if (n !== '') note = n;
    }
    const meta = (key: 'inputRevision' | 'producer'): string | null => {
      const v = d[key];
      if (v === undefined || v === null) return null;
      const s = oneLine(v);
      if (chars(s) > OPINION_TEXT_MAX) add(['opinions', i, key], 'too_long');
      else if (looksSecret(s) || looksSecret(v)) add(['opinions', i, key], 'secret_detected');
      return s === '' ? null : s;
    };
    const inputRevision = meta('inputRevision');
    const producer = meta('producer');

    const rawEvidence = d.evidence ?? [];
    const evidence: OpinionEvidence[] = [];
    if (rawEvidence.length > OPINION_EVIDENCE_MAX) add(['opinions', i, 'evidence'], 'too_many');
    else {
      rawEvidence.forEach((rawEv, j) => {
        const e = evidenceSchema.safeParse(rawEv);
        if (!e.success) {
          errors.push(...zodErrors(e.error, ['opinions', i, 'evidence', j]));
          return;
        }
        const fileRef = e.data.fileRef.trim();
        if (!sampleRefs.has(fileRef)) add(['opinions', i, 'evidence', j, 'fileRef'], 'not_in_sample');
        evidence.push({ fileRef, line: e.data.line, fileSha256: e.data.fileSha256 });
      });
    }
    opinions.push({ itemKey, grade, mark, note, evidence, inputRevision, producer });
  });
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: { submissionId, opinions } };
}

/**
 * The declared-scale judgement of the NEW rows of a call (`at[i]` = the index of `rows[i]` in the body): an empty grade list refuses
 * the call as `opinion.scale_undeclared`, otherwise each undeclared grade or mark is `not_declared`. Rows already stored are not judged.
 */
export function checkOpinionScale(rows: readonly ParsedOpinion[], at: readonly number[], scale: OpinionScale): FieldError[] {
  if (rows.length > 0 && scale.grades.length === 0) return [{ path: ['opinions'], code: 'opinion.scale_undeclared' }];
  const grades = new Set(scale.grades.map((g) => g.key));
  const marks = new Set(scale.marks.map((m) => m.key));
  const errors: FieldError[] = [];
  rows.forEach((r, k) => {
    if (!grades.has(r.grade)) errors.push({ path: ['opinions', String(at[k]), 'grade'], code: 'not_declared' });
    if (r.mark !== null && !marks.has(r.mark)) errors.push({ path: ['opinions', String(at[k]), 'mark'], code: 'not_declared' });
  });
  return errors;
}

/** The fields a resend must repeat unchanged: the same `submissionId` + item key with other content is a conflict. */
export function opinionFingerprint(o: ParsedOpinion): string {
  return JSON.stringify([o.grade, o.mark, o.note, o.evidence.map((e) => [e.fileRef, e.line, e.fileSha256]), o.inputRevision, o.producer]);
}

export const noteBytes = (o: Pick<ParsedOpinion, 'note'>): number => (o.note === null ? 0 : Buffer.byteLength(o.note, 'utf8'));

/** The per-attempt totals (decision 4): the call's new rows and note bytes on top of what is stored. Null = within limits. */
export function judgeAttemptTotals(stored: { rows: number; noteBytes: number }, added: { rows: number; noteBytes: number }): FieldError | null {
  if (stored.rows + added.rows > OPINIONS_PER_ATTEMPT_MAX) return { path: ['opinions'], code: 'too_many' };
  if (stored.noteBytes + added.noteBytes > OPINION_NOTE_BYTES_PER_ATTEMPT_MAX) return { path: ['opinions'], code: 'too_long' };
  return null;
}

// ---- the scale declaration (`queueSettingsUpdate.opinionScale`) ----

export type ScaleParse = { ok: true; value: OpinionScale } | { ok: false; code: 'malformed' | 'duplicate_key' | 'too_many' };

/** Judges a declaration as the administrator sends it: `{ grades: [{ key, label }], marks: [{ key, label }] }`, replaced whole. */
export function parseOpinionScale(raw: unknown): ScaleParse {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, code: 'malformed' };
  const o = raw as Record<string, unknown>;
  if (Object.keys(o).some((k) => k !== 'grades' && k !== 'marks')) return { ok: false, code: 'malformed' };
  const list = (v: unknown): ScaleEntry[] | 'malformed' | 'duplicate_key' | 'too_many' => {
    if (v === undefined) return [];
    if (!Array.isArray(v)) return 'malformed';
    if (v.length > SCALE_ENTRIES_MAX) return 'too_many';
    const out: ScaleEntry[] = [];
    const keys = new Set<string>();
    for (const e of v) {
      if (e === null || typeof e !== 'object' || Array.isArray(e)) return 'malformed';
      const x = e as Record<string, unknown>;
      if (Object.keys(x).some((k) => k !== 'key' && k !== 'label')) return 'malformed';
      // `none` is the reserved filter value of the rule results list (no opinion), so it cannot be a declared key.
      if (typeof x.key !== 'string' || !SCALE_KEY_PATTERN.test(x.key) || x.key === 'none') return 'malformed';
      const label = x.label === undefined ? '' : x.label;
      if (typeof label !== 'string') return 'malformed';
      const clean = oneLine(label);
      if (chars(clean) > SCALE_LABEL_MAX) return 'malformed';
      if (keys.has(x.key)) return 'duplicate_key';
      keys.add(x.key);
      out.push({ key: x.key, label: clean });
    }
    return out;
  };
  const grades = list(o.grades);
  if (typeof grades === 'string') return { ok: false, code: grades };
  const marks = list(o.marks);
  if (typeof marks === 'string') return { ok: false, code: marks };
  return { ok: true, value: { grades, marks } };
}

/** The stored declaration, tolerant: anything unreadable resolves to the empty scale (the DB CHECK keeps the stored shape). */
export function readOpinionScale(stored: unknown): OpinionScale {
  const parsed = parseOpinionScale(stored);
  return parsed.ok ? parsed.value : EMPTY_OPINION_SCALE;
}
