import { describe, expect, it } from 'vitest';
import {
  defineEndpoint, emptyGlobal, projectContext,
  type ApiResponse, type GlobalContext, type MenuQuery, type Permission, type PlatformAdapter,
} from '@ap/contracts';
import { planServerConformance, runServerConformance, type ServerConformanceHarness } from './index';

const spec = defineEndpoint<{ page: number }, { rows: number }>({
  id: 'fixture.list',
  menuId: 'fixture',
  paramKeys: { page: true },
  permission: 'analytics:view',
  requiresScope: true,
  context: { time: 'apply', roomNames: 'apply', selection: 'apply', metric: 'apply' },
  kinds: ['collection', 'coverage'],
  mergeTimeDomain: false,
});

const err = (message: string): ApiResponse<unknown> => ({ outcome: 'error', message, data: null, assessments: [], trust: null, correlationId: 'ref' });
const forbidden: ApiResponse<unknown> = { outcome: 'forbidden', data: null, assessments: [], trust: null, correlationId: 'ref' };

/**
 * A minimal reference server that follows the contract for one endpoint — so every check must pass on it — and
 * a `break` switch that drops exactly one rule, so the matching check must fail.
 */
function referenceAdapter(state: { permissions: Set<Permission> }, breaks: ReadonlySet<string> = new Set()): Pick<PlatformAdapter, 'menuQuery'> {
  return {
    menuQuery: async (raw: MenuQuery) => {
      const req = raw as MenuQuery & Record<string, unknown>;
      if (Object.keys(req).some(k => !['endpoint', 'context', 'params'].includes(k)) && !breaks.has('top-level')) return err('unexpected key');
      if (req.endpoint !== spec.id) return err('unknown endpoint');
      const params = req.params as Record<string, unknown>;
      if (Object.keys(params).some(k => k !== 'page') && !breaks.has('params')) return err('unknown params key');
      const expected = Object.keys(projectContext(spec, emptyGlobal));
      const context = req.context as Partial<GlobalContext>;
      const extra = Object.keys(context).filter(k => !expected.includes(k));
      // 'non-applied-first-only' rejects only the first undeclared key a lazy server happens to check.
      if (extra.length > 0 && !breaks.has('non-applied') && !(breaks.has('non-applied-first-only') && !extra.includes('condition'))) return err('non-applied key');
      const missing = expected.filter(k => !(k in context));
      // 'missing-last-only' notices only the last projected key going missing.
      if (missing.length > 0 && !(breaks.has('missing-last-only') && !missing.includes(expected[expected.length - 1]))) return err('missing applied key');
      if (typeof context.from !== 'string' || typeof context.to !== 'string') return err('period');
      if (context.metricVersion != null && context.metricId == null) return err('metric pair');
      if (!state.permissions.has(spec.permission) && !breaks.has('permission')) return forbidden;
      if (context.scopeId !== 'ICH' && !breaks.has('scope')) return forbidden;
      const emptySets = (['roomNames', 'selection'] as const).filter(k => Array.isArray(context[k]) && (context[k] as unknown[]).length === 0);
      const honoured = breaks.has('explicit-empty-roomNames-only') ? emptySets.filter(k => k === 'roomNames') : emptySets;
      if (honoured.length > 0 && !breaks.has('explicit-empty')) {
        return { outcome: 'empty', data: null, assessments: [], trust: null, correlationId: 'ref' };
      }
      const assessments = breaks.has('kinds')
        ? [{ kind: 'collection' as const, state: 'unknown' as const, reason: 'source_unavailable' as const }]
        : spec.kinds.map(kind => ({ kind, state: 'unknown' as const, reason: 'source_unavailable' as const }));
      return { outcome: 'ok', data: { rows: 1 }, assessments, trust: null, correlationId: 'ref' };
    },
  };
}

function harness(breaks: ReadonlySet<string> = new Set()): ServerConformanceHarness {
  const state = { permissions: new Set<Permission>(['analytics:view']) };
  return {
    adapter: referenceAdapter(state, breaks),
    cases: [{ spec, params: { page: 0 } }],
    context: { scopeId: 'ICH', from: '2026-09-25T09:00:00', to: '2026-09-26T09:00:00' },
    foreignScopeId: 'XIA',
    asGranted: fn => fn(),
    withoutPermission: async (permission, fn) => {
      state.permissions.delete(permission);
      try { return await fn(); } finally { state.permissions.add(permission); }
    },
  };
}

async function failing(breaks: string[]): Promise<string[]> {
  return (await runServerConformance(harness(new Set(breaks)))).filter(r => r.failure !== null).map(r => r.id);
}

