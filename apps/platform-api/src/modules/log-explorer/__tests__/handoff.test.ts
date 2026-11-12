// #1474 X-h — the pure side of `logExplorer.evidenceHandoff`: input parsing, ref selection, Source resolution mapping, hash mismatch.
import { describe, expect, it, vi } from 'vitest';

import type { HandoffDeps } from '../deps.js';
import { resolveHandoffRefs } from '../handoff-source.js';
import { createSyntheticScenario } from '../adapters/synthetic/index.js';

import { hashMismatchOf, parseHandoff, resolutionOf, selectStoredRefs } from '../domain/handoff.js';

const ID = '0f2c1c0e-8a53-4c43-9d0b-6a7f3a1d2e10';
const OTHER = '1f2c1c0e-8a53-4c43-9d0b-6a7f3a1d2e11';
const H = (c: string) => c.repeat(64);
const ref = (line: number, over: Record<string, unknown> = {}) => ({ fileRef: 'f1.log', line, fileSha256: H('a'), ...over });
const codes = (input: Record<string, unknown>) => {
  const p = parseHandoff(input);
  return p.ok ? [] : p.errors.map((e) => `${e.path.join('.')}:${e.code}`);
};
const base = { id: ID, refs: [ref(1)], target: { kind: 'round', roundId: OTHER } };

describe('parseHandoff', () => {
  it('parses each target kind', () => {
    expect(parseHandoff(base)).toMatchObject({ ok: true, value: { target: { kind: 'round', roundId: OTHER } } });
    expect(parseHandoff({ ...base, target: { kind: 'knowledgeDraft', mode: 'create', owner: { modelId: OTHER }, title: 't', observation: 'o' } }).ok).toBe(true);
    expect(parseHandoff({ ...base, target: { kind: 'knowledgeDraft', mode: 'create', owner: { softwareId: OTHER }, title: 't', observation: 'o' } }).ok).toBe(true);
    expect(parseHandoff({ ...base, target: { kind: 'knowledgeDraft', mode: 'append', draftId: OTHER, draftExpectedVersion: '3' } }).ok).toBe(true);
  });

  it.each([
    ['a defect target has no receiver', { ...base, target: { kind: 'defect' } }, ['target:not_available']],
    ['no refs', { ...base, refs: [] }, ['refs:required']],
    ['refs missing', { id: ID, target: base.target }, ['refs:required']],
    ['a duplicated location', { ...base, refs: [ref(1), ref(1)] }, ['refs.1:duplicate']],
    ['a note in the request (the stored note is used)', { ...base, refs: [ref(1, { note: 'x' })] }, ['refs.0.note:malformed']],
    ['a body key', { ...base, refs: [ref(1, { text: 'x' })] }, ['refs.0.text:malformed']],
    ['a bad hash', { ...base, refs: [ref(1, { fileSha256: 'zz' })] }, ['refs.0.fileSha256:malformed']],
    ['too many refs', { ...base, refs: Array.from({ length: 101 }, (_v, i) => ref(i + 1)) }, ['refs:too_many']],
    ['a bad id', { ...base, id: 'x' }, ['id:malformed']],
    ['no target', { id: ID, refs: base.refs }, ['target:required']],
    ['an unknown kind', { ...base, target: { kind: 'x' } }, ['target.kind:malformed']],
    ['a round without roundId', { ...base, target: { kind: 'round' } }, ['target.roundId:required']],
    ['an extra target key', { ...base, target: { kind: 'round', roundId: OTHER, extra: 1 } }, ['target.extra:malformed']],
    ['a create with both owners', { ...base, target: { kind: 'knowledgeDraft', mode: 'create', owner: { modelId: OTHER, softwareId: OTHER }, title: 't', observation: 'o' } }, ['target.owner:required_one']],
    ['a create without a title', { ...base, target: { kind: 'knowledgeDraft', mode: 'create', owner: { modelId: OTHER }, observation: 'o' } }, ['target.title:required']],
    ['an append without a version', { ...base, target: { kind: 'knowledgeDraft', mode: 'append', draftId: OTHER } }, ['target.draftExpectedVersion:required']],
    ['an unknown mode', { ...base, target: { kind: 'knowledgeDraft', mode: 'x' } }, ['target.mode:malformed']],
  ])('refuses %s', (_label, input, expected) => {
    expect(codes(input as Record<string, unknown>)).toEqual(expected);
  });
});

