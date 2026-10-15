import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Capability, ContextKey, MenuMeta, PageResult } from '@ap/contracts';
import { createMockAdapter, EQUIPMENT, getRole, setRole, type RoleId } from '@ap/mock-server';
import { equipmentMock } from './index';
import { equipmentMakersEndpoint, equipmentPageEndpoint, equipmentExportEndpoint, type Equipment } from '../endpoints';

const none: Record<ContextKey, Capability> = {
  time: 'unsupported', roomNames: 'unsupported', condition: 'unsupported', selection: 'unsupported',
  lot: 'unsupported', ppid: 'unsupported', recipe: 'unsupported', metric: 'unsupported',
};

/**
 * Inline mirror of the equipment-master manifest in '../index.ts' (permission, requiresScope, context).
 * Importing '../index' from 'src/mock/**' is lint-banned. manifest를 바꾸면 여기도 같이 바꾼다.
 */
const masterMenu: MenuMeta = {
  id: 'equipment-master',
  group: 'equipment',
  label: { ko: '설비 마스터', en: 'Equipment master' },
  description: { ko: '', en: '' },
  path: '/equipment',
  permission: 'equipment:view',
  requiresScope: true,
  context: { ...none, time: 'reference', roomNames: 'apply', condition: 'apply', selection: 'apply' },
  pageType: 'management',
  features: { export: true, savedView: false, annotate: false, compare: false },
  pageKeys: ['q', 'status', 'maker', 'focus', 'sort', 'page', 'tab'],
};

const adapter = createMockAdapter({ endpoints: [...equipmentMock], registry: { menus: [masterMenu] } });
const context = { scopeId: 'ICH', roomNames: null, condition: null, selection: null };
const engineerIch = EQUIPMENT.filter(e => e.site === 'ICH' && ['PHOTO', 'ETCH', 'CVD'].includes(e.room));
const noFilter = { q: '', status: '', maker: '' };

const previousRole: RoleId = getRole();
beforeEach(() => { setRole('engineer'); });
afterEach(() => { setRole(previousRole); });

describe('equipment-master mock endpoints', () => {
  it('registers against the equipment-master manifest', () => {
    expect(() => createMockAdapter({ endpoints: [...equipmentMock], registry: { menus: [masterMenu] } })).not.toThrow();
  });

  it('pages the granted rows on the server: sorted, sliced, total of the filtered set', async () => {
    const response = await adapter.menuQuery({
      endpoint: equipmentPageEndpoint.id,
      context,
      params: { ...noFilter, page: 1, pageSize: 5, sorting: [{ id: 'equipmentId', desc: true }] },
    });
    expect(response.outcome).toBe('ok');
    const data = response.data as PageResult<Equipment>;
    const expected = engineerIch.map(e => e.equipmentId).sort().reverse();
    expect(data.total).toBe(engineerIch.length);
    expect(data.rows.map(e => e.equipmentId)).toEqual(expected.slice(5, 10));
  });

  it('applies the page filters on the server for both the page and the export list', async () => {
    const maker = engineerIch[0].maker;
    const filter = { q: '', status: '', maker };
    const page = await adapter.menuQuery({ endpoint: equipmentPageEndpoint.id, context, params: { ...filter, page: 0, pageSize: 500, sorting: [] } });
    const exportAll = await adapter.menuQuery({ endpoint: equipmentExportEndpoint.id, context, params: { ...filter, ids: null, sorting: [] } });
    const expected = engineerIch.filter(e => e.maker === maker).map(e => e.equipmentId).sort();
    expect((page.data as PageResult<Equipment>).total).toBe(expected.length);
    expect(((exportAll.data as Equipment[]).map(e => e.equipmentId)).sort()).toEqual(expected);
  });

  it('answers the Maker select from a small distinct-makers endpoint within the granted Scope (#173 P2-4)', async () => {
    const all = await adapter.menuQuery({ endpoint: equipmentMakersEndpoint.id, context, params: {} });
    expect(all.outcome).toBe('ok');
    // Same options the screen offered when it read the full list: the page filters do not narrow them.
    expect(all.data).toEqual([...new Set(engineerIch.map(e => e.maker))].sort());
  });

  it('re-checks equipment:view per request, so a viewer cannot read makers', async () => {
    setRole('viewer');
    const response = await adapter.menuQuery({ endpoint: equipmentMakersEndpoint.id, context, params: {} });
    expect(response.outcome).toBe('forbidden');
  });

  it('rejects a time key the manifest only references', async () => {
    const response = await adapter.menuQuery({ endpoint: equipmentMakersEndpoint.id, context: { ...context, from: '2026-09-25T09:00:00' }, params: {} });
    expect(response.outcome).toBe('error');
    expect(response.message).toContain('from');
  });
});

