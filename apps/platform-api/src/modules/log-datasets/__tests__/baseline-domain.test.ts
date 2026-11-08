// #1478 D-b — pure parts of the baselines: the state machine, the 기준 낡음 computation, the content digest and the input parsers. No database.

import { describe, expect, it, vi } from 'vitest';

import type { LogDatasetsDeps } from '../deps.js';
import { parseBaselineInput, validateBaselineInput } from '../domain/baseline-input.js';
import { computeStale } from '../domain/baseline-stale.js';
import { canTransition, contentDigest, isEditable, snapshotOf, stableStringify } from '../domain/baseline-state.js';
import type { FileCheckState } from '../domain/availability.js';
import { staleOf } from '../stale-read.js';

const ID = '0f2c1c0e-8a53-4c43-9d0b-6a7f3a1d2e10';
const REV = '1f2c1c0e-8a53-4c43-9d0b-6a7f3a1d2e11';
const DIGEST = 'a'.repeat(64);
const files = (...states: FileCheckState[]) => states;

describe('baseline state machine', () => {
  it.each([
    ['draft', 'approved', true],
    ['approved', 'superseded', true],
    ['draft', 'superseded', false],
    ['approved', 'draft', false],
    ['superseded', 'approved', false],
    ['superseded', 'draft', false],
    ['draft', 'draft', false],
    ['approved', 'approved', false],
  ] as const)('%s -> %s is %s', (from, to, ok) => {
    expect(canTransition(from, to)).toBe(ok);
  });

  it('only a draft is editable', () => {
    expect(isEditable('draft')).toBe(true);
    expect(isEditable('approved')).toBe(false);
    expect(isEditable('superseded')).toBe(false);
  });
});

