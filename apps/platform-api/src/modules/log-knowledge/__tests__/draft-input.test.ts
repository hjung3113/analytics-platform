import { describe, expect, it } from 'vitest';

import {
  deriveOrigin,
  normalizeProposal,
  ownerImmutableErrors,
  parseDraftHead,
  parseProposal,
  proposalDigest,
  validateDraftInput,
} from '../domain/draft-input.js';

const MODEL = '0f2c1c0e-8a53-4c43-9d0b-6a7f3a1d2e10';
const OTHER = '1f2c1c0e-8a53-4c43-9d0b-6a7f3a1d2e11';

const create = (extra: Record<string, unknown> = {}) => ({
  ownerModelId: MODEL,
  typeCode: 'anomaly',
  title: ' Spindle stops ',
  observation: 'It stops.',
  ...extra,
});
const revise = (extra: Record<string, unknown> = {}) => ({
  typeCode: 'guideline',
  title: 'Check spindle',
  expected: 'Runs',
  changeNote: 'clarified',
  ...extra,
});
const parsedOk = (type: 'create' | 'revise', raw: unknown) => {
  const r = parseProposal(type, raw);
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.value;
};

describe('parseProposal', () => {
  it('normalizes a create proposal (trimmed title, nulls, empty evidence, owner kept, subjects absent)', () => {
    expect(parsedOk('create', create())).toEqual({
      ownerModelId: MODEL,
      typeCode: 'anomaly',
      title: 'Spindle stops',
      observation: 'It stops.',
      expected: null,
      analysisOpinion: null,
      improvement: null,
      evidence: [],
    });
  });

  it('a revise proposal carries a change note and no owner; omitted subjects stay absent, a list (even empty) is kept', () => {
    expect(parsedOk('revise', revise())).not.toHaveProperty('subjects');
    expect(parsedOk('revise', revise({ subjects: [] }))).toMatchObject({ subjects: [], changeNote: 'clarified' });
  });

  it.each([
    ['create', create({ id: MODEL }), ['proposal', 'id']],
    ['create', create({ origin: 'ai' }), ['proposal', 'origin']],
    ['revise', revise({ ownerModelId: MODEL }), ['proposal', 'ownerModelId']],
    ['revise', revise({ id: MODEL }), ['proposal', 'id']],
    ['create', create({ evidence: [{ sourceKind: 'other', sourceOwner: 'o', sourceRef: 'r', secret: 1 }] }), ['proposal', 'evidence', '0', 'secret']],
    ['create', create({ subjects: [{ modelId: MODEL, targetKind: 'module', target: { module: 'm' }, extra: 1 }] }), ['proposal', 'subjects', '0', 'extra']],
  ] as const)('refuses an unknown key (%s) as malformed at its path', (type, raw, path) => {
    expect(parseProposal(type, raw)).toEqual({ ok: false, errors: [{ path: [...path], code: 'malformed' }] });
  });

  it.each([
    ['create', create({ title: '  ' }), ['proposal', 'title'], 'required'],
    ['create', create({ title: 'x'.repeat(201) }), ['proposal', 'title'], 'too_long'],
    ['create', create({ typeCode: 'nope' }), ['proposal', 'typeCode'], 'malformed'],
    ['create', create({ ownerSoftwareId: MODEL }), ['proposal', 'owner'], 'required_one'],
    ['create', create({ ownerModelId: undefined }), ['proposal', 'owner'], 'required_one'],
    ['create', create({ observation: undefined }), ['proposal', 'observation'], 'required_one'],
    ['revise', revise({ changeNote: '' }), ['proposal', 'changeNote'], 'required'],
    ['revise', revise({ changeNote: undefined }), ['proposal', 'changeNote'], 'required'],
    ['create', create({ ownerModelId: 'not-a-uuid' }), ['proposal', 'ownerModelId'], 'malformed'],
  ] as const)('reuses the item error codes with the proposal prefix (%s)', (type, raw, path, code) => {
    const r = parseProposal(type, raw);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors).toContainEqual({ path: [...path], code });
  });

  it.each([undefined, null])('a missing proposal (%s) is required', (raw) => {
    expect(parseProposal('create', raw)).toEqual({ ok: false, errors: [{ path: ['proposal'], code: 'required' }] });
  });
  it.each([[[]], ['text'], [5]])('a non-object proposal (%j) is malformed', (raw) => {
    expect(parseProposal('create', raw)).toEqual({ ok: false, errors: [{ path: ['proposal'], code: 'malformed' }] });
  });
});

