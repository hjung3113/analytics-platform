// #1446 e — the pure Gate rules (DB-free): decision vs verdict, target stage, self approval mark, basis snapshot, input parsing.

import { describe, expect, it } from 'vitest';

import { parseGateInput, validateGateInput } from '../domain/gate-input.js';
import { buildBasis, decisiveAttempt, isSelfApproved, judgeDecision, judgeTarget, movesStage } from '../domain/gate-rules.js';
import { gateTargetFor } from '../domain/stage-transitions.js';

const ID = '0f2c1c0e-8a53-4c43-9d0b-6a7f3a1d2e10';
const ID2 = '1f2c1c0e-8a53-4c43-9d0b-6a7f3a1d2e11';

describe('judgeDecision', () => {
  it('approves only over a pass', () => {
    expect(judgeDecision({ decision: 'approved', verdict: 'pass' })).toBeNull();
  });
  it.each(['fail', 'incomplete', null] as const)('refuses approved over %s (only an exception passes)', (verdict) => {
    expect(judgeDecision({ decision: 'approved', verdict })).toEqual({ path: ['decision'], code: 'verdict_not_pass' });
    expect(judgeDecision({ decision: 'exception', verdict })).toBeNull();
  });
  it('refuses an exception over a pass: an exception always means the machine did not pass', () => {
    expect(judgeDecision({ decision: 'exception', verdict: 'pass' })).toEqual({ path: ['decision'], code: 'exception_not_needed' });
  });
  it.each(['pass', 'fail', 'incomplete', null] as const)('always allows rejected (verdict %s)', (verdict) => {
    expect(judgeDecision({ decision: 'rejected', verdict })).toBeNull();
  });
  it('only approving decisions move the stage', () => {
    expect([movesStage('approved'), movesStage('exception'), movesStage('rejected')]).toEqual([true, true, false]);
  });
});

describe('gateTargetFor / judgeTarget', () => {
  it.each([
    ['registered', 'kickoff'],
    ['kickoff', 'alpha'],
    ['alpha', 'beta'],
    ['beta', 'completed'],
  ])('%s -> %s is the next stage', (from, to) => {
    expect(gateTargetFor(from)).toBe(to);
    expect(judgeTarget(from, to, ID)).toEqual({ ok: true });
  });
  it.each([['registered', 'alpha'], ['alpha', 'alpha'], ['beta', 'cancelled'], ['kickoff', 'registered']])('%s -> %s is illegal', (from, to) => {
    expect(judgeTarget(from, to, ID)).toEqual({ ok: false, error: { path: ['targetStage'], code: 'illegal_transition' } });
  });
  it.each(['completed', 'cancelled', 'unknown'])('no Gate target from %s', (from) => {
    expect(gateTargetFor(from)).toBeNull();
  });
  it('beta -> completed needs the project software; the other steps do not', () => {
    expect(judgeTarget('beta', 'completed', null)).toEqual({ ok: false, error: { path: ['targetStage'], code: 'software_required' } });
    expect(judgeTarget('beta', 'completed', null, true)).toEqual({ ok: false, error: { path: ['targetStage'], code: 'software_required' } });
    expect(judgeTarget('alpha', 'beta', null)).toEqual({ ok: true });
  });
  it('a decision that does not move the stage (rejected) does not need the software, but still needs the next target', () => {
    expect(judgeTarget('beta', 'completed', null, false)).toEqual({ ok: true });
    expect(judgeTarget('beta', 'cancelled', null, false)).toEqual({ ok: false, error: { path: ['targetStage'], code: 'illegal_transition' } });
  });
});

describe('isSelfApproved', () => {
  it('compares the decider with the latest requester, else the Round opener', () => {
    expect(isSelfApproved('a', 'a', 'b')).toBe(true);
    expect(isSelfApproved('a', 'b', 'a')).toBe(false);
    expect(isSelfApproved('a', null, 'a')).toBe(true);
    expect(isSelfApproved('a', null, 'b')).toBe(false);
  });
});

