import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ApiResponse, Capability, ContextKey, MenuMeta } from '@ap/contracts';
import { createMockAdapter, getRole, setRole, type AnyMockEndpoint } from '@ap/mock-server';
import { analyticsMock } from './index';
import {
  METRIC_VERSIONS, attentionEndpoint, breakdownEndpoint, kpisEndpoint, trendEndpoint,
  type AttentionRow, type BreakdownRow, type KpisData, type TrendData,
} from '../endpoints';

/**
 * Minimal inline MenuMeta mirroring the `productivity-overview` manifest in `src/index.ts`
 * (context, permission, requiresScope). Importing `../index` from `src/mock/**` is lint-banned,
 * so the test restates the registration-relevant fields the adapter validates against.
 * manifest(`menus/analytics/src/index.ts`)를 바꾸면 여기도 같이 바꾼다.
 */
const none: Record<ContextKey, Capability> = {
  time: 'unsupported', roomNames: 'unsupported', condition: 'unsupported', selection: 'unsupported',
  lot: 'unsupported', ppid: 'unsupported', recipe: 'unsupported', metric: 'unsupported',
};
const productivityMenu: MenuMeta = {
  id: 'productivity-overview',
  group: 'analytics',
  label: { ko: '생산성 개요', en: 'Productivity overview' },
  description: { ko: '', en: '' },
  path: '/analytics/productivity',
  permission: 'analytics:view',
  requiresScope: true,
  context: { ...none, time: 'apply', roomNames: 'apply', condition: 'apply', selection: 'apply', ppid: 'apply', recipe: 'apply', metric: 'reference' },
  pageType: 'overview',
  features: { export: true, savedView: false, annotate: false, compare: false },
  pageKeys: ['granularity', 'kpi', 'axis', 'sort'],
};

/** Inline mirror for the second endpoint owner registered by analyticsMock (#115). */
const executionMenu: MenuMeta = {
  id: 'execution-detail',
  group: 'analytics',
  label: { ko: '실행 상세', en: 'Execution detail' },
  description: { ko: '', en: '' },
  path: '/analytics/executions/:equipmentId',
  permission: 'analytics:view',
  requiresScope: true,
  context: {
    ...none,
    time: 'reference', roomNames: 'reference', condition: 'reference', selection: 'reference',
    lot: 'reference', ppid: 'reference', recipe: 'reference', metric: 'reference',
  },
  pageType: 'analysis',
  features: { export: false, savedView: false, annotate: false, compare: false },
  pageKeys: ['entityType', 'anchor', 'returnTo'],
};

/** Inline mirror for the third endpoint owner registered by analyticsMock (#127). */
const cycleMenu: MenuMeta = {
  id: 'cycle-time',
  group: 'analytics',
  label: { ko: '사이클타임 상세', en: 'Cycle time detail' },
  description: { ko: '', en: '' },
  path: '/analytics/cycle-time',
  permission: 'analytics:view',
  requiresScope: true,
  context: { ...none, time: 'apply', roomNames: 'apply', condition: 'apply', selection: 'apply', lot: 'apply', ppid: 'apply', recipe: 'apply', metric: 'apply' },
  pageType: 'analysis',
  features: { export: true, savedView: false, annotate: true, compare: true },
  pageKeys: ['granularity', 'percentile', 'sort', 'page', 'bucket', 'bin'],
};

const registry = { menus: [productivityMenu, executionMenu, cycleMenu] };
const adapter = createMockAdapter({ endpoints: analyticsMock, registry });

const FROM = '2026-09-25T09:00:00';
const TO = '2026-09-26T09:00:00';
/** All applied keys, like projectContext sends: scope, period, and the current filters. */
const context = {
  scopeId: 'ICH', from: FROM, to: TO, roomNames: ['PH-101'],
  condition: null, selection: null, ppid: null, recipeIds: null,
};

const previousRole = getRole();
beforeEach(() => { setRole('engineer'); });
afterEach(() => { setRole(previousRole); });

