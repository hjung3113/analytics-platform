// #1778 — the pure checks of the worker opinion body and of the scale declaration (ADR-0117 amendment 2): no database.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  judgeAttemptTotals,
  noteBytes,
  opinionFingerprint,
  parseOpinionBody,
  parseOpinionScale,
  readOpinionScale,
} from '../domain/opinion-input.js';
import { parseOpinionListParams, parseRuleResultParams } from '../domain/queue-params.js';
import { parseQueueInput, validateQueueInput } from '../domain/queue-input.js';

const H = (c: string) => c.repeat(64);
const SCALE = { grades: [{ key: 'high', label: 'High' }, { key: 'low', label: 'Low' }], marks: [{ key: 'flag', label: 'Flag' }] };
const SAMPLES = new Set(['s3://a/f1.log', 's3://a/f2.log']);
const item = (over: Record<string, unknown> = {}) => ({ itemKey: 'R-1', grade: 'high', ...over });
const body = (items: unknown[], submissionId = 's-1') => ({ submissionId, opinions: items });
const codes = (raw: unknown, scale = SCALE) => {
  const r = parseOpinionBody(raw, SAMPLES, scale);
  return r.ok ? [] : r.errors.map((e) => `${e.path.join('.')}:${e.code}`);
};
const ID = '0f2c1c0e-8a53-4c43-9d0b-6a7f3a1d2e10';

describe('parseOpinionBody', () => {
  it('accepts a full opinion and one with only the required fields, and normalises text', () => {
    const r = parseOpinionBody(
      body([
        item({ mark: 'flag', note: ' ask \u0000the\u0007 owner\nplease ', evidence: [{ fileRef: ' s3://a/f1.log ', line: 4, fileSha256: H('a') }], inputRevision: 'prompt-3\u0001', producer: 'llm-x' }),
        item({ itemKey: 'R-2', grade: 'low' }),
      ]),
      SAMPLES,
      SCALE,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.opinions[0]).toEqual({
      itemKey: 'R-1', grade: 'high', mark: 'flag', note: 'ask the owner\nplease',
      evidence: [{ fileRef: 's3://a/f1.log', line: 4, fileSha256: H('a') }], inputRevision: 'prompt-3', producer: 'llm-x',
    });
    expect(r.value.opinions[1]).toEqual({ itemKey: 'R-2', grade: 'low', mark: null, note: null, evidence: [], inputRevision: null, producer: null });
  });

  it('an empty scale refuses the whole call as opinion.scale_undeclared', () => {
    expect(codes(body([item()]), { grades: [], marks: [] })).toEqual(['opinions:opinion.scale_undeclared']);
  });

  it.each([
    ['an undeclared grade', body([item({ grade: 'severe' })]), 'opinions.0.grade:not_declared'],
    ['an undeclared mark', body([item({ mark: 'star' })]), 'opinions.0.mark:not_declared'],
    ['evidence outside the sample list', body([item({ evidence: [{ fileRef: 's3://x/other.log', line: 1, fileSha256: H('a') }] })]), 'opinions.0.evidence.0.fileRef:not_in_sample'],
    ['a note over 1,000 characters', body([item({ note: 'n'.repeat(1001) })]), 'opinions.0.note:too_long'],
    ['an item key over 200 characters', body([item({ itemKey: 'k'.repeat(201) })]), 'opinions.0.itemKey:too_long'],
    ['a submissionId over 200 characters', body([item()], 's'.repeat(201)), 'submissionId:too_long'],
    ['an inputRevision over 200 characters', body([item({ inputRevision: 'r'.repeat(201) })]), 'opinions.0.inputRevision:too_long'],
    ['a producer over 200 characters', body([item({ producer: 'p'.repeat(201) })]), 'opinions.0.producer:too_long'],
    ['21 evidence entries', body([item({ evidence: Array.from({ length: 21 }, () => ({ fileRef: 's3://a/f1.log', line: 1, fileSha256: H('a') })) })]), 'opinions.0.evidence:too_many'],
    ['the same item key twice', body([item(), item()]), 'opinions.1.itemKey:duplicate'],
    ['501 opinions', body(Array.from({ length: 501 }, (_, i) => item({ itemKey: `k${i}` }))), 'opinions:too_many'],
    ['no opinions', body([]), 'opinions:required'],
    ['no submissionId', { opinions: [item()] }, 'submissionId:required'],
    ['a blank submissionId', body([item()], '  '), 'submissionId:required'],
    ['a blank item key', body([item({ itemKey: ' ' })]), 'opinions.0.itemKey:required'],
    ['a verdict field', { ...body([item()]), verdict: 'pass' }, 'verdict:malformed'],
    ['a verdict inside an opinion', body([item({ verdict: 'pass' })]), 'opinions.0.verdict:malformed'],
    ['an excerpt inside evidence', body([item({ evidence: [{ fileRef: 's3://a/f1.log', line: 1, fileSha256: H('a'), excerpt: 'log' }] })]), 'opinions.0.evidence.0.excerpt:malformed'],
    ['a line below 1', body([item({ evidence: [{ fileRef: 's3://a/f1.log', line: 0, fileSha256: H('a') }] })]), 'opinions.0.evidence.0.line:malformed'],
    ['a bad file hash', body([item({ evidence: [{ fileRef: 's3://a/f1.log', line: 1, fileSha256: 'abc' }] })]), 'opinions.0.evidence.0.fileSha256:malformed'],
    ['a non-string note', body([item({ note: 5 })]), 'opinions.0.note:malformed'],
  ])('refuses %s', (_label, raw, expected) => {
    expect(codes(raw)).toContain(expected);
  });

  it.each([
    ['note', { note: 'see Bearer abcdefghijklmnopqrstuvwxyz0123456789' }],
    ['itemKey', { itemKey: 'ap_0123abcd_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef0123456789-_' }],
    ['inputRevision', { inputRevision: 'password: hunter2hunter2' }],
    ['producer', { producer: 'AKIAABCDEFGHIJKLMNOP' }],
  ])('refuses a secret pattern in %s', (field, over) => {
    expect(codes(body([item(over)]))).toEqual([`opinions.0.${field}:secret_detected`]);
  });

  it('a mark is refused when the scale declares no marks', () => {
    expect(codes(body([item({ mark: 'flag' })]), { grades: SCALE.grades, marks: [] })).toEqual(['opinions.0.mark:not_declared']);
  });

  it('a note that only hides a secret behind a control character is still refused', () => {
    expect(codes(body([item({ note: 'api_key=\u0000abcdef1234' })]))).toEqual(['opinions.0.note:secret_detected']);
  });
});

