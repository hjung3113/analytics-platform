// Boundary validation, canonical form and digests of a validation catalog report (#1491, design §5.1). Pure functions:
// the route and the tests share them. Order of judgment: byte size (before any parse) → JSON → closed shape and
// limits (the `@ap/contract-schemas` v0 schema) → control characters → secret patterns → duplicate keys.

import { createHash } from 'node:crypto';

import {
  VALIDATION_CATALOG_REPORT_LIMITS as LIMITS,
  type VALIDATION_CATALOG_REPORT_FIELD_CODES,
  validationCatalogReportSchema,
} from '@ap/contract-schemas';

import { findSecretPattern, hasControlCharacter } from './secret-patterns.js';

export type FieldCode = (typeof VALIDATION_CATALOG_REPORT_FIELD_CODES)[number];
export interface FieldError {
  path: (string | number)[];
  code: FieldCode;
}

export interface ReportTarget {
  format: string;
  target: string;
  requirementIds?: string[] | undefined;
}
export interface ReportRule {
  ruleKey: string;
  title: string;
  summary: string;
  support: 'supported' | 'partial' | 'unsupported' | 'unknown';
  scope?: Record<string, unknown> | undefined;
  requiredDefault?: boolean | undefined;
  targets?: ReportTarget[] | undefined;
}
export interface ReportRuleSet {
  ruleSetKey: string;
  revision: string;
  resultRef?: string | undefined;
  status: 'active' | 'retired';
  supersedes?: string | undefined;
  rules: ReportRule[];
}
export interface CatalogReport {
  sourceSystem: string;
  validatorVersion: string;
  ruleSets: ReportRuleSet[];
}

export interface ReportCounts {
  ruleSetCount: number;
  ruleCount: number;
  targetCount: number;
}

export type Judgment =
  | { ok: true; report: CatalogReport; counts: ReportCounts }
  | { ok: false; fields: FieldError[]; reason: FieldCode; sourceSystem: string | null };

const MAX_REPORTED_FIELDS = 50;
const IDENTIFIER_FIELDS = new Set(['sourceSystem', 'validatorVersion', 'ruleSetKey', 'revision', 'resultRef', 'supersedes', 'ruleKey']);

const refusal = (fields: FieldError[], sourceSystem: string | null = null): Judgment => ({
  ok: false,
  fields: fields.slice(0, MAX_REPORTED_FIELDS),
  reason: (fields[0] as FieldError).code,
  sourceSystem,
});

/** The refusal of the whole body before it is parsed. */
export function judgeBodySize(bytes: number): Judgment | null {
  return bytes > LIMITS.bodyBytes ? refusal([{ path: [], code: 'too_large' }]) : null;
}

export function judgeReport(body: Buffer): Judgment {
  const tooLarge = judgeBodySize(body.byteLength);
  if (tooLarge) return tooLarge;
  let json: unknown;
  try {
    // Strict UTF-8: invalid bytes are refused, never replaced by U+FFFD (the stored text must be what was sent).
    json = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body));
  } catch {
    return refusal([{ path: [], code: 'invalid_json' }]);
  }

  const parsed = validationCatalogReportSchema.safeParse(json);
  if (!parsed.success) {
    const fields: FieldError[] = [];
    for (const issue of parsed.error.issues) {
      const path = issue.path.filter((p): p is string | number => typeof p === 'string' || typeof p === 'number');
      if (issue.code === 'unrecognized_keys') {
        for (const key of issue.keys) fields.push({ path: [...path, key], code: 'unknown_field' });
        continue;
      }
      const last = path[path.length - 1];
      const before = fields.length;
      const stringIssue = issue.code === 'too_small' || issue.code === 'too_big' || issue.code === 'invalid_format';
      if (typeof last === 'string' && IDENTIFIER_FIELDS.has(last) && stringIssue) {
        fields.push({ path, code: 'invalid_identifier' });
      } else if (issue.code === 'too_big') {
        fields.push({ path, code: 'too_large' });
      } else {
        fields.push({ path, code: 'invalid_value' });
      }
      // One entry per path and code: an empty identifier fails both the length and the format rule.
      const added = fields[before] as FieldError;
      if (fields.slice(0, before).some((f) => f.code === added.code && f.path.join('\u0000') === added.path.join('\u0000'))) fields.pop();
    }
    return refusal(fields.length > 0 ? fields : [{ path: [], code: 'invalid_value' }]);
  }
  const report = parsed.data as CatalogReport;
  // The source system is kept on a rejected row only once it passed the same text checks as everything else.
  const source = textFieldsOf(report);
  const sourceOk = !source.some((f) => f.path[0] === 'sourceSystem' && (hasControlCharacter(f.text) || findSecretPattern(f.text) !== null));

  const ruleCount = report.ruleSets.reduce((n, rs) => n + rs.rules.length, 0);
  if (ruleCount > LIMITS.rules) return refusal([{ path: ['ruleSets'], code: 'too_large' }], sourceOk ? report.sourceSystem : null);

  const fields: FieldError[] = [];
  for (const f of source) if (hasControlCharacter(f.text)) fields.push({ path: f.path, code: 'control_character' });
  for (const f of source) if (!hasControlCharacter(f.text) && findSecretPattern(f.text) !== null) fields.push({ path: f.path, code: 'secret_pattern' });
  fields.push(...duplicateKeys(report));
  if (fields.length > 0) return refusal(fields, sourceOk ? report.sourceSystem : null);

  const counts: ReportCounts = {
    ruleSetCount: report.ruleSets.length,
    ruleCount,
    targetCount: report.ruleSets.reduce((n, rs) => n + rs.rules.reduce((m, r) => m + (r.targets?.length ?? 0), 0), 0),
  };
  return { ok: true, report, counts };
}

