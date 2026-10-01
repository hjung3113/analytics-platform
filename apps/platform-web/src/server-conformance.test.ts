/**
 * Server boundary conformance (#145): the adapter-agnostic kit judged against the mock adapter, over every menu
 * endpoint the app registers. The in-house server adapter runs the same harness shape
 * (docs/integration/real-server-checklist.md). Lint lets this file see the menu `/mock` subpaths like main.tsx.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Permission } from '@ap/contracts';
import { analyticsMock } from '@ap/menu-analytics/mock';
import { equipmentMock } from '@ap/menu-equipment/mock';
import { homeMock } from '@ap/menu-home/mock';
import { metricsMock } from '@ap/menu-metrics/mock';
import { noticeVocMock } from '@ap/menu-notice-voc/mock';
import { createMockAdapter, getRole, setRole, USERS, type AnyMockEndpoint, type RoleId } from '@ap/mock-server';
import { describeServerConformance, type ConformanceCase } from '@ap/server-conformance';
import { registry } from './menus';

/** Same list, same order as the `<gen:menu-mock-spreads>` block in main.tsx (checked below). */
const MOCKS: Record<string, readonly AnyMockEndpoint[]> = { analyticsMock, equipmentMock, homeMock, metricsMock, noticeVocMock };
const endpoints = Object.values(MOCKS).flat();

const page = { page: 0, pageSize: 10, sorting: [] };
const slowFilter = { tail: 'p95', granularity: 'hour', bucket: null, bin: null };
/** One request per endpoint that the granted actor (engineer at ICH) runs successfully. Endpoints with no params default to `{}`. */
const PARAMS: Record<string, Record<string, unknown>> = {
  'analytics.productivity.trend': { kpi: 'occupancy', granularity: 'hour' },
  'analytics.productivity.breakdown': { axis: 'room' },
  'analytics.execution.occurrence': { equipmentId: 'ICH-PHOTO-0103', entityType: 'job', anchor: '2026-09-25T10:00:00', metricVersion: '3' },
  'analytics.cycle.trend': { granularity: 'hour' },
  'analytics.cycle.slow': { ...slowFilter, ...page },
  'analytics.cycle.export': slowFilter,
  'equipment.master.list': { q: '', status: '', maker: '' },
  'equipment.master.page': { q: '', status: '', maker: '', ...page },
  'home.notices': { targetScopeId: 'ICH' },
  'metrics.pair': { viewedId: null, pageVersion: null },
  'metrics.catalog.list': { q: null, status: null, domain: null, lang: 'ko' },
  'metrics.catalog.page': { q: null, status: null, domain: null, lang: 'ko', ...page },
  'metrics.definition': { metricId: 'cycle_time', version: '4' },
  'metrics.usage': { metricId: 'cycle_time', version: '4' },
  'metrics.history': { metricId: 'cycle_time', lang: 'ko' },
  'noticeVoc.myVocHistory': { cursor: null },
};

const cases: ConformanceCase[] = endpoints.map(({ spec }) => ({ spec, params: PARAMS[spec.id] ?? {} }));
const GRANTED: RoleId = 'engineer';

describe('conformance harness covers what the app registers', () => {
  it('lists exactly the mocks main.tsx spreads into the adapter', () => {
    // vitest runs each package from its own directory; jsdom's import.meta.url is not a file URL.
    const main = readFileSync(resolve(process.cwd(), 'src/main.tsx'), 'utf8');
    const block = /<gen:menu-mock-spreads>([\s\S]*?)<\/gen:menu-mock-spreads>/.exec(main)?.[1] ?? '';
    expect([...block.matchAll(/\.\.\.(\w+),/g)].map(m => m[1])).toEqual(Object.keys(MOCKS));
  });

  it('gives a sample request to every endpoint that declares params', () => {
    const missing = endpoints.filter(({ spec }) => Object.keys(spec.paramKeys).length > 0 && !(spec.id in PARAMS)).map(({ spec }) => spec.id);
    expect(missing).toEqual([]);
  });
});

describeServerConformance('server boundary conformance — mock adapter', {
  adapter: createMockAdapter({ endpoints, registry }),
  cases,
  context: { scopeId: 'ICH', from: '2026-09-25T09:00:00', to: '2026-09-26T09:00:00' },
  foreignScopeId: 'XIA',
  asGranted: async fn => {
    const previous = getRole();
    setRole(GRANTED);
    try { return await fn(); } finally { setRole(previous); }
  },
  withoutPermission: async (permission: Permission, fn) => {
    const previous = getRole();
    const permissions = USERS[GRANTED].permissions;
    setRole(GRANTED);
    USERS[GRANTED].permissions = permissions.filter(p => p !== permission);
    try { return await fn(); } finally {
      USERS[GRANTED].permissions = permissions;
      setRole(previous);
    }
  },
});
