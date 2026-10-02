import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Capability, ContextKey, MenuMeta, PageResult } from '@ap/contracts';
import { createMockAdapter, getRole, setRole, type RoleId } from '@ap/mock-server';
import { cycleMock, percentile, population, slowExecutions } from './cycle';
import { CYCLE_MAX_HOURS, cycleExportEndpoint, cycleKpiEndpoint, cycleSlowPageEndpoint, executionKey, type CycleKpi, type SlowRow } from '../endpoints';
import { EQUIPMENT } from '@ap/mock-server';
import { emptyGlobal } from '@ap/contracts';

const none: Record<ContextKey, Capability> = {
  time: 'unsupported', roomNames: 'unsupported', condition: 'unsupported', selection: 'unsupported',
  lot: 'unsupported', ppid: 'unsupported', recipe: 'unsupported', metric: 'unsupported',
};
/** Inline mirror of the cycle-time manifest in '../index.ts' (permission, requiresScope, context). 바꾸면 같이 바꾼다. */
const cycleMenu: MenuMeta = {
  id: 'cycle-time', group: 'analytics', label: { ko: '사이클타임 상세', en: 'Cycle time detail' }, description: { ko: '', en: '' },
  path: '/analytics/cycle-time', permission: 'analytics:view', requiresScope: true, pageType: 'analysis',
  context: { ...none, time: 'apply', roomNames: 'apply', condition: 'apply', selection: 'apply', lot: 'apply', ppid: 'apply', recipe: 'apply', metric: 'apply' },
  features: { export: true, savedView: false, annotate: true, compare: true }, pageKeys: ['granularity', 'percentile', 'sort', 'page', 'bucket', 'bin'],
};

const adapter = createMockAdapter({ endpoints: [...cycleMock], registry: { menus: [cycleMenu] } });
const context = {
  scopeId: 'ICH', from: '2026-09-25T09:00:00', to: '2026-09-26T09:00:00',
  roomNames: null, condition: null, selection: null, lotIds: null, ppid: null, recipeIds: null, metricId: null, metricVersion: null,
};
const allFilter = { tail: 'all' as const, granularity: 'hour' as const, bucket: null, bin: null };
const page0 = { page: 0, pageSize: 10 };

const previousRole: RoleId = getRole();
beforeEach(() => { setRole('engineer'); });
afterEach(() => { setRole(previousRole); });

describe('cycle-time endpoints', () => {
  it('registers against the cycle-time manifest', () => {
    expect(() => createMockAdapter({ endpoints: [...cycleMock], registry: { menus: [cycleMenu] } })).not.toThrow();
  });

  // Export used to read the population directly, bypassing the per-request permission check (#47);
  // it now goes through the export endpoint and is rejected like any other read.
  it('rejects export for a role without analytics:view', async () => {
    setRole('viewer');
    const response = await adapter.menuQuery({ endpoint: cycleExportEndpoint.id, context, params: allFilter });
    expect(response.outcome).toBe('forbidden');
  });

  it('exports the same rows the slow table pages through', async () => {
    const exported = await adapter.menuQuery({ endpoint: cycleExportEndpoint.id, context, params: { ...allFilter, ids: null } });
    expect(exported.outcome).toBe('ok');
    const rows = exported.data as SlowRow[];
    expect(rows.length).toBeGreaterThan(0);
    const page = await adapter.menuQuery({
      endpoint: cycleSlowPageEndpoint.id, context,
      params: { ...allFilter, page: 0, pageSize: 10_000, sorting: [{ id: 'cycleMin', desc: true }] },
    });
    expect((page.data as PageResult<SlowRow>).total).toBe(rows.length);
  });

  it('filters a selection export by execution keys server-side (#173), judging the cap on the selection', async () => {
    const all = (await adapter.menuQuery({ endpoint: cycleExportEndpoint.id, context, params: { ...allFilter, ids: null } })).data as SlowRow[];
    expect(all.length).toBeGreaterThan(2);
    const keys = [executionKey(all[0]), executionKey(all[1])];
    const selected = await adapter.menuQuery({ endpoint: cycleExportEndpoint.id, context, params: { ...allFilter, ids: keys } });
    expect((selected.data as SlowRow[]).map(executionKey).sort()).toEqual([...keys].sort());
  });

  it('declares the page endpoints’ period cap (#175 review P3-6) and refuses cross-time-domain sets like the screen (#173 P3-10)', async () => {
    expect(cycleExportEndpoint.limits).toEqual({ maxRows: 50_000, maxHours: CYCLE_MAX_HOURS });
    expect(cycleExportEndpoint.mergeTimeDomain).toBe(true);
    const week = { from: '2026-09-19T09:00:00', to: '2026-09-26T09:00:00' };
    const page = await adapter.menuQuery({ endpoint: cycleSlowPageEndpoint.id, context: { ...context, ...week }, params: { ...allFilter, ...page0 } });
    expect(page.outcome).toBe('error'); // the screen refuses the 7-day ICH merge
    const exported = await adapter.menuQuery({ endpoint: cycleExportEndpoint.id, context: { ...context, ...week }, params: { ...allFilter, ids: null } });
    expect(exported.outcome).toBe('error'); // so does the export — it never merges what the screen refuses
  });

  it('exports in the table’s sort, so a sorted set comes out in page order (#173 UX P2-6)', async () => {
    const sorting = [{ id: 'cycleMin', desc: true }];
    const exported = await adapter.menuQuery({ endpoint: cycleExportEndpoint.id, context, params: { ...allFilter, ids: null, sorting } });
    const page = await adapter.menuQuery({ endpoint: cycleSlowPageEndpoint.id, context, params: { ...allFilter, page: 0, pageSize: 10_000, sorting } });
    expect((exported.data as SlowRow[]).map(executionKey)).toEqual((page.data as PageResult<SlowRow>).rows.map(executionKey));
  });

  it('computes with the version the server resolves from the metric pair: page default v3, not-applied → v3', async () => {
    const granted = EQUIPMENT.filter(e => e.site === 'ICH' && ['PH-101', 'ET-102', 'CVD-201'].includes(e.room));
    const expectedP95 = percentile(population(granted, { ...emptyGlobal, ...context }, '3').map(r => r.cycleMin), 0.95);
    for (const pair of [{ metricId: null, metricVersion: null }, { metricId: 'occupancy', metricVersion: '3' }]) {
      const response = await adapter.menuQuery({ endpoint: cycleKpiEndpoint.id, context: { ...context, ...pair }, params: {} });
      expect(response.outcome).toBe('ok');
      expect((response.data as CycleKpi).p95).toBe(expectedP95);
      expect(response.trust?.metricVersion).toBe('3');
    }
    const v4 = await adapter.menuQuery({ endpoint: cycleKpiEndpoint.id, context: { ...context, metricId: 'cycle_time', metricVersion: '4' }, params: {} });
    expect(v4.trust?.metricVersion).toBe('4');
  });

  it('applies the tail threshold and bin range on the server', () => {
    const rows = [10, 40, 80, 95].map((cycleMin, i) => ({ equipmentId: 'E', room: 'R', recipe: 'r', lotId: 'l', ppid: 'p', anchor: `2026-09-25T0${i}:00:00`, cycleMin, quality: 'unknown' as const }));
    expect(slowExecutions(rows, 'all', null, null, null, { from: '75-90', to: '90+' }).map(r => r.cycleMin)).toEqual([80, 95]);
    expect(slowExecutions(rows, 'p95', 40, 90, null, null).map(r => r.cycleMin)).toEqual([95]);
  });
});