interface TextField {
  path: (string | number)[];
  text: string;
}

/** Every string the platform would store: identifiers and free text alike. */
function textFieldsOf(report: CatalogReport): TextField[] {
  const out: TextField[] = [
    { path: ['sourceSystem'], text: report.sourceSystem },
    { path: ['validatorVersion'], text: report.validatorVersion },
  ];
  report.ruleSets.forEach((rs, i) => {
    const base = ['ruleSets', i];
    out.push({ path: [...base, 'ruleSetKey'], text: rs.ruleSetKey }, { path: [...base, 'revision'], text: rs.revision });
    if (rs.resultRef !== undefined) out.push({ path: [...base, 'resultRef'], text: rs.resultRef });
    if (rs.supersedes !== undefined) out.push({ path: [...base, 'supersedes'], text: rs.supersedes });
    rs.rules.forEach((rule, j) => {
      const rp = [...base, 'rules', j];
      out.push({ path: [...rp, 'ruleKey'], text: rule.ruleKey }, { path: [...rp, 'title'], text: rule.title }, { path: [...rp, 'summary'], text: rule.summary });
      for (const [key, value] of Object.entries(rule.scope ?? {})) {
        if (typeof value === 'string') out.push({ path: [...rp, 'scope', key], text: value });
        else if (Array.isArray(value)) value.forEach((item, k) => out.push({ path: [...rp, 'scope', key, k], text: String(item) }));
      }
      rule.targets?.forEach((t, k) => {
        const tp = [...rp, 'targets', k];
        out.push({ path: [...tp, 'format'], text: t.format }, { path: [...tp, 'target'], text: t.target });
        t.requirementIds?.forEach((id, m) => out.push({ path: [...tp, 'requirementIds', m], text: id }));
      });
    });
  });
  return out;
}

/** The effective `result_ref` of a Revision: the reported one, else its `revision`. */
export const resultRefOf = (rs: Pick<ReportRuleSet, 'revision' | 'resultRef'>): string => rs.resultRef ?? rs.revision;

function duplicateKeys(report: CatalogReport): FieldError[] {
  const out: FieldError[] = [];
  const revisions = new Set<string>();
  const refs = new Set<string>();
  report.ruleSets.forEach((rs, i) => {
    // A JSON array of two strings is an unambiguous key for exact (case- and whitespace-sensitive) comparison.
    const revisionKey = JSON.stringify([rs.ruleSetKey, rs.revision]);
    if (revisions.has(revisionKey)) out.push({ path: ['ruleSets', i, 'revision'], code: 'duplicate_key' });
    revisions.add(revisionKey);
    const refKey = JSON.stringify([rs.ruleSetKey, resultRefOf(rs)]);
    if (refs.has(refKey)) out.push({ path: ['ruleSets', i, 'resultRef'], code: 'duplicate_key' });
    refs.add(refKey);
    const keys = new Set<string>();
    rs.rules.forEach((rule, j) => {
      if (keys.has(rule.ruleKey)) out.push({ path: ['ruleSets', i, 'rules', j, 'ruleKey'], code: 'duplicate_key' });
      keys.add(rule.ruleKey);
    });
  });
  return out;
}

// ── Canonical form and digests ──────────────────────────────────────────────

/** JSON with object keys sorted; `undefined` members are absent. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export const sha256 = (data: string | Buffer): string => createHash('sha256').update(data).digest('hex');

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Order of RuleSets and Rules does not matter (a snapshot is a set); target order does (it is the declaration order). */
export function normalizeReport(report: CatalogReport): CatalogReport {
  return {
    sourceSystem: report.sourceSystem,
    validatorVersion: report.validatorVersion,
    ruleSets: report.ruleSets
      .map((rs) => ({ ...rs, resultRef: resultRefOf(rs), rules: [...rs.rules].sort((a, b) => compare(a.ruleKey, b.ruleKey)) }))
      .sort((a, b) => compare(a.ruleSetKey, b.ruleSetKey) || compare(a.revision, b.revision)),
  };
}

export const REPORT_DIGEST_DOMAIN = 'log_rules.catalog_report.v0\n';
/** A rejected body is keyed by its own domain: it must never equal the digest of a valid snapshot (`reportDigest`). */
export const REJECTED_DIGEST_DOMAIN = 'log_rules.catalog_report.rejected.v0\n';
export const rejectedDigest = (body: Buffer): string => sha256(Buffer.concat([Buffer.from(REJECTED_DIGEST_DOMAIN, 'utf8'), body]));
export const reportDigest = (normalized: CatalogReport): string => sha256(REPORT_DIGEST_DOMAIN + canonicalJson(normalized));
export const revisionDigest = (rs: ReportRuleSet): string => sha256(canonicalJson(rs));
export const ruleDigest = (rule: ReportRule): string => sha256(canonicalJson(rule));
