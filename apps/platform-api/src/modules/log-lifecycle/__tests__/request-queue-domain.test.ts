// #1445 d — the pure domain of the validation request queue: state table (and its drift against the guard trigger SQL),
// verdict, run window, result payload checks, read params and action inputs. No DB.

import { readFileSync, readdirSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { parseExcerptParams, parseRequestListParams, parseRuleResultParams } from '../domain/queue-params.js';
import { parseQueueInput } from '../domain/queue-input.js';
import { LEGAL_REQUEST_PAIRS, REQUEST_STATES, canMoveRequest, isTerminalRequest, stateAfterLeaseExpiry } from '../domain/request-states.js';
import { parseResultBody } from '../domain/result-payload.js';
import { DEFAULT_RUN_WINDOW, isWithinRunWindow, parseRunWindow } from '../domain/run-window.js';
import { type RULE_RESULTS, computeVerdict } from '../domain/verdict.js';

const H = (c: string) => c.repeat(64);
const REFS = new Set(['s3://x/f1.log', 's3://x/f2.log']);
const body = (over: Record<string, unknown> = {}, rule: Record<string, unknown> = {}) => ({
  attemptNo: 1,
  inputManifestDigest: H('a'),
  results: [{ ruleId: 'R-1', result: 'PASS', required: true, ...rule }],
  ...over,
});

describe('request state table', () => {
  it.each([
    ['queued', 'claimed'],
    ['queued', 'cancelled'],
    ['claimed', 'succeeded'],
    ['claimed', 'failed'],
    ['claimed', 'queued'],
    ['claimed', 'expired'],
    ['claimed', 'cancelled'],
    ['queued', 'succeeded'],
    ['queued', 'failed'],
  ] as const)('%s -> %s is legal', (from, to) => {
    expect(canMoveRequest(from, to)).toBe(true);
  });

  it.each(['succeeded', 'failed', 'cancelled', 'expired'] as const)('%s is terminal and never moves', (state) => {
    expect(isTerminalRequest(state)).toBe(true);
    for (const to of REQUEST_STATES) expect(canMoveRequest(state, to)).toBe(false);
  });

  it('a lease expiry requeues while attempts remain, else expires', () => {
    expect(stateAfterLeaseExpiry(1, 3)).toBe('queued');
    expect(stateAfterLeaseExpiry(2, 3)).toBe('queued');
    expect(stateAfterLeaseExpiry(3, 3)).toBe('expired');
  });

  it('LEGAL_REQUEST_PAIRS equals the guard trigger SQL (drift)', () => {
    const dir = new URL('../../../../migrations/', import.meta.url);
    const file = readdirSync(dir).find((f) => f.endsWith('.sql') && readFileSync(new URL(f, dir), 'utf8').includes('log_lifecycle.request_guard()'));
    expect(file).toBeDefined();
    const sql = readFileSync(new URL(file as string, dir), 'utf8');
    const block = /-- LEGAL_REQUEST_PAIRS begin\n([\s\S]*?)-- LEGAL_REQUEST_PAIRS end/.exec(sql)?.[1] ?? '';
    const fromSql: Record<string, string[]> = {};
    for (const m of block.matchAll(/OLD\.state = '(\w+)' AND NEW\.state IN \(([^)]*)\)/g)) {
      fromSql[m[1] as string] = [...(m[2] as string).matchAll(/'(\w+)'/g)].map((x) => x[1] as string);
    }
    expect(Object.keys(fromSql).sort()).toEqual(REQUEST_STATES.filter((s) => LEGAL_REQUEST_PAIRS[s].length > 0).sort());
    for (const s of REQUEST_STATES) if (LEGAL_REQUEST_PAIRS[s].length > 0) expect(fromSql[s], s).toEqual([...LEGAL_REQUEST_PAIRS[s]]);
  });
});

