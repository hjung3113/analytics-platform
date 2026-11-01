import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMockAdapter, EQUIPMENT, getRole, setRole, type RoleId } from '@ap/mock-server';
import { equipmentMock } from './index';
import { equipmentMakersEndpoint, equipmentPageEndpoint, equipmentExportEndpoint, type Equipment } from '../endpoints';
import { contextCapabilities, groupId, menuPermission, type GroupedPageResult, type MenuMeta, type PageResult } from '@ap/contracts';

const none = contextCapabilities();

/**
 * Inline mirror of the equipment-master manifest in '../index.ts' (permission, requiresScope, context).
 * Importing '../index' from 'src/mock/**' is lint-banned. manifest를 바꾸면 여기도 같이 바꾼다.
 */
const masterMenu: MenuMeta = {
  id: 'equipment-master',
  group: groupId('equipment'),
  label: { ko: '설비 마스터', en: 'Equipment master' },
  description: { ko: '', en: '' },
  path: '/equipment',
  permission: menuPermission('equipment:view'),
  requiresScope: true,
  context: { ...none, time: 'reference', roomNames: 'apply', condition: 'apply', selection: 'apply' },
  pageType: 'management',
  features: { export: true, savedView: false, annotate: false, compare: false },
  pageKeys: ['q', 'filter', 'status', 'maker', 'focus', 'sort', 'page', 'tab'],
  repeatedPageKeys: ['filter'],
  hiddenPageKeys: ['filter'],
};

