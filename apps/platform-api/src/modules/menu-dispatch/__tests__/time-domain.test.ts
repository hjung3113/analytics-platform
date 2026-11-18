// Step 7 (kernel §6.3, ADR-0172) DB-free: the pure verdict, the registration gate and the placement in `runQuery`.
// The verdict cases mirror packages/host/mock-server/src/__tests__/time-domain.test.ts (`evaluateTimeDomainMerge`),
// read per Site: one Site's guarantee windows instead of one equipment's assertions.

import { describe, expect, it, vi } from 'vitest';

import { judgeQueryShape, runQuery } from '../query.js';
import { MenuDispatchRegistrationError, createMenuDispatchRegistry } from '../registry.js';
import type { ScopeResolver } from '../scope-resolver.js';
import { judgeTimeDomain, siteTimeDomainProblems, type SiteTimeDomainAssertion } from '../time-domain.js';
import type { EndpointDeclarationSpec } from '../types.js';
import { testEndpoint } from './test-declarations.js';

const FULL = '2020-01-01T00:00:00';
const OPEN = '2099-01-01T00:00:00';
const MID = '2026-09-20T00:00:00';
const WEEK_FROM = '2026-09-19T09:00:00';
const WEEK_TO = '2026-09-26T09:00:00';

const w = (timeDomainId: string, validFrom: string, validTo: string) => ({ timeDomainId, validFrom, validTo });
const at = (site: string, timeDomainId: string, validFrom = FULL, validTo = OPEN): SiteTimeDomainAssertion => ({ site, timeDomainId, validFrom, validTo });

describe('judgeTimeDomain (mock evaluateTimeDomainMerge parity, per Site)', () => {
  it.each([
    ['a later window does not backfill a gap', [w('D1', '2026-09-22T00:00:00', OPEN)], 'time_domain_unverified'],
    ['a mid-request change, even abutting', [w('D1', FULL, MID), w('D2', MID, OPEN)], 'time_domain_mismatch'],
    ['a one-second hole', [w('D1', FULL, MID), w('D1', '2026-09-20T00:00:01', OPEN)], 'time_domain_unverified'],
    ['no window', [], 'time_domain_unverified'],
    ['a gap outranks a change', [w('D1', FULL, MID), w('D2', '2026-09-21T00:00:00', OPEN)], 'time_domain_unverified'],
    ['a window ending exactly at from (half-open)', [w('D1', FULL, WEEK_FROM)], 'time_domain_unverified'],
    ['a window starting one second after from', [w('D1', '2026-09-19T09:00:01', OPEN)], 'time_domain_unverified'],
    ['an unvalidated non-calendar window', [w('D1', FULL, '2026-02-30T00:00:00')], 'time_domain_unverified'],
  ])('rejects %s', (_name, windows, message) => {
    expect(judgeTimeDomain(windows, WEEK_FROM, WEEK_TO)).toEqual({ ok: false, message });
  });

  it.each([
    ['abutting windows of one domain stitch', [w('D1', FULL, MID), w('D1', MID, OPEN)]],
    ['windows exactly [from, to)', [w('D1', WEEK_FROM, WEEK_TO)]],
    ['a window of another domain outside the request is ignored', [w('D2', FULL, WEEK_FROM), w('D1', WEEK_FROM, OPEN)]],
  ])('accepts %s', (_name, windows) => {
    expect(judgeTimeDomain(windows, WEEK_FROM, WEEK_TO)).toEqual({ ok: true, timeDomainId: 'D1' });
  });

  it('fails closed on a non-increasing or non-calendar request period', () => {
    const windows = [w('D1', FULL, OPEN)];
    expect(judgeTimeDomain(windows, WEEK_TO, WEEK_FROM)).toMatchObject({ ok: false });
    expect(judgeTimeDomain(windows, WEEK_FROM, WEEK_FROM)).toMatchObject({ ok: false });
    expect(judgeTimeDomain(windows, '2026-13-01T00:00:00', WEEK_TO)).toMatchObject({ ok: false });
  });
});

describe('siteTimeDomainProblems', () => {
  it.each([
    ['a non-calendar time', [at('S1', 'D1', FULL, '2026-02-30T00:00:00')], /calendar times/],
    ['a fractional bound (declared config is second-aligned)', [at('S1', 'D1', '2020-01-01T00:00:00.500')], /calendar times/],
    ['a reversed window', [at('S1', 'D1', OPEN, FULL)], /validFrom must be before validTo/],
    ['a blank domain', [at('S1', ' ')], /non-blank/],
    ['contradicting windows of one Site', [at('S1', 'D1'), at('S1', 'D2', MID)], /site S1 has overlapping windows/],
  ])('reports %s', (_name, rows, message) => {
    expect(siteTimeDomainProblems(rows).join('\n')).toMatch(message);
  });

  it('accepts different domains per Site and a declared change of one Site', () => {
    expect(siteTimeDomainProblems([at('S1', 'D1'), at('S2', 'D2', FULL, MID), at('S2', 'D3', MID, OPEN)])).toEqual([]);
  });
});