describe('computeVerdict', () => {
  const r = (result: (typeof RULE_RESULTS)[number], required = true) => ({ result, required });
  it('a FAIL is fail, even when the manifest differs', () => {
    expect(computeVerdict([r('PASS'), r('FAIL', false)], true)).toBe('fail');
    expect(computeVerdict([r('FAIL')], false)).toBe('fail');
  });
  it.each(['ERROR', 'NOT_CHECKED', 'SKIPPED'] as const)('a required %s is incomplete', (result) => {
    expect(computeVerdict([r('PASS'), r(result)], true)).toBe('incomplete');
  });
  it.each(['ERROR', 'NOT_CHECKED', 'SKIPPED'] as const)('an optional %s does not block pass', (result) => {
    expect(computeVerdict([r('PASS'), r(result, false)], true)).toBe('pass');
  });
  it('a manifest mismatch is incomplete', () => {
    expect(computeVerdict([r('PASS')], false)).toBe('incomplete');
  });
  it('WARN and NOT_APPLICABLE pass; no results at all passes', () => {
    expect(computeVerdict([r('WARN'), r('NOT_APPLICABLE')], true)).toBe('pass');
    expect(computeVerdict([], true)).toBe('pass');
  });
});

describe('run window (Asia/Seoul, weekdays 22-06, weekend all day)', () => {
  // 2026-11-09 is a Monday; Seoul is UTC+9.
  const seoul = (iso: string) => new Date(`${iso}+09:00`);
  it.each([
    ['2026-11-09T21:59:00', false],
    ['2026-11-09T22:00:00', true],
    ['2026-11-10T05:59:00', true],
    ['2026-11-10T06:00:00', false],
    ['2026-11-10T12:00:00', false],
    ['2026-11-14T12:00:00', true], // Saturday noon
    ['2026-11-15T12:00:00', true], // Sunday noon
    ['2026-11-16T05:00:00', true], // Monday small hours
    ['2026-11-16T12:00:00', false],
  ])('%s -> %s', (at, expected) => {
    expect(isWithinRunWindow(DEFAULT_RUN_WINDOW, seoul(at))).toBe(expected);
  });

  it('judges the wall clock of the configured zone, not the server zone', () => {
    const utc = { ...DEFAULT_RUN_WINDOW, timezone: 'UTC' };
    expect(isWithinRunWindow(utc, new Date('2026-11-10T12:00:00Z'))).toBe(false);
    expect(isWithinRunWindow(utc, new Date('2026-11-10T23:00:00Z'))).toBe(true);
  });

  it('weekendAllDay=false keeps a weekend inside the hour range only', () => {
    const w = { ...DEFAULT_RUN_WINDOW, weekendAllDay: false };
    expect(isWithinRunWindow(w, seoul('2026-11-14T12:00:00'))).toBe(false);
    expect(isWithinRunWindow(w, seoul('2026-11-14T23:00:00'))).toBe(true);
  });

  it.each([
    [{ timezone: 'Nowhere/City', weekday: { fromHour: 22, toHour: 6 }, weekendAllDay: true }],
    [{ timezone: 'UTC', weekday: { fromHour: 25, toHour: 6 }, weekendAllDay: true }],
    [{ timezone: 'UTC', weekday: { fromHour: 22, toHour: 6 }, weekendAllDay: 'yes' }],
    [{ timezone: 'UTC', weekday: { fromHour: 22, toHour: 6 }, weekendAllDay: true, extra: 1 }],
    ['text'],
    [null],
  ])('parseRunWindow refuses %j', (raw) => {
    expect(parseRunWindow(raw)).toBeNull();
  });
  it('parseRunWindow accepts the default', () => {
    expect(parseRunWindow(DEFAULT_RUN_WINDOW)).toEqual(DEFAULT_RUN_WINDOW);
  });
});

