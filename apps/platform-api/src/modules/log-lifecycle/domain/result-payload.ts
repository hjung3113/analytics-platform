// The body of a worker `result` call (ADR-0117 decisions 5 and 7). Pure and DB-free: strict parse, the input checks
// (size limits, control characters removed, token / secret patterns refused), the canonical `result_digest`, and the
// evidence-vs-sample check. Limits are start values (design D7), refused with `validation.failed` fields, never cut.
//   { attemptNo, inputManifestDigest, executorVersion?, executorDigest?, ruleSetRevision?, summary?,
//     results: [{ ruleId, result, required, expected?, observed?, evidence?: [{ fileRef, line, fileSha256, excerpt? }] }] }
// `summary` is the worker's own reference text, stored as given (object, <= 4,096 bytes) and never read by the verdict.

import { createHash } from 'node:crypto';

import { z } from 'zod';

import type { FieldError } from '../../menu-dispatch/types.js';
import { RULE_RESULTS, type RuleResultValue } from './verdict.js';

export const OBSERVED_MAX = 500;
export const RULE_ID_MAX = 200;
export const EXCERPT_MAX = 2000;
export const EVIDENCE_PER_RESULT_MAX = 20;
export const EXCERPT_TOTAL_MAX_BYTES = 256 * 1024;
export const RESULTS_MAX = 2000;
export const SUMMARY_MAX_BYTES = 4096;
const META_MAX = 200;

export interface EvidenceRef {
  fileRef: string;
  line: number;
  fileSha256: string;
  hasExcerpt: boolean;
}
export interface ParsedRuleResult {
  ruleId: string;
  result: RuleResultValue;
  required: boolean;
  expected: string | null;
  observed: string | null;
  evidence: EvidenceRef[];
  /** Parallel to `evidence`: the excerpt body or null. Never leaves the excerpt table. */
  excerpts: (string | null)[];
}
export interface ParsedResult {
  attemptNo: number;
  inputManifestDigest: string;
  executorVersion: string | null;
  executorDigest: string | null;
  ruleSetRevision: string | null;
  summary: Record<string, unknown> | null;
  results: ParsedRuleResult[];
  resultDigest: string;
}

const SHA256 = /^[0-9a-f]{64}$/;
// Refused anywhere in a text field: the platform is the last line of defence, masking is the worker's job.
const SECRET_PATTERNS: readonly RegExp[] = [
  /\bap_[0-9a-f]{8}_[A-Za-z0-9_-]{20,}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{30,}/,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/,
  /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}/i,
  /\b(?:password|passwd|secret|api[_-]?key|access[_-]?token|auth[_-]?token)\s*[:=]\s*\S{6,}/i,
];
export const looksSecret = (text: string): boolean => SECRET_PATTERNS.some((p) => p.test(text));

// eslint-disable-next-line no-control-regex -- the point of the check: strip C0 / DEL / C1 controls
const CONTROL_ANY = /[\u0000-\u001f\u007f-\u009f]/g;
// eslint-disable-next-line no-control-regex -- excerpts keep tab and line feed
const CONTROL_KEEP_WS = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g;
const oneLine = (s: string): string => s.replace(CONTROL_ANY, '').trim();
const multiLine = (s: string): string => s.replace(CONTROL_KEEP_WS, '');
const chars = (s: string): number => [...s].length;

const text = z.string({ required_error: 'required', invalid_type_error: 'malformed' });
const bodySchema = z
  .object({
    attemptNo: z.number({ required_error: 'required', invalid_type_error: 'malformed' }).int('malformed').min(1, 'malformed'),
    inputManifestDigest: text.regex(SHA256, 'malformed'),
    executorVersion: text.nullish(),
    executorDigest: text.nullish(),
    ruleSetRevision: text.nullish(),
    summary: z.record(z.unknown()).nullish(),
    results: z.array(z.unknown(), { required_error: 'required', invalid_type_error: 'malformed' }),
  })
  .strict();

const resultSchema = z
  .object({
    ruleId: text,
    result: z.enum(RULE_RESULTS, { errorMap: (_i, ctx) => ({ message: ctx.data === undefined ? 'required' : 'malformed' }) }),
    required: z.boolean({ required_error: 'required', invalid_type_error: 'malformed' }),
    expected: text.nullish(),
    observed: text.nullish(),
    evidence: z.array(z.unknown(), { invalid_type_error: 'malformed' }).nullish(),
  })
  .strict();

