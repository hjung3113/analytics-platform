// Step 7 (kernel §6.3) DB-free: the pure verdict, the registration gate and the placement in `runQuery`.
// The verdict cases mirror packages/host/mock-server/src/__tests__/time-domain.test.ts (`evaluateTimeDomainMerge`).

import { describe, expect, it, vi } from 'vitest';

import { MenuUpstreamError } from '../forwarder.js';
import { judgeQueryShape, runQuery } from '../query.js';
import { MenuDispatchRegistrationError, createMenuDispatchRegistry } from '../registry.js';
import type { ScopeResolver } from '../scope-resolver.js';
import { judgeTimeDomain, type TimeDomainProofSource, type TimeDomainSubject } from '../time-domain.js';
import type { EndpointDeclarationSpec } from '../types.js';
import { testEndpoint } from './test-declarations.js';

const FULL = '2020-01-01T00:00:00';
const OPEN = '2099-01-01T00:00:00';
const MID = '2026-09-20T00:00:00';
const WEEK_FROM = '2026-09-19T09:00:00';
const WEEK_TO = '2026-09-26T09:00:00';

const w = (timeDomainId: string, validFrom: string, validTo: string) => ({ timeDomainId, validFrom, validTo });
const subject = (subjectId: string, ...windows: ReturnType<typeof w>[]): TimeDomainSubject => ({ subjectId, windows });

describe('judgeTimeDomain (mock evaluateTimeDomainMerge parity)', () => {
  it.each([
    ['a later window does not backfill a gap', [subject('A', w('D1', '2026-09-22T00:00:00', OPEN)), subject('B', w('D2', FULL, OPEN))], 'time_domain_unverified'],
    ['two fully covered domains', [subject('A', w('D1', FULL, OPEN)), subject('B', w('D2', FULL, OPEN))], 'time_domain_mismatch'],
    ['a mid-request change, even abutting', [subject('A', w('D1', FULL, MID), w('D2', MID, OPEN)), subject('B', w('D1', FULL, OPEN))], 'time_domain_mismatch'],
    ['a one-second hole', [subject('A', w('D1', FULL, MID), w('D1', '2026-09-20T00:00:01', OPEN)), subject('B', w('D1', FULL, OPEN))], 'time_domain_unverified'],
    ['a subject without windows', [subject('A'), subject('B', w('D1', FULL, OPEN))], 'time_domain_unverified'],
    ['no subject at all', [], 'time_domain_unverified'],
    ['a gap outranks a mismatch', [subject('A', w('D1', '2026-09-22T00:00:00', OPEN)), subject('B', w('D2', FULL, OPEN)), subject('C', w('D1', FULL, OPEN))], 'time_domain_unverified'],
    ['a window ending exactly at from does not cover (half-open)', [subject('A', w('D1', FULL, WEEK_FROM))], 'time_domain_unverified'],
    ['a window starting one second after from', [subject('A', w('D1', '2026-09-19T09:00:01', OPEN))], 'time_domain_unverified'],
  ])('rejects %s', (_name, subjects, message) => {
    expect(judgeTimeDomain(subjects, WEEK_FROM, WEEK_TO)).toEqual({ ok: false, message });
  });

  it.each([
    ['abutting windows of one domain stitch', [subject('A', w('D1', FULL, MID), w('D1', MID, OPEN)), subject('B', w('D1', FULL, OPEN))]],
    ['overlapping windows of one domain', [subject('A', w('D1', FULL, '2026-09-21T00:00:00'), w('D1', MID, OPEN))]],
    ['windows exactly [from, to)', [subject('A', w('D1', WEEK_FROM, WEEK_TO))]],
    ['one Site-wide subject', [subject('site', w('D1', FULL, OPEN))]],
    ['a window of another domain outside the request is ignored', [subject('A', w('D2', FULL, WEEK_FROM), w('D1', WEEK_FROM, OPEN))]],
  ])('accepts %s', (_name, subjects) => {
    expect(judgeTimeDomain(subjects, WEEK_FROM, WEEK_TO)).toEqual({ ok: true, timeDomainId: 'D1' });
  });

  // The source answer is untrusted: one malformed row voids the proof instead of being skipped.
  it.each([
    ['a non-calendar validTo', [subject('A', w('D1', FULL, '2026-02-30T00:00:00'))]],
    ['an offset datetime', [subject('A', w('D1', '2020-01-01T00:00:00Z', OPEN))]],
    ['a reversed window', [subject('A', w('D1', FULL, OPEN), w('D1', OPEN, FULL))]],
    ['an empty window', [subject('A', w('D1', FULL, OPEN), w('D1', MID, MID))]],
    ['a blank domain id', [subject('A', w(' ', FULL, OPEN))]],
    ['a blank subject id', [subject('', w('D1', FULL, OPEN))]],
    ['a non-array answer', { subjectId: 'A', windows: [] }],
    ['a non-object subject', ['A']],
    ['a non-object window', [{ subjectId: 'A', windows: [null] }]],
  ])('fails closed on %s', (_name, subjects) => {
    expect(judgeTimeDomain(subjects, WEEK_FROM, WEEK_TO)).toEqual({ ok: false, message: 'time_domain_unverified' });
  });

  it('fails closed on a non-increasing or non-calendar request period', () => {
    const subjects = [subject('A', w('D1', FULL, OPEN))];
    expect(judgeTimeDomain(subjects, WEEK_TO, WEEK_FROM)).toMatchObject({ ok: false });
    expect(judgeTimeDomain(subjects, WEEK_FROM, WEEK_FROM)).toMatchObject({ ok: false });
    expect(judgeTimeDomain(subjects, '2026-13-01T00:00:00', WEEK_TO)).toMatchObject({ ok: false });
  });
});