describe('parseResultBody', () => {
  it('normalises and digests a valid body, order-independent for keys', () => {
    const a = parseResultBody(body({}, { evidence: [{ fileRef: 's3://x/f1.log', line: 3, fileSha256: H('b'), excerpt: 'line one\nline two' }] }), REFS);
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    expect(a.value.results[0]?.evidence).toEqual([{ fileRef: 's3://x/f1.log', line: 3, fileSha256: H('b'), hasExcerpt: true }]);
    expect(a.value.results[0]?.excerpts).toEqual(['line one\nline two']);
    const reordered = { results: body().results, inputManifestDigest: H('a'), attemptNo: 1 };
    const b = parseResultBody(reordered, REFS);
    const c = parseResultBody(body(), REFS);
    expect(b.ok && c.ok && b.value.resultDigest === c.value.resultDigest).toBe(true);
    expect(c.ok && a.value.resultDigest !== c.value.resultDigest).toBe(true);
  });

  it.each([
    ['a value at depth 2', { a: { b: 'ap_0123abcd_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef0123456789-_' } }],
    ['a value inside an array', { a: [{ b: ['x', 'Bearer abcdefghijklmnopqrstuvwxyz0123'] }] }],
    ['a key', { 'ap_0123abcd_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef0123456789-_': 1 }],
    ['a secret hidden by a control character', { a: { b: 'ap_0123abcd_ABCDEFGHIJKLMNOPQRSTUVWXYZ\u0000abcdef0123456789-_' } }],
  ])('refuses a secret in %s of the summary', (_label, summary) => {
    const r = parseResultBody({ ...body(), summary }, REFS);
    expect(r).toMatchObject({ ok: false, errors: [{ path: ['summary'], code: 'secret_detected' }] });
  });
  it('keeps a harmless summary (control characters removed) and refuses an oversized or too deep one', () => {
    const ok = parseResultBody({ ...body(), summary: { note: 'a\u0000b', secret: 'deep', n: [1, { x: 'secret' }] } }, REFS);
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.value.summary).toEqual({ note: 'ab', secret: 'deep', n: [1, { x: 'secret' }] });
    expect(parseResultBody({ ...body(), summary: { big: 'x'.repeat(5000) } }, REFS)).toMatchObject({ ok: false, errors: [{ path: ['summary'], code: 'too_long' }] });
    let nested: unknown = 'x';
    for (let i = 0; i < 30; i++) nested = { n: nested };
    expect(parseResultBody({ ...body(), summary: nested }, REFS)).toMatchObject({ ok: false, errors: [{ path: ['summary'], code: 'malformed' }] });
  });

  it('removes control characters instead of keeping them', () => {
    const r = parseResultBody(body({}, { observed: 'a\u0000b\u0007c', evidence: [{ fileRef: 's3://x/f1.log', line: 1, fileSha256: H('b'), excerpt: 'x\u0000y\tz' }] }), REFS);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.results[0]?.observed).toBe('abc');
      expect(r.value.results[0]?.excerpts[0]).toBe('xy\tz');
    }
  });

  const evidence = (extra: Record<string, unknown>) => ({ evidence: [{ fileRef: 's3://x/f1.log', line: 1, fileSha256: H('b'), ...extra }] });
  it.each([
    ['excerpt over 2,000 chars', body({}, evidence({ excerpt: 'x'.repeat(2001) })), 'results.0.evidence.0.excerpt', 'too_long'],
    ['observed over 500 chars', body({}, { observed: 'x'.repeat(501) }), 'results.0.observed', 'too_long'],
    ['21 evidence entries', body({}, { evidence: Array.from({ length: 21 }, () => ({ fileRef: 's3://x/f1.log', line: 1, fileSha256: H('b') })) }), 'results.0.evidence', 'too_many'],
    ['a file outside the sample set', body({}, { evidence: [{ fileRef: 's3://x/other.log', line: 1, fileSha256: H('b') }] }), 'results.0.evidence.0.fileRef', 'not_in_sample'],
    ['a platform token in an excerpt', body({}, evidence({ excerpt: 'auth ap_0123abcd_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef0123456789-_ok' })), 'results.0.evidence.0.excerpt', 'secret_detected'],
    ['a private key header in observed', body({}, { observed: '-----BEGIN RSA PRIVATE KEY-----' }), 'results.0.observed', 'secret_detected'],
    ['a password assignment in an excerpt', body({}, evidence({ excerpt: 'password = hunter2hunter2' })), 'results.0.evidence.0.excerpt', 'secret_detected'],
    ['a platform token as the rule id', body({ results: [{ ruleId: 'ap_0123abcd_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef0123456789-_', result: 'PASS', required: true }] }), 'results.0.ruleId', 'secret_detected'],
    ['an unknown result value', body({}, { result: 'MAYBE' }), 'results.0.result', 'malformed'],
    ['a duplicate rule id', body({ results: [{ ruleId: 'R', result: 'PASS', required: true }, { ruleId: 'R', result: 'PASS', required: true }] }), 'results.1.ruleId', 'duplicate'],
    ['an unknown top-level key (no AI opinion path)', body({ aiOpinion: 'looks fine', verdict: 'pass' }), 'aiOpinion', 'malformed'],
    ['an unknown result key', body({}, { aiOpinion: 'pass' }), 'results.0.aiOpinion', 'malformed'],
    ['a bad manifest digest', body({ inputManifestDigest: 'abc' }), 'inputManifestDigest', 'malformed'],
  ])('refuses %s', (_label, input, path, code) => {
    const r = parseResultBody(input, REFS);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.map((e) => `${e.path.join('.')}:${e.code}`)).toContain(`${path}:${code}`);
  });

  it('refuses excerpts over 256 KB in total', () => {
    const results = Array.from({ length: 140 }, (_v, i) => ({
      ruleId: `R-${i}`,
      result: 'FAIL',
      required: true,
      evidence: Array.from({ length: 1 }, () => ({ fileRef: 's3://x/f1.log', line: 1, fileSha256: H('b'), excerpt: 'é'.repeat(1000) })),
    }));
    const r = parseResultBody(body({ results }), REFS);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.map((e) => e.code)).toContain('excerpt_total_too_large');
  });
});