const evidenceSchema = z
  .object({
    fileRef: text,
    line: z.number({ required_error: 'required', invalid_type_error: 'malformed' }).int('malformed').min(1, 'malformed'),
    fileSha256: text.regex(SHA256, 'malformed'),
    excerpt: text.nullish(),
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

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

const SUMMARY_MAX_DEPTH = 16;
const SECRET = Symbol('secret');
const DEEP = Symbol('deep');
/** Copy of a JSON value with control characters removed from every string (keys too); SECRET / DEEP when refused. */
function cleanSummary(value: unknown, depth: number): unknown {
  if (depth > SUMMARY_MAX_DEPTH) return DEEP;
  if (typeof value === 'string') {
    const s = oneLine(value);
    return looksSecret(s) || looksSecret(value) ? SECRET : s;
  }
  if (Array.isArray(value)) {
    const out: unknown[] = [];
    for (const v of value) {
      const c = cleanSummary(v, depth + 1);
      if (c === SECRET || c === DEEP) return c;
      out.push(c);
    }
    return out;
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const key = oneLine(k);
      if (looksSecret(key) || looksSecret(k)) return SECRET;
      const c = cleanSummary(v, depth + 1);
      if (c === SECRET || c === DEEP) return c;
      out[key] = c;
    }
    return out;
  }
  return value;
}

export type ResultParse = { ok: true; value: ParsedResult } | { ok: false; errors: FieldError[] };

/** Strict parse + input checks. `sampleRefs` = the fileRefs of the Round sample set (evidence must be one of them). */
export function parseResultBody(raw: unknown, sampleRefs: ReadonlySet<string>): ResultParse {
  const head = bodySchema.safeParse(raw);
  if (!head.success) return { ok: false, errors: zodErrors(head.error, []) };
  const body = head.data;
  const errors: FieldError[] = [];
  const add = (path: (string | number)[], code: string) => errors.push({ path: path.map(String), code });

  if (body.results.length > RESULTS_MAX) return { ok: false, errors: [{ path: ['results'], code: 'too_many' }] };
  const meta = (key: 'executorVersion' | 'executorDigest' | 'ruleSetRevision'): string | null => {
    const v = body[key];
    if (v === undefined || v === null) return null;
    const s = oneLine(v);
    if (chars(s) > META_MAX) add([key], 'too_long');
    else if (looksSecret(s)) add([key], 'secret_detected');
    return s === '' ? null : s;
  };
  const executorVersion = meta('executorVersion');
  const executorDigest = meta('executorDigest');
  const ruleSetRevision = meta('ruleSetRevision');

  let summary: Record<string, unknown> | null = null;
  if (body.summary) {
    // Every string at every depth, keys and values, is normalized and secret-checked before anything is serialized or stored.
    const walked = cleanSummary(body.summary, 0);
    if (walked === SECRET) add(['summary'], 'secret_detected');
    else if (walked === DEEP) add(['summary'], 'malformed');
    else if (Buffer.byteLength(JSON.stringify(walked), 'utf8') > SUMMARY_MAX_BYTES) add(['summary'], 'too_long');
    else summary = walked as Record<string, unknown>;
  }

  const results: ParsedRuleResult[] = [];
  const seenRules = new Set<string>();
  let excerptBytes = 0;
  body.results.forEach((rawResult, i) => {
    const r = resultSchema.safeParse(rawResult);
    if (!r.success) {
      errors.push(...zodErrors(r.error, ['results', i]));
      return;
    }
    const ruleId = oneLine(r.data.ruleId);
    if (ruleId === '') add(['results', i, 'ruleId'], 'required');
    else if (chars(ruleId) > RULE_ID_MAX) add(['results', i, 'ruleId'], 'too_long');
    else if (looksSecret(ruleId)) add(['results', i, 'ruleId'], 'secret_detected');
    else if (seenRules.has(ruleId)) add(['results', i, 'ruleId'], 'duplicate');
    seenRules.add(ruleId);

    const line = (key: 'expected' | 'observed'): string | null => {
      const v = r.data[key];
      if (v === undefined || v === null) return null;
      const s = oneLine(v);
      if (chars(s) > OBSERVED_MAX) add(['results', i, key], 'too_long');
      else if (looksSecret(s)) add(['results', i, key], 'secret_detected');
      return s === '' ? null : s;
    };
    const expected = line('expected');
    const observed = line('observed');

    const rawEvidence = r.data.evidence ?? [];
    if (rawEvidence.length > EVIDENCE_PER_RESULT_MAX) {
      add(['results', i, 'evidence'], 'too_many');
      return;
    }
    const evidence: EvidenceRef[] = [];
    const excerpts: (string | null)[] = [];
    rawEvidence.forEach((rawEv, j) => {
      const e = evidenceSchema.safeParse(rawEv);
      if (!e.success) {
        errors.push(...zodErrors(e.error, ['results', i, 'evidence', j]));
        return;
      }
      const fileRef = e.data.fileRef.trim();
      if (!sampleRefs.has(fileRef)) add(['results', i, 'evidence', j, 'fileRef'], 'not_in_sample');
      let excerpt: string | null = null;
      if (e.data.excerpt !== undefined && e.data.excerpt !== null) {
        const raw = multiLine(e.data.excerpt);
        if (chars(raw) > EXCERPT_MAX) add(['results', i, 'evidence', j, 'excerpt'], 'too_long');
        else if (looksSecret(raw)) add(['results', i, 'evidence', j, 'excerpt'], 'secret_detected');
        else if (raw !== '') {
          excerpt = raw;
          excerptBytes += Buffer.byteLength(raw, 'utf8');
        }
      }
      evidence.push({ fileRef, line: e.data.line, fileSha256: e.data.fileSha256, hasExcerpt: excerpt !== null });
      excerpts.push(excerpt);
    });
    results.push({ ruleId, result: r.data.result, required: r.data.required, expected, observed, evidence, excerpts });
  });
  if (excerptBytes > EXCERPT_TOTAL_MAX_BYTES) add(['results'], 'excerpt_total_too_large');
  if (errors.length > 0) return { ok: false, errors };

  const value = {
    attemptNo: body.attemptNo,
    inputManifestDigest: body.inputManifestDigest,
    executorVersion,
    executorDigest,
    ruleSetRevision,
    summary,
    results,
  };
  const resultDigest = createHash('sha256').update(canonical(value), 'utf8').digest('hex');
  return { ok: true, value: { ...value, resultDigest } };
}