describe('content digest and snapshot', () => {
  it('is independent of key order and sensitive to content', () => {
    const a = { profilePin: { parserVersion: '1', ruleSetRevision: '2' }, expectedScope: ['R1'], expectations: [{ ruleId: 'R1', expected: 'PASS' }], parserGoldenRef: null };
    const b = { ...a, profilePin: { ruleSetRevision: '2', parserVersion: '1' } };
    expect(contentDigest(a)).toBe(contentDigest(b));
    expect(contentDigest(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(contentDigest({ ...a, expectations: [{ ruleId: 'R1', expected: 'FAIL' }] })).not.toBe(contentDigest(a));
    expect(stableStringify({ b: 1, a: [2, { d: 1, c: undefined }] })).toBe('{"a":[2,{"d":1}],"b":1}');
  });

  it('the snapshot keeps names, counts and the digest, never the expectations', () => {
    const snap = snapshotOf({ status: 'draft', seq: 2, profilePin: {}, expectedScope: ['R1', 'R2'], expectations: [{ ruleId: 'R1', expected: 'PASS', exception: { reason: 'SECRET-WORDS', scope: 's' } }], parserGoldenRef: null });
    expect(snap).toMatchObject({ status: 'draft', seq: 2, expectationCount: 1, scopeCount: 2 });
    expect(JSON.stringify(snap)).not.toContain('SECRET-WORDS');
  });
});

describe('기준 낡음 (computeStale)', () => {
  const specPin = { modelId: ID, softwareId: null, revisionId: REV, changeSetDigest: DIGEST };

  it('all files match and nothing else is pinned: fresh', () => {
    expect(computeStale({ files: files('match', 'match'), pin: {}, currentSpecPin: null })).toEqual({ state: 'fresh', reasons: [], unknown: [] });
  });

  it.each([
    ['a changed hash', files('match', 'hash_mismatch'), ['file_hash_changed']],
    ['a missing file', files('absent', 'match'), ['file_unavailable']],
    ['both', files('absent', 'hash_mismatch'), ['file_hash_changed', 'file_unavailable']],
  ] as const)('%s is stale for the file reason', (_label, states, reasons) => {
    expect(computeStale({ files: states, pin: {}, currentSpecPin: null })).toMatchObject({ state: 'stale', reasons });
  });

  it.each([
    ['no Source check was made', null],
    ['the Source-owner ACL denied the actor', files('permission_denied', 'permission_denied')],
    ['the port cannot tell the hash', files('hash_unknown')],
    ['the port does not support it', files('unsupported')],
    ['the check errored or timed out', files('error', 'match')],
  ] as const)('%s: unknown, never stale', (_label, states) => {
    expect(computeStale({ files: states, pin: {}, currentSpecPin: null })).toEqual({ state: 'unknown', reasons: [], unknown: ['files'] });
  });

  it('a settled mismatch is stale even when another file could not be judged (and the unknown aspect is still listed)', () => {
    expect(computeStale({ files: files('hash_mismatch', 'error'), pin: {}, currentSpecPin: null })).toEqual({ state: 'stale', reasons: ['file_hash_changed'], unknown: ['files'] });
  });

  it('the spec pin: a different revision or change digest is stale; the same is fresh; an unreadable spec is unknown', () => {
    const pin = { specPin };
    expect(computeStale({ files: files('match'), pin, currentSpecPin: { revisionId: REV, changeSetDigest: DIGEST } })).toMatchObject({ state: 'fresh' });
    expect(computeStale({ files: files('match'), pin, currentSpecPin: { revisionId: ID, changeSetDigest: DIGEST } })).toMatchObject({ state: 'stale', reasons: ['spec_pin_changed'] });
    expect(computeStale({ files: files('match'), pin, currentSpecPin: { revisionId: REV, changeSetDigest: 'b'.repeat(64) } })).toMatchObject({ state: 'stale', reasons: ['spec_pin_changed'] });
    expect(computeStale({ files: files('match'), pin, currentSpecPin: null })).toEqual({ state: 'unknown', reasons: [], unknown: ['spec_pin'] });
  });

  it('a spec that is not pinned is never compared', () => {
    expect(computeStale({ files: files('match'), pin: {}, currentSpecPin: { revisionId: ID, changeSetDigest: DIGEST } })).toMatchObject({ state: 'fresh' });
  });

  it('rule set, parser and engine profile pins are unknown while no engine capability read exists, never stale', () => {
    const out = computeStale({ files: files('match'), pin: { ruleSetRevision: '3', parserVersion: '1.2', engineProfileRef: 'p1' }, currentSpecPin: null });
    expect(out).toEqual({ state: 'unknown', reasons: [], unknown: ['rule_set', 'parser', 'engine_profile'] });
  });
});

describe('staleOf (the knowledge catalog port)', () => {
  const specPin = { modelId: ID, softwareId: null, revisionId: REV, changeSetDigest: DIGEST };
  const TX = { tx: true };
  const depsWith = (getEffectiveSpecPin: (...args: unknown[]) => Promise<unknown>, getSoftware: (...args: unknown[]) => Promise<unknown> = vi.fn().mockResolvedValue({ id: ID })) =>
    ({ db: { transaction: (fn: (tx: unknown) => unknown) => fn(TX) }, knowledgeLookup: { getEffectiveSpecPin, getSoftware } }) as unknown as LogDatasetsDeps;

  it('asks the port for the pinned model and software, and compares', async () => {
    const lookup = vi.fn().mockResolvedValue({ revisionId: ID, changeSetDigest: DIGEST });
    const out = await staleOf(depsWith(lookup), 'ws', { specPin }, files('match'));
    expect(lookup).toHaveBeenCalledWith(TX, 'ws', ID, null); // the transaction handle: the model lock must live through the pin reads
    expect(out).toMatchObject({ state: 'stale', reasons: ['spec_pin_changed'] });
  });

  it('a pinned software that does not resolve is unknown and never reaches the pin read (no base-spec fallback)', async () => {
    const lookup = vi.fn().mockResolvedValue({ revisionId: ID, changeSetDigest: DIGEST });
    const getSoftware = vi.fn().mockResolvedValue(null);
    const pinned = { ...specPin, softwareId: '33333333-3333-4333-8333-333333333333' };
    expect(await staleOf(depsWith(lookup, getSoftware), 'ws', { specPin: pinned }, files('match'))).toEqual({ state: 'unknown', reasons: [], unknown: ['spec_pin'] });
    expect(getSoftware).toHaveBeenCalledWith(TX, 'ws', ID, pinned.softwareId);
    expect(lookup).not.toHaveBeenCalled();
  });

  it('a port that throws is unknown, and a baseline without a pinned spec never calls it', async () => {
    const lookup = vi.fn().mockRejectedValue(new Error('db down'));
    expect(await staleOf(depsWith(lookup), 'ws', { specPin }, files('match'))).toEqual({ state: 'unknown', reasons: [], unknown: ['spec_pin'] });
    const unused = vi.fn();
    expect(await staleOf(depsWith(unused), 'ws', {}, files('match'))).toMatchObject({ state: 'fresh' });
    expect(unused).not.toHaveBeenCalled();
  });
});

describe('baseline input parsers', () => {
  const ok = { ruleId: 'R1', expected: 'PASS' };

  it.each(['PASS', 'FAIL', 'WARN', 'NOT_APPLICABLE', 'EXPECTED_UNSUPPORTED'])('accepts the expectation %s', (expected) => {
    expect(parseBaselineInput('baselineUpdateDraft', { id: ID, expectations: [{ ruleId: 'R1', expected }] }).ok).toBe(true);
  });

  it.each([
    ['an unknown result', { expectations: [{ ruleId: 'R1', expected: 'MAYBE' }] }, 'expectations.0.expected:malformed'],
    ['a lower-case result', { expectations: [{ ruleId: 'R1', expected: 'pass' }] }, 'expectations.0.expected:malformed'],
    ['a missing result', { expectations: [{ ruleId: 'R1' }] }, 'expectations.0.expected:required'],
    ['a blank rule id', { expectations: [{ ruleId: '  ', expected: 'PASS' }] }, 'expectations.0.ruleId:required'],
    ['a duplicate rule id', { expectations: [ok, ok] }, 'expectations:duplicate'],
    ['an unknown expectation key', { expectations: [{ ...ok, command: 'rm -rf /' }] }, 'expectations.0:malformed'],
    ['an exception without scope', { expectations: [{ ...ok, exception: { reason: 'x' } }] }, 'expectations.0.exception.scope:required'],
    ['an evidence line below 1', { expectations: [{ ...ok, evidence: [{ fileRef: 'f', line: 0 }] }] }, 'expectations.0.evidence.0.line:malformed'],
    ['a duplicate scope entry', { expectedScope: ['R1', 'R1'] }, 'expectedScope:duplicate'],
    ['an unknown pin key', { profilePin: { engine: 'x' } }, 'profilePin:malformed'],
    ['a short golden digest', { parserGoldenRef: { location: 'g', digest: 'abc' } }, 'parserGoldenRef.digest:malformed'],
    ['a golden with content', { parserGoldenRef: { location: 'g', digest: DIGEST, content: 'x' } }, 'parserGoldenRef:malformed'],
    ['a spec pin without a model', { profilePin: { specPin: { softwareId: null, revisionId: REV, changeSetDigest: DIGEST } } }, 'profilePin.specPin.modelId:required'],
  ])('refuses %s', (_label, over, expected) => {
    const errors = validateBaselineInput('baselineUpdateDraft', { id: ID, ...over });
    expect(errors.map((e) => `${e.path.join('.')}:${e.code}`)).toContain(expected);
  });

  it('the parser golden reference can be cleared with null', () => {
    const parsed = parseBaselineInput('baselineUpdateDraft', { id: ID, parserGoldenRef: null });
    expect(parsed.ok && parsed.value.parserGoldenRef).toBeNull();
  });

  it('approve needs a reason; a copy from an attempt is refused until the lifecycle read port exists', () => {
    expect(validateBaselineInput('baselineApprove', { id: ID }).map((e) => e.code)).toEqual(['required']);
    expect(validateBaselineInput('baselineApprove', { id: ID, reason: '   ' }).map((e) => e.code)).toEqual(['required']);
    expect(validateBaselineInput('baselineApprove', { id: ID, reason: 'checked' })).toEqual([]);
    expect(validateBaselineInput('baselineDraftCreate', { datasetRevisionId: REV })).toEqual([]);
    expect(validateBaselineInput('baselineDraftCreate', { datasetRevisionId: REV, fromAttemptId: ID })).toEqual([{ path: ['fromAttemptId'], code: 'unsupported' }]);
  });
});