describe('buildBasis', () => {
  const attempt = (n: number, verdict: 'pass' | 'fail' | 'incomplete') => ({
    attemptId: `att-${n}`,
    attemptNo: n,
    requestId: 'req',
    verdict,
    ruleSetRevision: 'r1',
    inputManifestDigest: 'd'.repeat(64),
    endedAt: '2026-11-08T00:00:00.000Z',
  });
  it('freezes the attempts, the decisive verdict, the pins, the request digest and the link ids/times only', () => {
    const attempts = [attempt(1, 'fail'), attempt(2, 'pass')];
    expect(decisiveAttempt(attempts)?.attemptId).toBe('att-2');
    const basis = buildBasis({
      attempts,
      specPin: { revisionId: ID, changeSetDigest: 'x' },
      sampleManifestDigest: 's'.repeat(64),
      requestDigest: 'q'.repeat(64),
      evidenceLinks: [{ attachmentId: ID, linkedAt: '2026-11-08T01:00:00.000Z', name: 'secret.txt' } as { attachmentId: string; linkedAt: string }],
    });
    expect(basis).toMatchObject({ version: 1, decisiveAttemptId: 'att-2', decisiveVerdict: 'pass', requestDigest: 'q'.repeat(64) });
    expect(basis.attempts.map((a) => a.verdict)).toEqual(['fail', 'pass']);
    expect(basis.evidenceLinks).toEqual([{ attachmentId: ID, linkedAt: '2026-11-08T01:00:00.000Z' }]);
    expect(JSON.stringify(basis)).not.toContain('secret.txt');
  });
  it('a Round without attempts has no decisive attempt and a null spec pin stays null', () => {
    const basis = buildBasis({ attempts: [], specPin: undefined, sampleManifestDigest: 's'.repeat(64), requestDigest: null, evidenceLinks: [] });
    expect(basis).toMatchObject({ decisiveAttemptId: null, decisiveVerdict: null, specPin: null, requestDigest: null });
  });
});

describe('gate input', () => {
  const base = { roundId: ID, targetStage: 'beta', decision: 'approved', reason: ' ok ' };
  it('parses an approval and trims the reason', () => {
    expect(parseGateInput(base)).toEqual({ ok: true, value: { roundId: ID, targetStage: 'beta', decision: 'approved', reason: 'ok' } });
  });
  it.each([
    ['no reason', { ...base, reason: '  ' }, 'reason:required'],
    ['unknown decision', { ...base, decision: 'maybe' }, 'decision:malformed'],
    ['cancelled target', { ...base, targetStage: 'cancelled' }, 'targetStage:malformed'],
    ['exception without the exception object', { ...base, decision: 'exception' }, 'exception:required'],
    ['exception on an approval', { ...base, exception: { riskAcceptedBy: ID, scope: 's' } }, 'exception:malformed'],
    ['exception without riskAcceptedBy', { ...base, decision: 'exception', exception: { scope: 's' } }, 'exception.riskAcceptedBy:required'],
    ['exception without scope', { ...base, decision: 'exception', exception: { riskAcceptedBy: ID } }, 'exception.scope:required'],
    ['exception with a bad date', { ...base, decision: 'exception', exception: { riskAcceptedBy: ID, scope: 's', until: '2026-02-30' } }, 'exception.until:malformed'],
    ['exception with an unknown key', { ...base, decision: 'exception', exception: { riskAcceptedBy: ID, scope: 's', x: 1 } }, 'exception:malformed'],
  ])('refuses %s', (_label, input, expected) => {
    expect(validateGateInput(input).map((e) => `${e.path.join('.')}:${e.code}`)).toContain(expected);
  });
  it('accepts an exception with riskAcceptedBy, scope and until', () => {
    const exception = { riskAcceptedBy: ID2, scope: 'beta only', until: '2026-12-31' };
    expect(parseGateInput({ ...base, decision: 'exception', exception })).toMatchObject({ ok: true, value: { decision: 'exception', exception } });
  });
});