describe('selectStoredRefs', () => {
  const stored = [
    { fileRef: 'f1.log', line: 1, fileSha256: H('a'), note: 'n1' },
    { fileRef: 'f1.log', line: 2, fileSha256: H('a') },
  ];
  it('returns the stored refs (with their notes) in request order', () => {
    expect(selectStoredRefs([ref(2), ref(1)], stored)).toEqual({ ok: true, value: [stored[1], stored[0]] });
  });
  it('refuses a ref that is not stored, or stored with another hash, at its request index', () => {
    expect(selectStoredRefs([ref(1), ref(9), ref(2, { fileSha256: H('c') })], stored)).toEqual({
      ok: false,
      errors: [
        { path: ['refs', '1'], code: 'not_in_investigation' },
        { path: ['refs', '2'], code: 'not_in_investigation' },
      ],
    });
  });
});

describe('Source resolution and hash mismatch', () => {
  it.each([
    ['ok', true],
    ['source_absent', false],
    ['permission_denied', null],
    ['unsupported', null],
    ['anything else', null],
  ])('a %s window answer resolves to %s', (status, expected) => {
    expect(resolutionOf(status)).toBe(expected);
  });

  const files = [{ fileRef: 'f1.log', sha256: H('a') }];
  it('marks a hash that differs from the sample set, and a file the sample set lacks', () => {
    expect(hashMismatchOf({ fileRef: 'f1.log', fileSha256: H('a') }, files)).toBe(false);
    expect(hashMismatchOf({ fileRef: 'f1.log', fileSha256: H('b') }, files)).toBe(true);
    expect(hashMismatchOf({ fileRef: 'f2.log', fileSha256: H('a') }, files)).toBe(true);
  });
});


describe('handoff ACL cancellation boundary (C4)', () => {
  const actor = { actor_id: ID, workspace_id: OTHER, role_level: 'developer' };
  it.each([
    ['pre-batch', 2, 'timeout'], ['post-batch', 3, 'timeout'],
    ['pre-batch', 2, 'cancel'], ['post-batch', 3, 'cancel'],
  ])('%s ACL (call %i) cannot hold the job past %s', async (_phase, delayedCall, stop) => {
    vi.useFakeTimers();
    let release: (allowed: boolean) => void = () => undefined;
    let entered: () => void = () => undefined;
    const waiting = new Promise<void>(resolve => { entered = resolve; });
    const acl = new Promise<boolean>(resolve => { release = resolve; });
    const controller = new AbortController();
    let calls = 0;
    let settled = false;
    const handoff: HandoffDeps = {
      // Receivers are outside this helper's Source-only seam.
      roundIntake: {} as never, draftIntake: {} as never, knowledgeLookup: {} as never,
      sourceReadPort: { ...createSyntheticScenario('typical').port, getWindow: async () => ({ status: 'ok' as const, rows: [], truncated: false }) },
      sourceOwnerAccess: { allows: async () => { if (++calls === delayedCall) { entered(); return acl; } return true; } },
      sourceTotalMs: 50,
    };
    const result = resolveHandoffRefs(handoff, actor, 'owner', [ref(1)], undefined, controller.signal)
      .then(value => ({ value, error: null }), (error: unknown) => ({ value: null, error }))
      .finally(() => { settled = true; });
    try {
      await waiting;
      if (stop === 'cancel') controller.abort();
      await vi.advanceTimersByTimeAsync(stop === 'timeout' ? 50 : 0);
      const settledBeforeAcl = settled;
      release(true);
      const outcome = await result;
      expect(outcome).toMatchObject({ value: null, error: { fieldErrors: [{ path: ['refs'], code: 'source_unavailable' }] } });
      expect(settledBeforeAcl).toBe(true);
    } finally {
      release(true);
      await result;
      vi.useRealTimers();
    }
  });

  it('subtracts the pre-batch ACL wait from the Source time budget', async () => {
    vi.useFakeTimers();
    let calls = 0;
    const getWindow = vi.fn(async () => ({ status: 'ok' as const, rows: [], truncated: false }));
    const handoff: HandoffDeps = {
      // Receivers are outside this helper's Source-only seam.
      roundIntake: {} as never, draftIntake: {} as never, knowledgeLookup: {} as never,
      sourceReadPort: { ...createSyntheticScenario('typical').port, getWindow },
      sourceOwnerAccess: { allows: async () => { if (++calls === 2) vi.setSystemTime(Date.now() + 30); return true; } },
      sourceTotalMs: 50,
    };
    try {
      expect(await resolveHandoffRefs(handoff, actor, 'owner', [ref(1)])).toEqual([true]);
      expect(getWindow).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ timeBudgetMs: 20 }));
    } finally {
      vi.useRealTimers();
    }
  });
});