describe('opinionFingerprint', () => {
  const base = { itemKey: 'R-1', grade: 'high', mark: null, note: 'n', evidence: [{ fileRef: 'a', line: 1, fileSha256: H('a') }], inputRevision: null, producer: null };
  it('is the same for the same content and differs for any changed field', () => {
    expect(opinionFingerprint({ ...base })).toBe(opinionFingerprint({ ...base, evidence: base.evidence.map((e) => ({ ...e })) }));
    for (const change of [{ grade: 'low' }, { mark: 'flag' }, { note: 'm' }, { note: null }, { evidence: [] }, { inputRevision: 'r' }, { producer: 'p' }]) {
      expect(opinionFingerprint({ ...base, ...change })).not.toBe(opinionFingerprint(base));
    }
  });
  it('counts note bytes in UTF-8', () => {
    expect(noteBytes({ note: null })).toBe(0);
    expect(noteBytes({ note: '가나' })).toBe(6);
  });
});

describe('judgeAttemptTotals', () => {
  it.each([
    [{ rows: 1999, noteBytes: 0 }, { rows: 1, noteBytes: 0 }, null],
    [{ rows: 2000, noteBytes: 0 }, { rows: 1, noteBytes: 0 }, { path: ['opinions'], code: 'too_many' }],
    [{ rows: 0, noteBytes: 262_000 }, { rows: 1, noteBytes: 144 }, null],
    [{ rows: 0, noteBytes: 262_000 }, { rows: 1, noteBytes: 145 }, { path: ['opinions'], code: 'too_long' }],
  ])('stored %j + added %j', (stored, added, expected) => {
    expect(judgeAttemptTotals(stored, added)).toEqual(expected);
  });
});

describe('parseOpinionScale', () => {
  it('accepts a declaration, cleans labels, and keeps the array order', () => {
    expect(parseOpinionScale({ grades: [{ key: 'b', label: ' B\u0000 ' }, { key: 'a', label: 'A' }], marks: [] })).toEqual({
      ok: true,
      value: { grades: [{ key: 'b', label: 'B' }, { key: 'a', label: 'A' }], marks: [] },
    });
    expect(parseOpinionScale({})).toEqual({ ok: true, value: { grades: [], marks: [] } });
  });
  it.each([
    ['not an object', 'x', 'malformed'],
    ['an array', [], 'malformed'],
    ['an unknown key', { grades: [], extra: 1 }, 'malformed'],
    ['grades not a list', { grades: 'a' }, 'malformed'],
    ['an uppercase key', { grades: [{ key: 'High', label: 'x' }] }, 'malformed'],
    ['a key over 32 characters', { grades: [{ key: 'a'.repeat(33), label: 'x' }] }, 'malformed'],
    ['the reserved key none', { grades: [{ key: 'none', label: 'x' }] }, 'malformed'],
    ['a label over 40 characters', { grades: [{ key: 'a', label: 'x'.repeat(41) }] }, 'malformed'],
    ['an unknown entry field', { grades: [{ key: 'a', label: 'x', color: 'red' }] }, 'malformed'],
    ['a duplicate grade key', { grades: [{ key: 'a', label: 'x' }, { key: 'a', label: 'y' }] }, 'duplicate_key'],
    ['a duplicate mark key', { marks: [{ key: 'a', label: 'x' }, { key: 'a', label: 'y' }] }, 'duplicate_key'],
    ['13 grades', { grades: Array.from({ length: 13 }, (_, i) => ({ key: `g${i}`, label: '' })) }, 'too_many'],
    ['13 marks', { marks: Array.from({ length: 13 }, (_, i) => ({ key: `m${i}`, label: '' })) }, 'too_many'],
  ])('refuses %s', (_label, raw, code) => {
    expect(parseOpinionScale(raw)).toEqual({ ok: false, code });
  });
  it('12 entries are allowed, and an unreadable stored value reads as the empty scale', () => {
    expect(parseOpinionScale({ grades: Array.from({ length: 12 }, (_, i) => ({ key: `g${i}`, label: '' })) }).ok).toBe(true);
    expect(readOpinionScale(null)).toEqual({ grades: [], marks: [] });
  });
});