const grants = [{ site: 'S1', rooms: ['R1'] }, { site: 'S2', rooms: ['R1'] }];
const resolver: ScopeResolver = { resolve: async () => grants };
const mergeSpec: Partial<EndpointDeclarationSpec> = {
  requiresScope: true, mergeTimeDomain: true, context: { time: 'apply', selection: 'apply' }, limits: { maxHours: 24 * 31 },
};
const actor = { actor_id: 'a', workspace_id: 'w', role_level: 'user' };
const body = (over: Record<string, unknown> = {}) => ({
  endpoint: 'test.rows',
  context: { scopeId: 'S1', from: WEEK_FROM, to: WEEK_TO, selection: null, ...over },
  params: {},
});

/** Per-Site windows held by the deployment; Sites may differ in domain. */
const perSite: Record<string, TimeDomainSubject[]> = {
  S1: [subject('S1', w('D-ONE', FULL, OPEN))],
  S2: [subject('S2', w('D-TWO', FULL, OPEN))],
};
const siteSource = (): TimeDomainProofSource & { prove: ReturnType<typeof vi.fn> } => ({
  prove: vi.fn(async ({ scopeId }) => perSite[scopeId] ?? []),
});

function setup(spec: Partial<EndpointDeclarationSpec> = mergeSpec, proof: TimeDomainProofSource | undefined = siteSource(), endpointOver: { upstreamTimeoutMs?: number } = {}) {
  const { declaration, calls } = testEndpoint(spec);
  Object.assign(declaration, endpointOver);
  const handle = vi.fn(declaration.handle);
  declaration.handle = handle;
  const registry = createMenuDispatchRegistry([{ endpoints: [declaration] }], {
    scopeResolver: resolver, ...(proof ? { timeDomainProof: proof } : {}),
  });
  const run = async (payload: unknown) => {
    const shape = judgeQueryShape(payload, registry);
    if (!shape.ok) throw new Error(shape.message);
    return runQuery(shape, actor, 'cid');
  };
  return { run, handle, calls };
}