const grants = [{ site: 'S1', rooms: ['R1'] }, { site: 'S2', rooms: ['R1'] }];
const resolver: ScopeResolver = { resolve: async () => grants };
const mergeSpec: Partial<EndpointDeclarationSpec> = {
  requiresScope: true, mergeTimeDomain: true, context: { time: 'apply', selection: 'apply' }, limits: { maxHours: 24 * 31 },
};
const guarantees = [at('S1', 'D-ONE'), at('S2', 'D-TWO', FULL, MID), at('S2', 'D-THREE', MID, OPEN)];
const actor = { actor_id: 'a', workspace_id: 'w', role_level: 'user' };
const body = (over: Record<string, unknown> = {}) => ({
  endpoint: 'test.rows',
  context: { scopeId: 'S1', from: WEEK_FROM, to: WEEK_TO, selection: null, ...over },
  params: {},
});

function setup(spec: Partial<EndpointDeclarationSpec> = mergeSpec, timeDomainAssertions: readonly SiteTimeDomainAssertion[] = guarantees) {
  const { declaration } = testEndpoint(spec);
  const handle = vi.fn(declaration.handle);
  declaration.handle = handle;
  const registry = createMenuDispatchRegistry([{ endpoints: [declaration] }], { scopeResolver: resolver, timeDomainAssertions });
  const shapeOf = (payload: unknown) => judgeQueryShape(payload, registry);
  const run = async (payload: unknown) => {
    const shape = shapeOf(payload);
    if (!shape.ok) throw new Error(shape.message);
    return runQuery(shape, actor, 'cid');
  };
  return { run, shapeOf, handle };
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

  it.each([
    ['no guarantees', undefined],
    ['an empty list', []],
  ])('refuses mergeTimeDomain with %s, even with a Scope resolver', (_name, timeDomainAssertions) => {
    expect(refuse(mergeSpec, { scopeResolver: resolver, ...(timeDomainAssertions ? { timeDomainAssertions } : {}) }))
      .toMatch(/mergeTimeDomain is refused — step 7 .*timeDomainAssertions/);
  });

  it('refuses invalid guarantees, and does not count them as supplied', () => {
    const problems = refuse(mergeSpec, { scopeResolver: resolver, timeDomainAssertions: [at('S1', 'D1'), at('S1', 'D2', MID)] });
    expect(problems).toMatch(/site S1 has overlapping windows/);
    expect(problems).toMatch(/mergeTimeDomain is refused — step 7/);
  });

  it('refuses a programmatic row that names an equipment instead of widening it to the Site', () => {
    const row = { ...at('S1', 'D1'), equipmentId: 'E1' };
    const problems = refuse(mergeSpec, { scopeResolver: resolver, timeDomainAssertions: [row] });
    expect(problems).toMatch(/timeDomainAssertions\.0: unknown keys equipmentId/);
    expect(problems).toMatch(/mergeTimeDomain is refused — step 7/);
  });

  it('refuses mergeTimeDomain without a Scope resolver', () => {
    expect(refuse(mergeSpec, { timeDomainAssertions: guarantees })).toMatch(/mergeTimeDomain is refused .*#1087/);
  });

  it('refuses mergeTimeDomain without requiresScope or an applied time', () => {
    const options = { scopeResolver: resolver, timeDomainAssertions: guarantees };
    expect(refuse({ ...mergeSpec, requiresScope: false, context: { time: 'apply' } }, options)).toMatch(/mergeTimeDomain needs requiresScope/);
    expect(refuse({ ...mergeSpec, context: { time: 'reference' }, limits: {} }, options)).toMatch(/mergeTimeDomain needs context.time = apply/);
  });

  it('registers with Scope, an applied time and guarantees; mergeTimeDomain: false needs none', () => {
    expect(refuse(mergeSpec, { scopeResolver: resolver, timeDomainAssertions: guarantees })).toBe('');
    expect(refuse({ requiresScope: true }, { scopeResolver: resolver })).toBe('');
  });
});