describe('proposalDigest', () => {
  it('is 64 lower-case hex and the same for the same normalized proposal, whatever the key order or spelling', () => {
    const a = parsedOk('create', create());
    const b = parsedOk('create', { observation: 'It stops.', title: 'Spindle stops', typeCode: 'anomaly', ownerModelId: MODEL.toUpperCase(), evidence: [] });
    expect(proposalDigest(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(proposalDigest(a)).toBe(proposalDigest(b));
  });

  it.each([
    ['title', create({ title: 'Other' })],
    ['body', create({ observation: 'It stops!' })],
    ['type', create({ typeCode: 'guideline' })],
    ['owner', create({ ownerModelId: OTHER })],
    ['expected', create({ expected: 'Runs' })],
    ['evidence', create({ evidence: [{ sourceKind: 'other', sourceOwner: 'o', sourceRef: 'r' }] })],
  ])('changes with the %s', (_label, raw) => {
    expect(proposalDigest(parsedOk('create', raw))).not.toBe(proposalDigest(parsedOk('create', create())));
  });

  it('a revise without subjects differs from one with an empty list (carry vs replace)', () => {
    expect(proposalDigest(parsedOk('revise', revise()))).not.toBe(proposalDigest(parsedOk('revise', revise({ subjects: [] }))));
  });
});

describe('ownerImmutableErrors', () => {
  const draft = { ownerModelId: MODEL, ownerSoftwareId: null };
  it('passes the same owner', () => {
    expect(ownerImmutableErrors(draft, normalizeProposal(parsedOk('create', create())))).toEqual([]);
  });
  it('refuses another model on ownerModelId', () => {
    expect(ownerImmutableErrors(draft, parsedOk('create', create({ ownerModelId: OTHER })))).toEqual([
      { path: ['proposal', 'ownerModelId'], code: 'immutable' },
    ]);
  });
  it('refuses a software owner on a model-owned draft', () => {
    const swOwned = parsedOk('create', create({ ownerModelId: undefined, ownerSoftwareId: OTHER }));
    expect(ownerImmutableErrors(draft, swOwned)).toEqual([{ path: ['proposal', 'ownerModelId'], code: 'immutable' }]);
    expect(ownerImmutableErrors({ ownerModelId: null, ownerSoftwareId: OTHER }, parsedOk('create', create()))).toEqual([
      { path: ['proposal', 'ownerModelId'], code: 'immutable' },
    ]);
  });
});

describe('validateDraftInput', () => {
  it('draftCreate: a create draft takes no targetItemId, a revise one requires it', () => {
    expect(validateDraftInput('draftCreate', { proposalType: 'create', proposal: create() })).toEqual([]);
    expect(validateDraftInput('draftCreate', { proposalType: 'create', targetItemId: MODEL, proposal: create() })).toEqual([
      { path: ['targetItemId'], code: 'malformed' },
    ]);
    expect(validateDraftInput('draftCreate', { proposalType: 'revise', proposal: revise() })).toEqual([{ path: ['targetItemId'], code: 'required' }]);
    expect(validateDraftInput('draftCreate', { proposalType: 'revise', targetItemId: MODEL, proposal: revise() })).toEqual([]);
  });
  it('draftCreate: the proposal type is required and closed; a proposal error is prefixed', () => {
    expect(validateDraftInput('draftCreate', { proposal: create() })).toContainEqual({ path: ['proposalType'], code: 'required' });
    expect(validateDraftInput('draftCreate', { proposalType: 'publish', proposal: create() })).toContainEqual({ path: ['proposalType'], code: 'malformed' });
    expect(validateDraftInput('draftCreate', { proposalType: 'create', proposal: create({ title: '' }) })).toContainEqual({ path: ['proposal', 'title'], code: 'required' });
  });
  it('draftUpdate: id is a uuid, the proposal an object (its type is the stored draft\'s, judged by the handler)', () => {
    expect(validateDraftInput('draftUpdate', { id: MODEL, proposal: {} })).toEqual([]);
    expect(validateDraftInput('draftUpdate', { id: 'x', proposal: {} })).toEqual([{ path: ['id'], code: 'malformed' }]);
    expect(validateDraftInput('draftUpdate', { id: MODEL })).toEqual([{ path: ['proposal'], code: 'required' }]);
    expect(validateDraftInput('draftUpdate', { id: MODEL, proposal: [] })).toEqual([{ path: ['proposal'], code: 'malformed' }]);
  });
  it('draftSubmit / draftWithdraw: id, and a withdraw reason of at most 500 characters', () => {
    expect(validateDraftInput('draftSubmit', { id: MODEL })).toEqual([]);
    expect(validateDraftInput('draftWithdraw', { id: MODEL })).toEqual([]);
    expect(validateDraftInput('draftWithdraw', { id: MODEL, reason: 'x'.repeat(500) })).toEqual([]);
    expect(validateDraftInput('draftWithdraw', { id: MODEL, reason: 'x'.repeat(501) })).toEqual([{ path: ['reason'], code: 'too_long' }]);
    expect(validateDraftInput('draftWithdraw', { id: MODEL, reason: 'a\u0000b' })).toEqual([{ path: ['reason'], code: 'malformed' }]);
  });
});

describe('validatorRef (#1198 c)', () => {
  const head = (ref: unknown) => ({ proposalType: 'create', proposal: create(), validatorRef: ref });
  const ref = { sourceSystem: 'mars-validator', runId: 'run-7', findingId: 'f-1' };

  it('accepts a full ref and parseDraftHead trims every part', () => {
    expect(validateDraftInput('draftCreate', head(ref))).toEqual([]);
    const parsed = parseDraftHead('draftCreate', head({ sourceSystem: ' a ', runId: ' b', findingId: 'c ' }));
    expect(parsed.ok && parsed.value.validatorRef).toEqual({ sourceSystem: 'a', runId: 'b', findingId: 'c' });
  });

  it.each([
    ['a missing part', { sourceSystem: 'a', runId: 'b' }, 'validatorRef.findingId:required'],
    ['a blank part', { ...ref, runId: '   ' }, 'validatorRef.runId:required'],
    ['a part over 200 characters', { ...ref, findingId: 'x'.repeat(201) }, 'validatorRef.findingId:too_long'],
    ['a control character', { ...ref, sourceSystem: 'a\u0000b' }, 'validatorRef.sourceSystem:malformed'],
    ['a tab', { ...ref, runId: 'a\tb' }, 'validatorRef.runId:malformed'],
    ['a C1 control', { ...ref, findingId: 'a\u0085b' }, 'validatorRef.findingId:malformed'],
  ])('refuses %s', (_label, value, expected) => {
    expect(validateDraftInput('draftCreate', head(value)).map((e) => `${e.path.join('.')}:${e.code}`)).toContain(expected);
  });

  it('refuses an unknown key inside the ref (strict object)', () => {
    expect(validateDraftInput('draftCreate', head({ ...ref, origin: 'ai' })).length).toBeGreaterThan(0);
  });
});

describe('deriveOrigin (#1198 c)', () => {
  it.each([
    ['session', 'internal_member', false, 'human'],
    ['session', 'system', true, 'human'],
    ['token', 'internal_member', false, 'human'],
    ['token', 'internal_member', true, 'human'],
    ['token', 'system', false, 'ai'],
    ['token', 'system', true, 'validator'],
  ] as const)('%s + %s actor + ref %s → %s', (kind, actorType, hasRef, expected) => {
    expect(deriveOrigin(kind, actorType, hasRef)).toBe(expected);
  });
});