describe('time-domain registration gate', () => {
  const refuse = (spec: Partial<EndpointDeclarationSpec>, options: Parameters<typeof createMenuDispatchRegistry>[1]) => {
    try {
      createMenuDispatchRegistry([{ endpoints: [testEndpoint(spec).declaration] }], options);
    } catch (error) {
      if (error instanceof MenuDispatchRegistrationError) return error.problems.join('\n');
      throw error;
    }
    return '';
  };

  it('refuses mergeTimeDomain without a proof source, even with a Scope resolver', () => {
    expect(refuse(mergeSpec, { scopeResolver: resolver })).toMatch(/mergeTimeDomain is refused — step 7 .*proof source/);
  });

  it('refuses mergeTimeDomain without a Scope resolver', () => {
    expect(refuse(mergeSpec, { timeDomainProof: siteSource() })).toMatch(/mergeTimeDomain is refused .*#1087/);
  });

  it('refuses mergeTimeDomain without requiresScope or an applied time', () => {
    const options = { scopeResolver: resolver, timeDomainProof: siteSource() };
    expect(refuse({ ...mergeSpec, requiresScope: false, context: { time: 'apply' } }, options)).toMatch(/mergeTimeDomain needs requiresScope/);
    expect(refuse({ ...mergeSpec, context: { time: 'reference' }, limits: {} }, options)).toMatch(/mergeTimeDomain needs context.time = apply/);
  });

  it('registers with Scope, an applied time and a proof source', () => {
    expect(refuse(mergeSpec, { scopeResolver: resolver, timeDomainProof: siteSource() })).toBe('');
  });

  it('leaves mergeTimeDomain: false untouched by the proof source', () => {
    expect(refuse({ requiresScope: true }, { scopeResolver: resolver })).toBe('');
  });
});

describe('step 7 in runQuery', () => {
  it('passes each Site with its own domain and hands the proven id to the handler', async () => {
    const proof = siteSource();
    const { run, handle } = setup(mergeSpec, proof);
    expect(await run(body())).toMatchObject({ outcome: 'ok' });
    expect(handle).toHaveBeenLastCalledWith(expect.objectContaining({ timeDomainId: 'D-ONE' }));
    expect(await run(body({ scopeId: 'S2' }))).toMatchObject({ outcome: 'ok' });
    expect(handle).toHaveBeenLastCalledWith(expect.objectContaining({ timeDomainId: 'D-TWO' }));
    expect(proof.prove).toHaveBeenNthCalledWith(1, expect.objectContaining({
      endpointId: 'test.rows', actor, scopeId: 'S1', from: WEEK_FROM, to: WEEK_TO, scopes: grants,
      context: { scopeId: 'S1', from: WEEK_FROM, to: WEEK_TO, selection: null },
    }));
  });

  it.each([
    ['a partial window', [subject('S1', w('D-ONE', '2026-09-22T00:00:00', OPEN))], 'time_domain_unverified'],
    ['a one-second gap between windows', [subject('S1', w('D-ONE', FULL, MID), w('D-ONE', '2026-09-20T00:00:01', OPEN))], 'time_domain_unverified'],
    ['no proof for the Site', [], 'time_domain_unverified'],
    ['a malformed window', [subject('S1', w('D-ONE', FULL, '2026-02-30T00:00:00'))], 'time_domain_unverified'],
    ['equipment in two domains', [subject('E1', w('D-ONE', FULL, OPEN)), subject('E2', w('D-TWO', FULL, OPEN))], 'time_domain_mismatch'],
  ])('answers error for %s and never reaches the handler', async (_name, answer, message) => {
    const { run, handle } = setup(mergeSpec, { prove: async () => answer });
    expect(await run(body())).toEqual({ outcome: 'error', message, data: null, assessments: [], trust: null });
    expect(handle).not.toHaveBeenCalled();
  });

  it('does not take another Site\'s proof for the requested Site', async () => {
    const { run, handle } = setup(mergeSpec, { prove: async ({ scopeId }) => (scopeId === 'S1' ? [] : perSite.S2 ?? []) });
    expect(await run(body())).toMatchObject({ outcome: 'error', message: 'time_domain_unverified' });
    expect(handle).not.toHaveBeenCalled();
  });

  it('answers unverified when the source throws, without leaking its message', async () => {
    const { run, handle } = setup(mergeSpec, { prove: async () => { throw new Error('private source detail'); } });
    const result = await run(body());
    expect(result).toMatchObject({ outcome: 'error', message: 'time_domain_unverified' });
    expect(JSON.stringify(result)).not.toContain('private');
    expect(handle).not.toHaveBeenCalled();
  });

  it('keeps forbidden (step 4), too_large (step 5) and empty (step 6) ahead of step 7', async () => {
    const proof = siteSource();
    const { run, handle } = setup(mergeSpec, proof);
    expect(await run(body({ scopeId: 'S3' }))).toMatchObject({ outcome: 'forbidden' });
    expect(await run(body({ from: '2026-06-01T00:00:00' }))).toMatchObject({ outcome: 'too_large' });
    expect(await run(body({ selection: [] }))).toMatchObject({ outcome: 'empty' });
    expect(proof.prove).not.toHaveBeenCalled();
    expect(handle).not.toHaveBeenCalled();
  });

  it('skips step 7 entirely for mergeTimeDomain: false', async () => {
    const proof = siteSource();
    const { run, handle } = setup({ ...mergeSpec, mergeTimeDomain: false }, proof);
    expect(await run(body({ scopeId: 'S1' }))).toMatchObject({ outcome: 'ok' });
    expect(proof.prove).not.toHaveBeenCalled();
    expect(handle).toHaveBeenCalledWith(expect.not.objectContaining({ timeDomainId: expect.anything() }));
  });

  it('lets the core deadline win over a hanging source', async () => {
    const hang: TimeDomainProofSource = { prove: ({ signal }) => new Promise((_resolve, reject) => {
      signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
    }) };
    const { run, handle } = setup(mergeSpec, hang, { upstreamTimeoutMs: 20 });
    await expect(run(body())).rejects.toBeInstanceOf(MenuUpstreamError);
    expect(handle).not.toHaveBeenCalled();
  });
});
