import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { FieldError } from '../../menu-dispatch/types.js';
import { looksSecret } from './result-payload.js';

export const DIAGNOSTIC_TOTAL_BYTES = 512 * 1024;
export const DIAGNOSTIC_PRODUCERS = 4;
// eslint-disable-next-line no-control-regex -- strip C0, DEL and C1, preserving LF/TAB only in explanations
const CONTROLS = /[\u0000-\u001f\u007f-\u009f]/g;
// eslint-disable-next-line no-control-regex -- explanation keeps LF and TAB, as excerpts do
const MULTILINE_CONTROLS = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g;
const chars = (s: string, min: number, max: number) => [...s].length >= min && [...s].length <= max;
const text = (min: number, max: number) => z.string().refine((s) => chars(s, min, max), 'malformed');
const key = z.string().regex(/^[a-z0-9_]{1,32}$/);
const sha = z.string().regex(/^[0-9a-f]{64}$/);
const evidence = z.object({ fileRef: text(1, 1024), line: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER), fileSha256: sha }).strict();
const column = z.object({ key, label: text(1, 80), type: z.enum(['string', 'number', 'boolean']) }).strict();
const table = z.object({ tableKey: key, title: text(0, 200).optional(), columns: z.array(column).min(1).max(16), rows: z.array(z.record(z.unknown())).max(200) }).strict();
const item = z.object({
  itemKey: z.string().regex(/^[A-Za-z0-9._:-]{1,200}$/), origin: z.enum(['rule', 'analysis']), ruleId: text(1, 200).optional(),
  title: text(1, 200), explanation: text(0, 4000).optional(), evidenceRefs: z.array(evidence).max(20).optional(), tables: z.array(table).max(4).optional(),
}).strict();
const schema = z.object({ schemaVersion: z.literal(1), producer: z.string().regex(/^[a-z0-9][a-z0-9._-]{0,63}$/), producerVersion: z.string().regex(/^[0-9A-Za-z][0-9A-Za-z.+_-]{0,63}$/), inputManifestDigest: sha, items: z.array(item).min(1).max(500) }).strict();
export type DiagnosticTable = z.infer<typeof table> & { rows: Record<string, string | number | boolean | null>[] };
export type DiagnosticBody = z.infer<typeof schema>;
export type DiagnosticParse = { ok: true; value: DiagnosticBody; digest: string; byteCount: number } | { ok: false; errors: FieldError[] };

/** Strict, atomic intake: normalize before hashing; raw and normalized text both pass the existing secret guard. */
export function parseDiagnosticBody(raw: unknown, context: { sampleRefs: ReadonlySet<string>; ruleIds: ReadonlySet<string>; inputManifestDigest: string }): DiagnosticParse {
  const errors: FieldError[] = [];
  const add = (path: (string | number)[], code: string) => errors.push({ path: path.map(String), code });
  const walk = (v: unknown, path: (string | number)[], depth = 0): unknown => {
    if (depth > 12) { add(path, 'malformed'); return null; }
    if (typeof v === 'string') {
      const multiline = path.length === 3 && path[0] === 'items' && path[2] === 'explanation';
      const clean = v.replace(multiline ? MULTILINE_CONTROLS : CONTROLS, '');
      if (looksSecret(v) || looksSecret(clean)) add(path, 'secret_detected');
      return clean;
    }
    if (Array.isArray(v)) return v.map((entry, i) => walk(entry, [...path, i], depth + 1));
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, val]) => {
      if (looksSecret(k) || looksSecret(k.replace(CONTROLS, ''))) add([...path, k], 'secret_detected');
      return [k, walk(val, [...path, k], depth + 1)];
    }));
    return v;
  };
  const parsed = schema.safeParse(walk(raw, []));
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      if (issue.code === 'unrecognized_keys') for (const k of issue.keys) add([...issue.path, k], 'malformed');
      else add(issue.path, issue.path[0] === 'schemaVersion' ? 'unsupported_version' : issue.code === 'too_big' && issue.type === 'array' ? 'too_many' : 'malformed');
    }
    return { ok: false, errors };
  }
  const value = parsed.data;
  if (value.inputManifestDigest !== context.inputManifestDigest) add(['inputManifestDigest'], 'manifest_mismatch');
  const itemKeys = new Set<string>();
  for (const [i, entry] of value.items.entries()) {
    const p = ['items', i];
    if (itemKeys.has(entry.itemKey)) add([...p, 'itemKey'], 'duplicate');
    itemKeys.add(entry.itemKey);
    if ((entry.origin === 'rule' && !entry.ruleId) || (entry.ruleId !== undefined && !context.ruleIds.has(entry.ruleId))) add([...p, 'ruleId'], 'not_in_attempt');
    for (const [j, ev] of (entry.evidenceRefs ?? []).entries()) if (!context.sampleRefs.has(ev.fileRef)) add([...p, 'evidenceRefs', j, 'fileRef'], 'not_in_sample');
    const tableKeys = new Set<string>();
    for (const [j, t] of (entry.tables ?? []).entries()) {
      const tp = [...p, 'tables', j];
      if (tableKeys.has(t.tableKey)) add([...tp, 'tableKey'], 'duplicate');
      tableKeys.add(t.tableKey);
      const columns = new Map(t.columns.map((c) => [c.key, c]));
      if (columns.size !== t.columns.length) add([...tp, 'columns'], 'duplicate');
      t.rows = t.rows.map((row, n) => {
        for (const k of Object.keys(row)) if (!columns.has(k)) add([...tp, 'rows', n, k], 'malformed');
        return Object.fromEntries(t.columns.map((c) => {
          const v = row[c.key] ?? null;
          if (v !== null && (typeof v !== c.type || (typeof v === 'number' && !Number.isFinite(v)) || (typeof v === 'string' && !chars(v, 0, 500)))) add([...tp, 'rows', n, c.key], 'malformed');
          return [c.key, v];
        }));
      });
    }
    // Omitted optional collections have the same normalized representation as empty ones.
    entry.evidenceRefs ??= [];
    entry.tables ??= [];
  }
  const serialized = JSON.stringify(value);
  const byteCount = Buffer.byteLength(serialized, 'utf8');
  if (byteCount > DIAGNOSTIC_TOTAL_BYTES) add(['items'], 'diagnostic_total_too_large');
  return errors.length ? { ok: false, errors } : { ok: true, value, byteCount, digest: createHash('sha256').update(serialized).digest('hex') };
}

export function diagnosticTotalError(stored: { producers: number; byteCount: number }, addedBytes: number): FieldError | null {
  if (stored.producers >= DIAGNOSTIC_PRODUCERS) return { path: ['producer'], code: 'too_many' };
  return stored.byteCount + addedBytes > DIAGNOSTIC_TOTAL_BYTES ? { path: ['items'], code: 'diagnostic_total_too_large' } : null;
}