describe('equipment-master export endpoint (#173)', () => {
  it('declares the row cap the page endpoint cannot: pages declare no maxRows, export judges the whole result', () => {
    expect(equipmentPageEndpoint.limits).toBeUndefined();
    expect(equipmentExportEndpoint.limits).toEqual({ maxRows: 50_000 });
  });

  it('returns every filtered row for ids: null and re-applies the page filters', async () => {
    const maker = engineerIch[0].maker;
    const response = await adapter.menuQuery({ endpoint: equipmentExportEndpoint.id, context, params: { q: '', status: '', maker, ids: null, sorting: [] } });
    expect(response.outcome).toBe('ok');
    const expected = engineerIch.filter(e => e.maker === maker).map(e => e.equipmentId).sort();
    expect((response.data as Equipment[]).map(e => e.equipmentId).sort()).toEqual(expected);
  });

  it('exports in the table’s sort: a sorted multi-page set comes out in page order (#173 UX P2-6)', async () => {
    const sorting = [{ id: 'equipmentId', desc: true }];
    const exportAll = await adapter.menuQuery({ endpoint: equipmentExportEndpoint.id, context, params: { ...noFilter, ids: null, sorting } });
    const first = await adapter.menuQuery({ endpoint: equipmentPageEndpoint.id, context, params: { ...noFilter, page: 0, pageSize: 20, sorting } });
    const total = (first.data as PageResult<Equipment>).total;
    expect(total).toBeGreaterThan(20); // the set really spans several pages
    const paged: string[] = (first.data as PageResult<Equipment>).rows.map(e => e.equipmentId);
    for (let page = 1; page < Math.ceil(total / 20); page++) {
      const response = await adapter.menuQuery({ endpoint: equipmentPageEndpoint.id, context, params: { ...noFilter, page, pageSize: 20, sorting } });
      paged.push(...(response.data as PageResult<Equipment>).rows.map(e => e.equipmentId));
    }
    expect((exportAll.data as Equipment[]).map(e => e.equipmentId)).toEqual(paged);
  });

  it('exports selected rows in the sorted order, not the selection order', async () => {
    const sorting = [{ id: 'equipmentId', desc: false }];
    const unsorted = [engineerIch[5], engineerIch[0], engineerIch[2]].map(e => e.equipmentId);
    const response = await adapter.menuQuery({ endpoint: equipmentExportEndpoint.id, context, params: { ...noFilter, ids: unsorted, sorting } });
    expect((response.data as Equipment[]).map(e => e.equipmentId)).toEqual([...unsorted].sort());
  });

  it('filters by the selection ids server-side, so the cap is judged on the selection', async () => {
    const ids = engineerIch.slice(0, 3).map(e => e.equipmentId);
    const response = await adapter.menuQuery({ endpoint: equipmentExportEndpoint.id, context, params: { ...noFilter, ids, sorting: [] } });
    expect((response.data as Equipment[]).map(e => e.equipmentId).sort()).toEqual([...ids].sort());
  });

  it('re-checks equipment:view per export request', async () => {
    setRole('viewer');
    const response = await adapter.menuQuery({ endpoint: equipmentExportEndpoint.id, context, params: { ...noFilter, ids: null, sorting: [] } });
    expect(response.outcome).toBe('forbidden');
  });
});