describe('server conformance kit (#145)', () => {
  it('derives the checks from the declaration', () => {
    expect(planServerConformance(harness()).map(c => c.id)).toEqual([
      'unknown endpoint → error',
      'fixture.list · granted request succeeds with exactly the declared assessment kinds',
      'fixture.list · unknown top-level request key → error',
      'fixture.list · unknown params key → error',
      'fixture.list · non-applied Context key condition → error',
      'fixture.list · non-applied Context key lotIds → error',
      'fixture.list · non-applied Context key ppid → error',
      'fixture.list · non-applied Context key recipeIds → error',
      'fixture.list · missing applied Context key scopeId → error',
      'fixture.list · missing applied Context key from → error',
      'fixture.list · missing applied Context key to → error',
      'fixture.list · missing applied Context key roomNames → error',
      'fixture.list · missing applied Context key selection → error',
      'fixture.list · missing applied Context key metricId → error',
      'fixture.list · missing applied Context key metricVersion → error',
      'fixture.list · time applied with a null from → error',
      'fixture.list · metricVersion without metricId → error',
      'fixture.list · a site without a grant → forbidden',
      'fixture.list · a null Scope → forbidden',
      'fixture.list · explicit empty roomNames: [] → empty with no assessments and no trust',
      'fixture.list · explicit empty selection: [] → empty with no assessments and no trust',
      'fixture.list · without analytics:view → forbidden',
    ]);
  });

  it('passes every check on a conforming server', async () => {
    expect(await failing([])).toEqual([]);
  });

  it.each([
    ['top-level', 'fixture.list · unknown top-level request key → error'],
    ['params', 'fixture.list · unknown params key → error'],

    ['permission', 'fixture.list · without analytics:view → forbidden'],

    ['kinds', 'fixture.list · granted request succeeds with exactly the declared assessment kinds'],
  ])('fails exactly the matching check when the server drops the %s rule', async (broken, check) => {
    expect(await failing([broken])).toEqual([check]);
  });

  // #146 review: one sampled key per rule let a server that checks only that key pass. Every key is a check now.
  it.each([
    ['non-applied', ['condition', 'lotIds', 'ppid', 'recipeIds'].map(k => `fixture.list · non-applied Context key ${k} → error`)],
    ['non-applied-first-only', ['lotIds', 'ppid', 'recipeIds'].map(k => `fixture.list · non-applied Context key ${k} → error`)],
    // from/to stay caught by the reference server's separate absolute-period rule.
    ['missing-last-only', ['scopeId', 'roomNames', 'selection', 'metricId'].map(k => `fixture.list · missing applied Context key ${k} → error`)],
    ['explicit-empty', ['roomNames', 'selection'].map(k => `fixture.list · explicit empty ${k}: [] → empty with no assessments and no trust`)],
    ['explicit-empty-roomNames-only', ['fixture.list · explicit empty selection: [] → empty with no assessments and no trust']],
  ])('catches a server that drops the %s rule on any declared key', async (broken, checks) => {
    expect(await failing([broken])).toEqual(checks);
  });

  it('fails both Scope checks when the server ignores the site grant', async () => {
    expect(await failing(['scope'])).toEqual([
      'fixture.list · a site without a grant → forbidden',
      'fixture.list · a null Scope → forbidden',
    ]);
  });

  it('reports an adapter that throws instead of answering an envelope', async () => {
    const h = harness();
    const results = await runServerConformance({ ...h, adapter: { menuQuery: async () => { throw new Error('boom'); } } });
    expect(results.every(r => r.failure?.includes('threw'))).toBe(true);
  });
});