describe('step 7 in runQuery', () => {
  it('passes each Site with its own domain and hands the proven id to the handler', async () => {
    const { run, handle } = setup();
    expect(await run(body())).toMatchObject({ outcome: 'ok' });
    expect(handle).toHaveBeenLastCalledWith(expect.objectContaining({ timeDomainId: 'D-ONE' }));
    expect(await run(body({ scopeId: 'S2', from: MID }))).toMatchObject({ outcome: 'ok' });
    expect(handle).toHaveBeenLastCalledWith(expect.objectContaining({ timeDomainId: 'D-THREE' }));
  });

  it.each([
    ['a request across the Site\'s declared change', body({ scopeId: 'S2' }), 'time_domain_mismatch'],
    ['a period before the Site\'s first window', body({ from: '2019-12-31T23:59:59', to: '2020-01-02T00:00:00' }), 'time_domain_unverified'],
  ])('answers error for %s and never reaches the handler', async (_name, payload, message) => {
    const { run, handle } = setup();
    expect(await run(payload)).toEqual({ outcome: 'error', message, data: null, assessments: [], trust: null });
    expect(handle).not.toHaveBeenCalled();
  });

  it('does not take another Site\'s guarantee for the requested Site', async () => {
    const { run, handle } = setup(mergeSpec, [at('S2', 'D-TWO')]);
    expect(await run(body())).toMatchObject({ outcome: 'error', message: 'time_domain_unverified' });
    expect(handle).not.toHaveBeenCalled();
  });

  it('keeps a domain id that spells a failure code as a valid id', async () => {
    const { run, handle } = setup(mergeSpec, [at('S1', 'time_domain_mismatch')]);
    expect(await run(body())).toMatchObject({ outcome: 'ok' });
    expect(handle).toHaveBeenCalledWith(expect.objectContaining({ timeDomainId: 'time_domain_mismatch' }));
  });

  it('keeps forbidden (step 4), too_large (step 5) and empty (step 6) ahead of step 7', async () => {
    const { run, handle } = setup(mergeSpec, [at('S1', 'D-ONE', '2026-09-25T00:00:00')]);
    expect(await run(body({ scopeId: 'S3' }))).toMatchObject({ outcome: 'forbidden' });
    expect(await run(body({ from: '2026-06-01T00:00:00' }))).toMatchObject({ outcome: 'too_large' });
    // Uncovered period, explicit empty Selection: step 6 answers before step 7 would refuse it.
    expect(await run(body({ selection: [] }))).toMatchObject({ outcome: 'empty' });
    expect(handle).not.toHaveBeenCalled();
  });

  it.each([
    ['a reversed period', { from: WEEK_TO, to: WEEK_FROM }],
    ['an impossible date', { to: '2026-02-30T00:00:00' }],
  ])('refuses %s at shape time, so an empty Selection cannot turn it into empty', (_name, over) => {
    const spec = { ...mergeSpec, limits: {} };
    const { shapeOf } = setup(spec);
    expect(shapeOf(body({ ...over, selection: [] }))).toMatchObject({ ok: false, message: 'test.rows: time is not an increasing calendar period' });
  });

  /** A shape whose step-7 lookup runs `during` inside the synchronous judgment (the clock or a cancel landing there). */
  function hooked(shape: Extract<ReturnType<typeof judgeQueryShape>, { ok: true }>, during: () => void) {
    const timeDomains = shape.timeDomains;
    if (!timeDomains) throw new Error('no guarantees');
    return { ...shape, timeDomains: { get: (site: string) => { during(); return timeDomains.get(site); } } as unknown as typeof timeDomains };
  }

  it('does not start the handler when the arrival deadline passes during step 7', async () => {
    vi.useFakeTimers(); vi.setSystemTime(10000);
    try {
      const { declaration } = testEndpoint(mergeSpec);
      const handle = vi.fn(declaration.handle);
      const registry = createMenuDispatchRegistry([{ endpoints: [{ ...declaration, handle, upstreamTimeoutMs: 3000 }] }], { scopeResolver: resolver, timeDomainAssertions: guarantees });
      const shape = judgeQueryShape(body(), registry);
      if (!shape.ok) throw new Error(shape.message);
      await expect(runQuery(hooked(shape, () => vi.setSystemTime(13000)), actor, 'cid', undefined, async () => 'sv', 10000))
        .rejects.toMatchObject({ httpStatus: 504, code: 'upstream.timeout' });
      expect(handle).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not start the handler when the request is cancelled after Scope resolution', async () => {
    const { shapeOf, handle } = setup();
    const shape = shapeOf(body());
    if (!shape.ok) throw new Error(shape.message);
    const controller = new AbortController();
    expect(await runQuery(hooked(shape, () => controller.abort()), actor, 'cid', controller.signal))
      .toMatchObject({ outcome: 'error', message: 'time_domain_unverified' });
    expect(handle).not.toHaveBeenCalled();
  });

  it('skips step 7 entirely for mergeTimeDomain: false', async () => {
    const { run, handle } = setup({ ...mergeSpec, mergeTimeDomain: false }, []);
    expect(await run(body({ scopeId: 'S2' }))).toMatchObject({ outcome: 'ok' });
    expect(handle).toHaveBeenCalledWith(expect.not.objectContaining({ timeDomainId: expect.anything() }));
  });
});
