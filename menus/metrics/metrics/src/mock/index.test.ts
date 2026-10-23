import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMockAdapter, getRole, setRole, USERS, type RoleId } from '@ap/mock-server';
import { metricsAuditEvents, metricsMock } from './index';
import { METRICS } from './catalog';
import {
  catalogExportEndpoint, catalogListEndpoint, catalogPageEndpoint, definitionEndpoint, metricPairEndpoint,
  type CatalogList, type CatalogRow, type DefinitionPayload, type PairVerdict,
} from '../endpoints';
import { groupId, menuPermission, type Capability, type ContextKey, type MenuMeta, type PageResult } from '@ap/contracts';

const none: Record<ContextKey, Capability> = {
  time: 'unsupported', roomNames: 'unsupported', line: 'unsupported', prcGroup: 'unsupported', condition: 'unsupported', selection: 'unsupported',
  lot: 'unsupported', ppid: 'unsupported', recipe: 'unsupported', metric: 'unsupported',
};
/** Inline mirrors of the metric-catalog and metric-detail manifests in '../index.ts'. 바꾸면 같이 바꾼다. */
const base = {
  group: groupId('metrics'), description: { ko: '', en: '' }, permission: menuPermission('metrics:view'), requiresScope: false, pageType: 'catalog' as const,
  context: { ...none, metric: 'apply' as const, selection: 'reference' as const }, features: { export: true, savedView: false, annotate: false, compare: false },
};
const catalogMenu: MenuMeta = { ...base, id: 'metric-catalog', label: { ko: '지표 카탈로그', en: 'Metric catalog' }, path: '/metrics', pageKeys: ['q', 'status', 'domain', 'sort', 'page'] };
const detailMenu: MenuMeta = { ...base, id: 'metric-detail', label: { ko: '지표 상세', en: 'Metric detail' }, path: '/metrics/:metricId', pageKeys: ['tab', 'version', 'returnTo'] };

const registry = { menus: [catalogMenu, detailMenu] };
const adapter = createMockAdapter({ endpoints: [...metricsMock], registry });
const pair = (metricId: string | null, metricVersion: string | null, viewedId: string | null = null, pageVersion: string | null = null) =>
  adapter.menuQuery({ endpoint: metricPairEndpoint.id, context: { metricId, metricVersion }, params: { viewedId, pageVersion } });

const previousRole: RoleId = getRole();
beforeEach(() => { setRole('viewer'); });
afterEach(() => { setRole(previousRole); });

describe('metric endpoints', () => {
  it('registers against the metric-catalog and metric-detail manifests', () => {
    expect(() => createMockAdapter({ endpoints: [...metricsMock], registry })).not.toThrow();
  });

  it('judges the global metric pair on the server (06 §6.1): member, non-member, unknown, conflict', async () => {
    expect(((await pair('cycle_time', '4')).data as PairVerdict).kind).toBe('valid');
    expect(((await pair('cycle_time', '999')).data as PairVerdict).kind).toBe('version-not-member');
    expect(((await pair('no_such_metric', '1')).data as PairVerdict).kind).toBe('unknown-metric');
    expect(((await pair('cycle_time', '4', 'cycle_time', '3')).data as PairVerdict).kind).toBe('conflict');
    expect((await pair('cycle_time', '4')).trust?.metricVersion).toBe('4');
  });

  it('pages and filters the catalog on the server; the export list carries the same filter verdict', async () => {
    const filter = { q: null, status: 'published', domain: null, lang: 'ko' as const };
    const list = (await adapter.menuQuery({ endpoint: catalogListEndpoint.id, context: {}, params: filter })).data as CatalogList;
    const expected = METRICS.filter(m => m.catalogStatus === 'published').map(m => m.metricId);
    expect(list.rows.map(r => r.metricId)).toEqual(expected);
    const page = (await adapter.menuQuery({ endpoint: catalogPageEndpoint.id, context: {}, params: { ...filter, page: 0, pageSize: 3, sorting: [{ id: 'metricId', desc: false }] } })).data as PageResult<CatalogRow>;
    expect(page.total).toBe(expected.length);
    expect(page.rows.map(r => r.metricId)).toEqual([...expected].sort().slice(0, 3));
    const illegal = (await adapter.menuQuery({ endpoint: catalogListEndpoint.id, context: {}, params: { ...filter, status: 'bogus' } })).data as CatalogList;
    expect(illegal).toEqual({ rows: [], filterProblem: 'status' });
  });

  it('answers a definition by metric and version, and flags a version that is not a member', async () => {
    const ok = (await adapter.menuQuery({ endpoint: definitionEndpoint.id, context: {}, params: { metricId: 'cycle_time', version: '4' } })).data as DefinitionPayload;
    expect(ok.problem).toBeNull();
    expect(ok.version?.version).toBe('4');
    const bad = (await adapter.menuQuery({ endpoint: definitionEndpoint.id, context: {}, params: { metricId: 'cycle_time', version: '999' } })).data as DefinitionPayload;
    expect(bad.problem).toBe('version-not-member');
  });

  it('re-checks metrics:view per request, so the export list is forbidden without it', async () => {
    const params = { q: null, status: null, domain: null, lang: 'en' as const };
    expect((await adapter.menuQuery({ endpoint: catalogListEndpoint.id, context: {}, params })).outcome).toBe('ok');
    const permissions = [...USERS.viewer.permissions];
    USERS.viewer.permissions = permissions.filter(p => p !== 'metrics:view');
    try {
      expect((await adapter.menuQuery({ endpoint: catalogListEndpoint.id, context: {}, params })).outcome).toBe('forbidden');
    } finally {
      USERS.viewer.permissions = permissions;
    }
  });
});