describe('productivity-overview endpoint registration', () => {
  it('registers the analytics endpoint list without error', () => {
    expect(() => createMockAdapter({ endpoints: analyticsMock, registry })).not.toThrow();
    expect(analyticsMock.map((endpoint: AnyMockEndpoint) => endpoint.spec.id)).toEqual([
      'analytics.productivity.kpis',
      'analytics.productivity.trend',
      'analytics.productivity.breakdown',
      'analytics.productivity.attention',
      'analytics.execution.occurrence',
      'analytics.cycle.kpi',
      'analytics.cycle.trend',
      'analytics.cycle.dist',
      'analytics.cycle.slow',
      'analytics.cycle.export',
    ]);
  });
});

describe('productivity-overview endpoint smoke', () => {
  it.each([
    {
      name: 'kpis',
      spec: kpisEndpoint,
      params: {},
      /** Pinned against the spec AND the response so dropping a kind from the declaration fails here. */
      kinds: ['collection', 'processing_delay', 'coverage', 'time_domain'],
      metricVersion: `occupancy v${METRIC_VERSIONS.occupancy} · dwell v${METRIC_VERSIONS.dwell} · cycleTime v${METRIC_VERSIONS.cycleTime} · throughput v${METRIC_VERSIONS.throughput}`,
      hasData: (result: ApiResponse<unknown>) => {
        const data = result.data as KpisData;
        expect(data.current.equipmentCount).toBeGreaterThan(0);
        expect(data.current.knownBuckets).toBeGreaterThan(0);
        expect(data.previous).not.toBeNull();
      },
    },
    {
      name: 'trend',
      spec: trendEndpoint,
      params: { kpi: 'throughput', granularity: 'hour' },
      kinds: ['collection', 'processing_delay', 'coverage'],
      metricVersion: METRIC_VERSIONS.throughput,
      hasData: (result: ApiResponse<unknown>) => {
        const data = result.data as TrendData;
        expect(data.current.length).toBeGreaterThan(0);
        expect(data.previous.length).toBeGreaterThan(0);
      },
    },
    {
      name: 'breakdown',
      spec: breakdownEndpoint,
      params: { axis: 'room' },
      kinds: ['collection', 'processing_delay', 'coverage'],
      metricVersion: METRIC_VERSIONS.occupancy,
      hasData: (result: ApiResponse<unknown>) => {
        expect((result.data as BreakdownRow[]).length).toBeGreaterThan(0);
      },
    },
    {
      name: 'attention',
      spec: attentionEndpoint,
      params: {},
      kinds: ['collection', 'processing_delay', 'coverage'],
      metricVersion: `dwell v${METRIC_VERSIONS.dwell} · cycleTime v${METRIC_VERSIONS.cycleTime}`,
      hasData: (result: ApiResponse<unknown>) => {
        expect((result.data as AttentionRow[]).length).toBeGreaterThan(0);
      },
    },
  ])('$name returns ok with the pinned kinds and metricVersion', async ({ spec, params, kinds, metricVersion, hasData }) => {
    const result = await adapter.menuQuery({ endpoint: spec.id, context, params });
    expect(result.outcome).toBe('ok');
    expect(result.assessments.map(({ kind }) => kind)).toEqual(kinds);
    expect(spec.kinds).toEqual(kinds);
    expect(result.trust?.metricVersion).toBe(metricVersion);
    expect(result.correlationId).toMatch(/^corr-/);
    hasData(result);
  });

  it('rejects a period wider than the declared maxHours as too_large', async () => {
    // 2026-06-01T00:00:00 → 2026-09-26T09:00:00 is 2817h > 2160h (MAX_QUERY_HOURS in endpoints.ts).
    const wide = { ...context, from: '2026-06-01T00:00:00', to: '2026-09-26T09:00:00' };
    const result = await adapter.menuQuery({ endpoint: kpisEndpoint.id, context: wide, params: {} });
    expect(result.outcome).toBe('too_large');
  });

  it('resolves the trend metricVersion from the requested kpi', async () => {
    for (const [kpi, version] of [['cycleTime', '4'], ['occupancy', '3']] as const) {
      const result = await adapter.menuQuery({ endpoint: trendEndpoint.id, context, params: { kpi, granularity: 'hour' } });
      expect(result.outcome).toBe('ok');
      expect(result.trust?.metricVersion).toBe(version);
    }
  });
});