describe('read params and action inputs', () => {
  it('request list: defaults, enums and bounds', () => {
    expect(parseRequestListParams({}).ok).toBe(true);
    expect(parseRequestListParams({ states: ['queued', 'claimed'], priority: 2, immediate: true }).ok).toBe(true);
    expect(parseRequestListParams({ states: ['nope'] }).ok).toBe(false);
    expect(parseRequestListParams({ priority: 3 }).ok).toBe(false);
    expect(parseRequestListParams({ from: '2026-11-09' }).ok).toBe(false);
    expect(parseRequestListParams({ page: -1 }).ok).toBe(false);
  });
  it('rule results and excerpt params need uuids and a bounded evidence index', () => {
    const id = '0f2c1c0e-8a53-4c43-9d0b-6a7f3a1d2e10';
    expect(parseRuleResultParams({ attemptId: id, results: ['FAIL'], required: true }).ok).toBe(true);
    expect(parseRuleResultParams({ attemptId: 'x' }).ok).toBe(false);
    expect(parseExcerptParams({ ruleResultId: id, evidenceIndex: 19 }).ok).toBe(true);
    expect(parseExcerptParams({ ruleResultId: id, evidenceIndex: 20 }).ok).toBe(false);
  });
  it('requestCreate: priority is 0-2 and required; maxAttempts 1-10', () => {
    const id = '0f2c1c0e-8a53-4c43-9d0b-6a7f3a1d2e10';
    expect(parseQueueInput('requestCreate', { roundId: id, priority: 1 }).ok).toBe(true);
    expect(parseQueueInput('requestCreate', { roundId: id }).ok).toBe(false);
    expect(parseQueueInput('requestCreate', { roundId: id, priority: 3 }).ok).toBe(false);
    expect(parseQueueInput('requestCreate', { roundId: id, priority: 0, maxAttempts: 11 }).ok).toBe(false);
  });
  it('queueSettingsUpdate needs one setting and a valid window', () => {
    expect(parseQueueInput('queueSettingsUpdate', {}).ok).toBe(false);
    expect(parseQueueInput('queueSettingsUpdate', { leaseSeconds: 10 }).ok).toBe(false);
    expect(parseQueueInput('queueSettingsUpdate', { runWindow: { timezone: 'Nope/Zone' } }).ok).toBe(false);
    expect(parseQueueInput('queueSettingsUpdate', { runWindow: DEFAULT_RUN_WINDOW, immediateLimit: 5 }).ok).toBe(true);
  });
});


describe('screen rule sorting (#1447)', () => {
  it('accepts a server sort and rejects undeclared sort fields', () => {
    const attemptId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    expect(parseRuleResultParams({ attemptId, sorting: [{ id: 'result', desc: true }] })).toMatchObject({ ok: true, value: { sorting: [{ id: 'result', desc: true }] } });
    expect(parseRuleResultParams({ attemptId, sorting: [{ id: 'excerpt', desc: false }] }).ok).toBe(false);
  });
});
