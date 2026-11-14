import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { defined } from '../../../test-support/defined.js';
import { diagnosticTotalError, parseDiagnosticBody } from '../domain/diagnostic-payload.js';
import { projectWorkerSummary } from '../domain/worker-summary-projection.js';

const digest = 'a'.repeat(64);
const context = { sampleRefs: new Set(['sample']), ruleIds: new Set(['rule']), inputManifestDigest: digest };
const entry = (over: Record<string, unknown> = {}) => ({ itemKey: 'item', origin: 'analysis', title: 'Synthetic title', ...over });
const table = (over: Record<string, unknown> = {}) => ({ tableKey: 'data', columns: [{ key: 'value', label: 'Value', type: 'string' }], rows: [{ value: 'synthetic cell' }], ...over });
const body = (items: unknown[] = [entry()], over: Record<string, unknown> = {}) => ({ schemaVersion: 1, producer: 'synthetic', producerVersion: '1.0', inputManifestDigest: digest, items, ...over });
const codes = (raw: unknown) => { const r = parseDiagnosticBody(raw, context); return r.ok ? [] : r.errors.map((e) => `${e.path.join('.')}:${e.code}`); };

describe('diagnostic payload', () => {
  it('normalizes controls before computing a stable digest and keeps explanation LF/TAB', () => {
    expect(parseDiagnosticBody(body([entry({ title: 'Synthetic\u0000 title' })]), context)).toEqual(parseDiagnosticBody(body(), context));
    const r = parseDiagnosticBody(body([entry({ explanation: '\tline\nnext\u0000', tables: [table({ rows: [{}] })] })]), context);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(defined(r.value.items[0]).explanation).toBe('\tline\nnext');
    expect(defined(defined(r.value.items[0]).tables?.[0]).rows).toEqual([{ value: null }]);
  });
  it.each([
    ['schemaVersion', body(undefined, { schemaVersion: 2 }), 'schemaVersion:unsupported_version'],
    ['manifest', body(undefined, { inputManifestDigest: 'b'.repeat(64) }), 'inputManifestDigest:manifest_mismatch'],
    ['missing rule link', body([entry({ origin: 'rule' })]), 'items.0.ruleId:not_in_attempt'],
    ['foreign rule', body([entry({ ruleId: 'other' })]), 'items.0.ruleId:not_in_attempt'],
    ['foreign sample', body([entry({ evidenceRefs: [{ fileRef: 'foreign', line: 1, fileSha256: digest }] })]), 'items.0.evidenceRefs.0.fileRef:not_in_sample'],
    ['duplicate item', body([entry(), entry()]), 'items.1.itemKey:duplicate'],
    ['duplicate table', body([entry({ tables: [table(), table()] })]), 'items.0.tables.1.tableKey:duplicate'],
    ['duplicate column', body([entry({ tables: [table({ columns: [{ key: 'x', label: 'X', type: 'number' }, { key: 'x', label: 'Y', type: 'number' }], rows: [] })] })]), 'items.0.tables.0.columns:duplicate'],
    ['unknown field', body(undefined, { attachment: 'file' }), 'attachment:malformed'],
    ['empty items', body([]), 'items:malformed'],
    ['empty columns', body([entry({ tables: [table({ columns: [] })] })]), 'items.0.tables.0.columns:malformed'],
    ['unknown cell', body([entry({ tables: [table({ rows: [{ other: 'x' }] })] })]), 'items.0.tables.0.rows.0.other:malformed'],
    ['nested cell', body([entry({ tables: [table({ rows: [{ value: { nested: 'x' } }] })] })]), 'items.0.tables.0.rows.0.value:malformed'],
    ['array cell', body([entry({ tables: [table({ rows: [{ value: ['x'] }] })] })]), 'items.0.tables.0.rows.0.value:malformed'],
    ['type mismatch', body([entry({ tables: [table({ rows: [{ value: 42 }] })] })]), 'items.0.tables.0.rows.0.value:malformed'],
    ['NaN', body([entry({ tables: [table({ columns: [{ key: 'value', label: 'Value', type: 'number' }], rows: [{ value: NaN }] })] })]), 'items.0.tables.0.rows.0.value:malformed'],
    ['infinite number', body([entry({ tables: [table({ columns: [{ key: 'value', label: 'Value', type: 'number' }], rows: [{ value: Infinity }] })] })]), 'items.0.tables.0.rows.0.value:malformed'],
  ])('refuses %s atomically', (_label, raw, expected) => expect(codes(raw)).toContain(expected));

  it.each([
    ['items', 500, (n: number) => body(Array.from({ length: n }, (_, i) => entry({ itemKey: `item${i}` })))],
    ['tables', 4, (n: number) => body([entry({ tables: Array.from({ length: n }, (_, i) => table({ tableKey: `t${i}` })) })])],
    ['columns', 16, (n: number) => body([entry({ tables: [table({ columns: Array.from({ length: n }, (_, i) => ({ key: `c${i}`, label: 'Column', type: 'string' })), rows: [] })] })])],
    ['rows', 200, (n: number) => body([entry({ tables: [table({ rows: Array.from({ length: n }, () => ({ value: 'x' })) })] })])],
    ['evidenceRefs', 20, (n: number) => body([entry({ evidenceRefs: Array.from({ length: n }, () => ({ fileRef: 'sample', line: 1, fileSha256: digest })) })])],
  ])('%s accepts its count boundary and refuses the next value', (_field, max, make) => {
    expect(codes(make(max))).toEqual([]);
    expect(codes(make(max + 1)).some((code) => code.endsWith(':too_many'))).toBe(true);
  });
  it.each([
    ['title', 200, (s: string) => body([entry({ title: s })])],
    ['explanation', 4000, (s: string) => body([entry({ explanation: s })])],
    ['table title', 200, (s: string) => body([entry({ tables: [table({ title: s })] })])],
    ['label', 80, (s: string) => body([entry({ tables: [table({ columns: [{ key: 'value', label: s, type: 'string' }] })] })])],
    ['cell', 500, (s: string) => body([entry({ tables: [table({ rows: [{ value: s }] })] })])],
    ['itemKey', 200, (s: string) => body([entry({ itemKey: s })])],
    ['producer', 64, (s: string) => body(undefined, { producer: s })],
    ['producerVersion', 64, (s: string) => body(undefined, { producerVersion: s })],
    ['tableKey', 32, (s: string) => body([entry({ tables: [table({ tableKey: s })] })])],
    ['column key', 32, (s: string) => body([entry({ tables: [table({ columns: [{ key: s, label: 'Value', type: 'string' }], rows: [] })] })])],
  ])('%s accepts the character boundary and rejects overflow without truncation', (_label, max, make) => {
    expect(codes(make('x'.repeat(max)))).toEqual([]);
    expect(codes(make('x'.repeat(max + 1))).length).toBeGreaterThan(0);
  });
  const secrets = ['ap_1234abcd_' + 'a'.repeat(20), '-----BEGIN PRIVATE KEY-----', 'AKIA' + 'A'.repeat(16), 'ghp_' + 'a'.repeat(30), 'xoxb-' + 'a'.repeat(10), 'eyJabcdefgh.eyJabcdefgh.abcdefgh', 'Bearer ' + 'a'.repeat(20), 'api_key=\u0000abcdef1234'];
  it.each(secrets)('refuses a known secret pattern in Source text: %s', (secret) => {
    for (const raw of [body([entry({ title: secret })]), body([entry({ explanation: secret })]), body([entry({ itemKey: secret })]), body([entry({ tables: [table({ title: secret })] })]), body([entry({ tables: [table({ columns: [{ key: 'value', label: secret, type: 'string' }] })] })]), body([entry({ tables: [table({ rows: [{ value: secret }] })] })])]) expect(codes(raw).some((e) => e.endsWith(':secret_detected'))).toBe(true);
  });
  it('caps normalized UTF-8 at exactly 512 KiB, including accumulated producer bytes', () => {
    const make = (padding: number) => body(Array.from({ length: 128 }, (_, i) => entry({ itemKey: `i${i}`, explanation: i === 127 ? 'x'.repeat(padding) : 'x'.repeat(4000) })));
    const parsed = parseDiagnosticBody(make(0), context);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const padding = 524288 - parsed.byteCount;
    expect(padding).toBeGreaterThan(0);
    expect(padding).toBeLessThanOrEqual(4000);
    const atLimit = parseDiagnosticBody(make(padding), context);
    expect(atLimit.ok && atLimit.byteCount).toBe(524288);
    expect(codes(make(padding + 1))).toContain('items:diagnostic_total_too_large');
    expect(diagnosticTotalError({ producers: 3, byteCount: 524288 - parsed.byteCount }, parsed.byteCount)).toBeNull();
    expect(diagnosticTotalError({ producers: 3, byteCount: 524289 - parsed.byteCount }, parsed.byteCount)?.code).toBe('diagnostic_total_too_large');
    expect(diagnosticTotalError({ producers: 4, byteCount: 0 }, 1)?.code).toBe('too_many');
    expect(codes(body(Array.from({ length: 140 }, (_, i) => entry({ itemKey: `i${i}`, explanation: '한'.repeat(4000) }))))).toContain('items:diagnostic_total_too_large');
  });
  it('accepts rule membership, finite numbers, booleans and nulls while counting Unicode characters', () => {
    const raw = body([entry({ origin: 'rule', ruleId: 'rule', title: '😀'.repeat(200), tables: [table({ columns: [{ key: 'n', label: 'Number', type: 'number' }, { key: 'b', label: 'Boolean', type: 'boolean' }], rows: [{ n: 3.14, b: true }, { n: null, b: null }] })] })]);
    expect(codes(raw)).toEqual([]);
  });
  it('secret checks cover keys, producer metadata and evidence strings too', () => {
    const secret = 'ghp_' + 'a'.repeat(30);
    for (const raw of [body(undefined, { producer: secret }), body(undefined, { producerVersion: secret }), body([entry({ tables: [table({ tableKey: secret })] })]), body([entry({ tables: [table({ columns: [{ key: secret, label: 'Label', type: 'string' }], rows: [{ [secret]: 'value' }] })] })]), body([entry({ evidenceRefs: [{ fileRef: secret, line: 1, fileSha256: digest }] })])]) expect(codes(raw).some((e) => e.endsWith(':secret_detected'))).toBe(true);
  });
  it('summary projection never exposes diagnostic prose', () => {
    expect(JSON.stringify(projectWorkerSummary({ producer: 'synthetic', diagnostics: { title: 'SOURCE-TEXT' }, title: 'SOURCE-TEXT', explanation: 'SOURCE-TEXT', tables: [table()] }))).not.toContain('SOURCE-TEXT');
  });
  it('verdict, Gate, Knowledge, comparison and opinion paths do not read diagnostic tables', () => {
    const dirs = ['../domain', '../../log-knowledge', '../../log-datasets'];
    const walk = (url: URL): URL[] => readdirSync(url, { withFileTypes: true }).flatMap((e) => e.isDirectory() && e.name !== '__tests__' ? walk(new URL(`${e.name}/`, url)) : e.isFile() && e.name.endsWith('.ts') ? [new URL(e.name, url)] : []);
    const files = dirs.flatMap((dir) => walk(new URL(`${dir}/`, import.meta.url))).filter((url) => !url.pathname.includes('/diagnostic-'));
    files.push(...['gate-availability.ts', 'repositories/gate.ts', 'gate-actions.ts', 'opinion-service.ts', 'repositories/opinion-read.ts', 'repositories/opinion-write.ts', 'suite-result-read-port.ts'].map((name) => new URL(`../${name}`, import.meta.url)));
    for (const file of files) expect(readFileSync(file, 'utf8'), file.pathname).not.toMatch(/attempt_diagnostic|attemptDiagnostics|attemptDiagnosticItems|diagnostic-read|diagnostic-write/);
  });
});
