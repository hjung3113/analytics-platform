import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Capability, ContextKey, MenuMeta, PageResult } from '@ap/contracts';
import { createMockAdapter, EQUIPMENT, getRole, setRole, type RoleId } from '@ap/mock-server';
import { equipmentMock } from './index';
import { equipmentListEndpoint, equipmentPageEndpoint, type Equipment } from '../endpoints';

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
const engineerIch = EQUIPMENT.filter(e => e.site === 'ICH' && ['PH-101', 'ET-102', 'CVD-201'].includes(e.room));
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
    const list = await adapter.menuQuery({ endpoint: equipmentListEndpoint.id, context, params: filter });
    const page = await adapter.menuQuery({ endpoint: equipmentPageEndpoint.id, context, params: { ...filter, page: 0, pageSize: 500, sorting: [] } });
    const expected = engineerIch.filter(e => e.maker === maker).map(e => e.equipmentId).sort();
    expect((list.data as Equipment[]).map(e => e.equipmentId).sort()).toEqual(expected);
    expect((page.data as PageResult<Equipment>).total).toBe(expected.length);
  });

  it('re-checks equipment:view per request, so a viewer cannot export', async () => {
    setRole('viewer');
    const response = await adapter.menuQuery({ endpoint: equipmentListEndpoint.id, context, params: noFilter });
    expect(response.outcome).toBe('forbidden');
  });

  it('rejects a time key the manifest only references', async () => {
    const response = await adapter.menuQuery({ endpoint: equipmentListEndpoint.id, context: { ...context, from: '2026-09-25T09:00:00' }, params: noFilter });
    expect(response.outcome).toBe('error');
    expect(response.message).toContain('from');
  });
});