const adapter = createMockAdapter({ endpoints: [...equipmentMock], registry: { menus: [masterMenu] } });
const context = { scopeId: 'MEM', roomNames: null, condition: null, membershipBasis: null, selection: null };
const engineerMem = EQUIPMENT.filter(e => e.site === 'MEM' && ['PHOTO', 'ETCH', 'CVD'].includes(e.room));
const noFilter = { q: '' };

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
    const expected = engineerMem.map(e => e.equipmentId).sort().reverse();
    expect(data.total).toBe(engineerMem.length);
    expect(data.rows.map(e => e.equipmentId)).toEqual(expected.slice(5, 10));
  });

  it('applies 상태 and Maker conditions on the server for both the page and the export list (ADR-0105)', async () => {
    const maker = engineerMem[0].maker;
    const filter = { ...noFilter, filters: [{ id: 'maker', op: 'in' as const, value: [maker] }] };
    const page = await adapter.menuQuery({ endpoint: equipmentPageEndpoint.id, context, params: { ...filter, page: 0, pageSize: 500, sorting: [] } });
    const exportAll = await adapter.menuQuery({ endpoint: equipmentExportEndpoint.id, context, params: { ...filter, ids: null, sorting: [] } });
    const expected = engineerMem.filter(e => e.maker === maker).map(e => e.equipmentId).sort();
    expect((page.data as PageResult<Equipment>).total).toBe(expected.length);
    expect(((exportAll.data as Equipment[]).map(e => e.equipmentId)).sort()).toEqual(expected);
  });

  it('applies column filters on the server: the page total and the export list are the filtered set (#556b)', async () => {
    const lineIn = { id: 'line', op: 'in' as const, value: ['L2'] };
    const page = await adapter.menuQuery({ endpoint: equipmentPageEndpoint.id, context, params: { ...noFilter, page: 0, pageSize: 500, sorting: [], filters: [lineIn] } });
    const exportAll = await adapter.menuQuery({ endpoint: equipmentExportEndpoint.id, context, params: { ...noFilter, ids: null, sorting: [], filters: [lineIn] } });
    const expected = engineerMem.filter(e => e.line === 'L2').map(e => e.equipmentId).sort();
    expect(expected.length).toBeGreaterThan(0);
    expect(expected.length).toBeLessThan(engineerMem.length);
    expect((page.data as PageResult<Equipment>).total).toBe(expected.length);
    expect(((page.data as PageResult<Equipment>).rows.map(e => e.equipmentId)).sort()).toEqual(expected);
    expect(((exportAll.data as Equipment[]).map(e => e.equipmentId)).sort()).toEqual(expected);
  });

  it('groups on the server: rows ordered by group, groups describe the whole filtered set, page slice limits them (#556d)', async () => {
    const all = await adapter.menuQuery({ endpoint: equipmentPageEndpoint.id, context, params: { ...noFilter, page: 0, pageSize: 25, sorting: [], groupBy: 'line' } });
    const data = all.data as GroupedPageResult<Equipment>;
    expect(data.total).toBe(engineerMem.length);
    const lines = data.rows.map(e => e.line);
    expect(lines).toEqual([...lines].sort());
    for (const g of data.groups!) expect(g.count).toBe(engineerMem.filter(e => e.line === g.key).length);
    expect(data.groups!.every(g => g.subtotals === undefined)).toBe(true); // no additive column: count only
    const flat = await adapter.menuQuery({ endpoint: equipmentPageEndpoint.id, context, params: { ...noFilter, page: 0, pageSize: 25, sorting: [] } });
    expect(flat.data).not.toHaveProperty('groups');
  });

  it('answers the Maker select from a small distinct-makers endpoint within the granted Scope (#173 P2-4)', async () => {
    const all = await adapter.menuQuery({ endpoint: equipmentMakersEndpoint.id, context, params: {} });
    expect(all.outcome).toBe('ok');
    // Same options the screen offered when it read the full list: the page filters do not narrow them.
    expect(all.data).toEqual([...new Set(engineerMem.map(e => e.maker))].sort());
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

describe('equipment-master undeclared filter rejection (ADR-0105, P11)', () => {
  const rejected = [
    ['an undeclared field', { id: 'room', op: 'in' as const, value: ['PHOTO'] }],
    ['an operator outside the field ops', { id: 'model', op: 'endsWith' as const, value: 'X' }],
    ['an enum with a text operator', { id: 'status', op: 'contains' as const, value: 'act' }],
    ['a malformed value', { id: 'validFrom', op: 'before' as const, value: 'yesterday' }],
  ] as const;

  it.each(rejected)('answers error for %s on the page and the export endpoint', async (_name, filter) => {
    const page = await adapter.menuQuery({ endpoint: equipmentPageEndpoint.id, context, params: { ...noFilter, page: 0, pageSize: 25, sorting: [], filters: [filter] } });
    const exported = await adapter.menuQuery({ endpoint: equipmentExportEndpoint.id, context, params: { ...noFilter, ids: null, sorting: [], filters: [filter] } });
    expect(page.outcome).toBe('error');
    expect(page.message).toContain(filter.id);
    expect(exported.outcome).toBe('error');
  });

  it('rejects the retired status/maker params as unknown keys', async () => {
    const response = await adapter.menuQuery({ endpoint: equipmentPageEndpoint.id, context, params: { ...noFilter, status: 'active', page: 0, pageSize: 25, sorting: [] } });
    expect(response.outcome).toBe('error');
    expect(response.message).toContain('status');
  });

  it('applies a 상태 in-condition together with a column condition (AND across fields)', async () => {
    const filters = [{ id: 'status', op: 'in' as const, value: ['active', 'idle'] }, { id: 'line', op: 'notIn' as const, value: ['L1'] }];
    const response = await adapter.menuQuery({ endpoint: equipmentPageEndpoint.id, context, params: { ...noFilter, page: 0, pageSize: 500, sorting: [], filters } });
    const expected = engineerMem.filter(e => ['active', 'idle'].includes(e.status) && e.line !== 'L1').map(e => e.equipmentId).sort();
    expect(expected.length).toBeGreaterThan(0);
    expect(((response.data as PageResult<Equipment>).rows.map(e => e.equipmentId)).sort()).toEqual(expected);
  });
});

describe('equipment-master export endpoint (#173)', () => {
  it('declares the row cap the page endpoint cannot: pages declare no maxRows, export judges the whole result', () => {
    expect(equipmentPageEndpoint.limits).toBeUndefined();
    expect(equipmentExportEndpoint.limits).toEqual({ maxRows: 50_000 });
  });

  it('returns every filtered row for ids: null and re-applies the conditions', async () => {
    const maker = engineerMem[0].maker;
    const response = await adapter.menuQuery({ endpoint: equipmentExportEndpoint.id, context, params: { q: '', filters: [{ id: 'maker', op: 'in', value: [maker] }], ids: null, sorting: [] } });
    expect(response.outcome).toBe('ok');
    const expected = engineerMem.filter(e => e.maker === maker).map(e => e.equipmentId).sort();
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
    const unsorted = [engineerMem[5], engineerMem[0], engineerMem[2]].map(e => e.equipmentId);
    const response = await adapter.menuQuery({ endpoint: equipmentExportEndpoint.id, context, params: { ...noFilter, ids: unsorted, sorting } });
    expect((response.data as Equipment[]).map(e => e.equipmentId)).toEqual([...unsorted].sort());
  });

  it('excludedIds returns the filtered set minus the exclusions without an id list (#556c)', async () => {
    const all = await adapter.menuQuery({ endpoint: equipmentExportEndpoint.id, context, params: { ...noFilter, ids: null, sorting: [] } });
    const allIds = (all.data as Equipment[]).map(e => e.equipmentId);
    const excludedIds = allIds.slice(0, 2);
    const response = await adapter.menuQuery({ endpoint: equipmentExportEndpoint.id, context, params: { ...noFilter, ids: null, excludedIds, sorting: [] } });
    expect((response.data as Equipment[]).map(e => e.equipmentId)).toEqual(allIds.slice(2));
  });

  it('filters by the selection ids server-side, so the cap is judged on the selection', async () => {
    const ids = engineerMem.slice(0, 3).map(e => e.equipmentId);
    const response = await adapter.menuQuery({ endpoint: equipmentExportEndpoint.id, context, params: { ...noFilter, ids, sorting: [] } });
    expect((response.data as Equipment[]).map(e => e.equipmentId).sort()).toEqual([...ids].sort());
  });

  it('re-checks equipment:view per export request', async () => {
    setRole('viewer');
    const response = await adapter.menuQuery({ endpoint: equipmentExportEndpoint.id, context, params: { ...noFilter, ids: null, sorting: [] } });
    expect(response.outcome).toBe('forbidden');
  });
});