// #175: the maxRows check is derived only for a case that provides an oversize sample, and it must fail a
// server that ignores the declared cap (answers ok with the oversized rows) while passing a compliant one.
describe('declared maxRows oversize check (#175)', () => {
  const exportSpec = defineEndpoint<{ tail: string }, string[]>({
    id: 'fixture.export',
    menuId: 'fixture',
    paramKeys: { tail: true },
    permission: 'analytics:view',
    requiresScope: true,
    context: { time: 'apply', roomNames: 'apply', selection: 'apply', metric: 'apply' },
    kinds: ['collection', 'coverage'],
    mergeTimeDomain: false,
    limits: { maxRows: 2 },
  });
  const CHECK_ID = `${exportSpec.id} · oversize result over the declared maxRows → too_large with no data`;

  const OK_ENVELOPE = {
    outcome: 'ok' as const,
    data: ['r1', 'r2', 'r3'],
    assessments: exportSpec.kinds.map(kind => ({ kind, state: 'unknown' as const, reason: 'source_unavailable' as const })),
    trust: null,
    correlationId: 'ref',
  };
  const ENVELOPE: Record<'too_large' | 'ok' | 'too_large with data', ApiResponse<unknown>> = {
    'too_large': { outcome: 'too_large', message: 'Result has 3 rows, over the declared maxRows 2', data: null, assessments: [], trust: null, correlationId: 'ref' },
    'ok': OK_ENVELOPE,
    'too_large with data': { ...OK_ENVELOPE, outcome: 'too_large', message: 'Result has 3 rows, over the declared maxRows 2' },
  };

  function oversizeHarness(answers: 'too_large' | 'ok' | 'too_large with data'): ServerConformanceHarness {
    const state = { permissions: new Set<Permission>(['analytics:view']) };
    return {
      adapter: { menuQuery: async () => ENVELOPE[answers] },
      cases: [{ spec: exportSpec, params: { tail: 'p95' }, oversizeParams: { tail: 'all' } }],
      context: { scopeId: 'ICH', from: '2026-09-25T09:00:00', to: '2026-09-26T09:00:00' },
      foreignScopeId: 'XIA',
      asGranted: fn => fn(),
      withoutPermission: async (permission, fn) => {
        state.permissions.delete(permission);
        try { return await fn(); } finally { state.permissions.add(permission); }
      },
    };
  }

  it('derives the check only when the case provides oversizeParams', () => {
    expect(planServerConformance(oversizeHarness('too_large')).map(c => c.id)).toContain(CHECK_ID);
    const cases = [{ spec: exportSpec, params: { tail: 'p95' } }];
    expect(planServerConformance({ ...oversizeHarness('too_large'), cases }).map(c => c.id)).not.toContain(CHECK_ID);
  });

  // #175 review P2-3: a maxRows declaration with no oversize sample must not vanish — it plans a skipped check
  // that runServerConformance reports and describeServerConformance registers as `it.skip`.
  it('plans a visible not-covered check when the case has no oversizeParams', async () => {
    const cases = [{ spec: exportSpec, params: { tail: 'p95' } }];
    const h = { ...oversizeHarness('too_large'), cases };
    expect(planServerConformance(h).filter(c => c.mode === 'skipped').map(c => c.id))
      .toEqual([`${exportSpec.id} · declares maxRows but has no oversizeParams sample — oversize check not run`]);
    const skipped = (await runServerConformance(h)).find(r => r.id === `${exportSpec.id} · declares maxRows but has no oversizeParams sample — oversize check not run`);
    // #175 follow-up P2-A: a check that did not run is reported as skipped, never as a pass.
    expect(skipped).toEqual({ id: `${exportSpec.id} · declares maxRows but has no oversizeParams sample — oversize check not run`, status: 'skipped', failure: null });
  });

  it('flags an oversize sample on an endpoint that declares no maxRows (P3-B)', async () => {
    const { limits: _limits, ...uncapped } = exportSpec;
    const h = { ...oversizeHarness('too_large'), cases: [{ spec: uncapped as typeof exportSpec, params: { tail: 'p95' }, oversizeParams: { tail: 'p50' } }] };
    const result = (await runServerConformance(h)).find(r => r.id.endsWith('oversizeParams given but the endpoint declares no maxRows'));
    expect(result?.status).toBe('failed');
  });

  it('plans no skipped check when the case provides oversizeParams', () => {
    expect(planServerConformance(oversizeHarness('too_large')).some(c => c.mode === 'skipped')).toBe(false);
  });

  it('passes on a server that answers too_large with no data', async () => {
    const h = oversizeHarness('too_large');
    const check = planServerConformance(h).find(c => c.id === CHECK_ID)!;
    expect(await h.asGranted(check.run)).toBeNull();
  });

  it('fails on a server that ignores the declared maxRows', async () => {
    const h = oversizeHarness('ok');
    const check = planServerConformance(h).find(c => c.id === CHECK_ID)!;
    expect(await h.asGranted(check.run)).toContain('too_large');
  });

  // #175 review P3-2b: pins the `data !== null` assertion — a too_large that smuggles the rows through is a failure.
  it('fails on a server that answers too_large with data', async () => {
    const h = oversizeHarness('too_large with data');
    const check = planServerConformance(h).find(c => c.id === CHECK_ID)!;
    expect(await h.asGranted(check.run)).toContain('carries no data');
  });
});