describe('queueSettingsUpdate.opinionScale', () => {
  it('is a setting on its own, reports field errors, and an empty call still names runWindow', () => {
    expect(validateQueueInput('queueSettingsUpdate', { opinionScale: SCALE })).toEqual([]);
    expect(validateQueueInput('queueSettingsUpdate', { opinionScale: { grades: [{ key: 'a', label: '' }, { key: 'a', label: '' }] } })).toEqual([{ path: ['opinionScale'], code: 'duplicate_key' }]);
    expect(validateQueueInput('queueSettingsUpdate', { opinionScale: 5 })).toEqual([{ path: ['opinionScale'], code: 'malformed' }]);
    expect(validateQueueInput('queueSettingsUpdate', { opinionScale: { marks: Array.from({ length: 13 }, (_, i) => ({ key: `m${i}`, label: '' })) } })).toEqual([{ path: ['opinionScale'], code: 'too_many' }]);
    expect(validateQueueInput('queueSettingsUpdate', {})).toEqual([{ path: ['runWindow'], code: 'required' }]);
    const parsed = parseQueueInput('queueSettingsUpdate', { opinionScale: SCALE });
    expect(parsed.ok && parsed.value.opinionScale).toEqual(SCALE);
  });
});

describe('read params', () => {
  it('opinions: one attempt, optional rule result or item key or unlinked, pages of at most 100', () => {
    expect(parseOpinionListParams({ attemptId: ID })).toEqual({ ok: true, value: { attemptId: ID, ruleResultId: undefined, itemKey: undefined, unlinked: false, page: 0, pageSize: 50 } });
    expect(parseOpinionListParams({ attemptId: ID, unlinked: true, pageSize: 100 }).ok).toBe(true);
    for (const bad of [{}, { attemptId: 'x' }, { attemptId: ID, pageSize: 101 }, { attemptId: ID, unlinked: false }, { attemptId: ID, unlinked: true, ruleResultId: ID }, { attemptId: ID, itemKey: '' }, { attemptId: ID, ruleResultId: 'x' }]) {
      expect(parseOpinionListParams(bad).ok, JSON.stringify(bad)).toBe(false);
    }
  });
  it('ruleResults: opinionGrade is a grade key or none', () => {
    expect(parseRuleResultParams({ attemptId: ID, opinionGrade: 'none' }).ok).toBe(true);
    expect(parseRuleResultParams({ attemptId: ID, opinionGrade: 'high' }).ok).toBe(true);
    expect(parseRuleResultParams({ attemptId: ID, opinionGrade: 'High' }).ok).toBe(false);
    expect(parseRuleResultParams({ attemptId: ID, opinionGrade: 3 }).ok).toBe(false);
  });
});

describe('opinions are a separate axis (ADR-0117 amendment 2, decision 10)', () => {
  const source = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
  // The code that computes a verdict, a Gate input / availability or a regression comparison never names the opinion table or its reads.
  it.each([
    '../domain/verdict.ts',
    '../domain/gate-rules.ts',
    '../domain/gate-input.ts',
    '../gate-actions.ts',
    '../gate-availability.ts',
    '../repositories/gate.ts',
    '../suite-result-read-port.ts',
    '../suite-request-port.ts',
    '../domain/result-payload.ts',
    '../domain/request-states.ts',
    '../round-evidence-links.ts',
  ])('%s does not read or write attempt_opinion', (rel) => {
    expect(source(rel)).not.toMatch(/attempt_opinion|attemptOpinions|opinion-read|opinion-write|opinion-service/i);
  });
  it('queue-service calls the opinion service only after the verdict code and never feeds it into one', () => {
    const queue = source('../queue-service.ts');
    expect(queue.match(/computeVerdict\(([^)]*)\)/g)).toEqual(['computeVerdict(result.results, result.inputManifestDigest === subject.sampleManifestDigest)']);
  });
});
