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
  context: { time: 'apply', roomNames: 'apply', metric: 'apply' },
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
      if (Object.keys(context).some(k => !expected.includes(k)) && !breaks.has('non-applied')) return err('non-applied key');
      if (expected.some(k => !(k in context))) return err('missing applied key');
      if (typeof context.from !== 'string' || typeof context.to !== 'string') return err('period');
      if (context.metricVersion != null && context.metricId == null) return err('metric pair');
      if (!state.permissions.has(spec.permission) && !breaks.has('permission')) return forbidden;
      if (context.scopeId !== 'ICH' && !breaks.has('scope')) return forbidden;
      if (Array.isArray(context.roomNames) && context.roomNames.length === 0 && !breaks.has('explicit-empty')) {
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
      'fixture.list · missing applied Context key metricVersion → error',
      'fixture.list · time applied with a null from → error',
      'fixture.list · metricVersion without metricId → error',
      'fixture.list · a site without a grant → forbidden',
      'fixture.list · a null Scope → forbidden',
      'fixture.list · explicit empty roomNames: [] → empty with no assessments and no trust',
      'fixture.list · without analytics:view → forbidden',
    ]);
  });

  it('passes every check on a conforming server', async () => {
    expect(await failing([])).toEqual([]);
  });

  it.each([
    ['top-level', 'fixture.list · unknown top-level request key → error'],
    ['params', 'fixture.list · unknown params key → error'],
    ['non-applied', 'fixture.list · non-applied Context key condition → error'],
    ['permission', 'fixture.list · without analytics:view → forbidden'],
    ['explicit-empty', 'fixture.list · explicit empty roomNames: [] → empty with no assessments and no trust'],
    ['kinds', 'fixture.list · granted request succeeds with exactly the declared assessment kinds'],
  ])('fails exactly the matching check when the server drops the %s rule', async (broken, check) => {
    expect(await failing([broken])).toEqual([check]);
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