describe('metric catalog export endpoint (#173)', () => {
  it('returns a row array (not CatalogList) and declares the row cap the list endpoint cannot', () => {
    expect(catalogListEndpoint.limits).toBeUndefined();
    expect(catalogExportEndpoint.limits).toEqual({ maxRows: 50_000 });
  });

  it('answers the filtered rows for ids: null with the same filter verdict as the list', async () => {
    const filter = { q: null, status: 'published', domain: null, lang: 'ko' as const };
    const exported = await adapter.menuQuery({ endpoint: catalogExportEndpoint.id, context: {}, params: { ...filter, ids: null, sorting: [] } });
    expect(exported.outcome).toBe('ok');
    const expected = METRICS.filter(m => m.catalogStatus === 'published').map(m => m.metricId);
    expect((exported.data as CatalogRow[]).map(r => r.metricId)).toEqual(expected);
  });

  it('exports in the table’s sort, so a sorted set comes out in page order (#173 UX P2-6)', async () => {
    const sorting = [{ id: 'metricId', desc: true }];
    const filter = { q: null, status: null, domain: null, lang: 'ko' as const };
    const exported = await adapter.menuQuery({ endpoint: catalogExportEndpoint.id, context: {}, params: { ...filter, ids: null, sorting } });
    const page = await adapter.menuQuery({ endpoint: catalogPageEndpoint.id, context: {}, params: { ...filter, page: 0, pageSize: 500, sorting } });
    const exportIds = (exported.data as CatalogRow[]).map(r => r.metricId);
    expect(exportIds).toEqual([...exportIds].sort().reverse());
    expect(exportIds).toEqual((page.data as PageResult<CatalogRow>).rows.map(r => r.metricId));
  });

  it('filters by the selection metric ids server-side, so the cap is judged on the selection', async () => {
    const ids = METRICS.slice(0, 2).map(m => m.metricId);
    const exported = await adapter.menuQuery({ endpoint: catalogExportEndpoint.id, context: {}, params: { q: null, status: null, domain: null, lang: 'ko' as const, ids, sorting: [] } });
    expect((exported.data as CatalogRow[]).map(r => r.metricId).sort()).toEqual([...ids].sort());
  });
});

describe('metric audit seeds (#90, ADR-0048)', () => {
  const seeded = createMockAdapter({ endpoints: [...metricsMock], registry, auditEvents: metricsAuditEvents });

  it('records each version as a draft, plus publish and deprecate when they happened, at the Seoul wall-clock instant in Z', () => {
    const expected = METRICS.flatMap(m => m.versions.flatMap(v => [v.registeredAt, v.publishedAt, v.deprecatedAt].filter((t): t is string => t !== null)));
    expect(metricsAuditEvents).toHaveLength(expected.length);
    expect(new Set(metricsAuditEvents.map(e => e.id)).size).toBe(metricsAuditEvents.length);
    const v = METRICS.find(m => m.metricId === 'cycle_time')!.versions.find(x => x.publishedAt === '2026-09-20T11:00:00')!;
    const published = metricsAuditEvents.find(e => e.id === `cycle_time-v${v.version}-publish`)!;
    expect(published.at).toBe('2026-09-20T02:00:00.000Z');
    for (const event of metricsAuditEvents) {
      expect(event.at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000Z$/);
      expect(event.target).toEqual({ type: 'metric', id: expect.any(String), scopeId: null });
    }
  });

  it('keeps one recorded reason string per event (the Korean original, not a per-language function)', () => {
    const draft = metricsAuditEvents.find(e => e.id === 'cycle_time-v4-draft')!;
    expect(draft.reason).toBe(METRICS.find(m => m.metricId === 'cycle_time')!.versions.find(x => x.version === '4')!.changeReason.ko);
    for (const event of metricsAuditEvents) expect(typeof event.reason).toBe('string');
  });

  it('answers the console log and the destination read from one store: same events, same order', async () => {
    setRole('admin');
    const detail = await seeded.entityAudit({ type: 'metric', id: 'cycle_time', scopeId: null });
    const log = await seeded.auditTrail({ type: 'metric', targetId: 'cycle_time', pageSize: 100 });
    expect(detail.outcome).toBe('ok');
    expect(log.outcome).toBe('ok');
    const ids = (detail.data?.events ?? []).map(e => e.id);
    expect(ids.length).toBe(metricsAuditEvents.filter(e => e.target.id === 'cycle_time').length);
    expect(log.data?.items.map(e => e.id)).toEqual(ids);
  });
});
