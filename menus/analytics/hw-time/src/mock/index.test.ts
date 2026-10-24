import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { contextCapabilities, groupId, menuPermission, type ApiResponse, type MenuMeta } from '@ap/contracts';
import { createMockAdapter, getRole, setRole } from '@ap/mock-server';
import { HW_TIME_UNIT, hwTime } from '../endpoints';
import type { HwTimeLevelData, HwTimeTableData, HwTimeTrendData, HwTimeRow } from '../endpoints';
import { hwTimeMock } from './index';

const context = {
  scopeId: 'MEM', from: '2026-09-25T09:00:00', to: '2026-09-26T09:00:00',
  roomNames: ['PHOTO'], condition: null, membershipBasis: null, selection: null, ppid: null, recipeIds: null,
};

const menu: MenuMeta = {
  id: 'hw-time',
  group: groupId('hwTime'),
  label: { ko: 'HW Time', en: 'HW Time' },
  description: { ko: '', en: '' },
  path: '/hw-time',
  permission: menuPermission('analytics:view'),
  requiresScope: true,
  context: contextCapabilities({ time: 'apply', roomNames: 'apply', condition: 'apply', selection: 'apply', ppid: 'apply', recipe: 'apply' }),
  pageType: 'overview',
  features: { export: false, savedView: false, annotate: false, compare: false },
  pageKeys: [],
};

const adapter = createMockAdapter({ endpoints: hwTimeMock, registry: { menus: [menu] } });
const previousRole = getRole();
beforeEach(() => { setRole('engineer'); });
afterEach(() => { setRole(previousRole); });

async function query<T>(endpoint: string, params: Record<string, unknown>): Promise<ApiResponse<T>> {
  return adapter.menuQuery({ endpoint, context, params }) as Promise<ApiResponse<T>>;
}

async function data<T>(endpoint: string, params: Record<string, unknown>): Promise<T> {
  const response = await query<T>(endpoint, params);
  expect(response.outcome).toBe('ok');
  return response.data as T;
}

describe('HW Time mock endpoint registration', () => {
  it('registers the level, trend, table, and export endpoints', () => {
    expect(() => createMockAdapter({ endpoints: hwTimeMock, registry: { menus: [menu] } })).not.toThrow();
    expect(hwTimeMock.map(({ spec }) => spec.id)).toEqual([
      'hwTime.levelRows', 'hwTime.trend', 'hwTime.tableRows', 'hwTime.exportRows',
    ]);
  });
});

describe('HW Time level rows', () => {
  it('returns 24 equipment rows and Module series at L1', async () => {
    const result = await data<HwTimeLevelData>(hwTime.levelRows.id, {});
    expect(result.level).toBe(0);
    expect(result.series.map(({ id }) => id)).toEqual(['PM1', 'PM2', 'PM3', 'PM4']);
    expect(result.rows).toHaveLength(24);
    expect(result.limits.maxRows).toBe(120);
    expect(result.rows.map(({ id }) => id)).toEqual(Array.from({ length: 24 }, (_, i) => `EQ-${String(i + 1).padStart(3, '0')}`));
    expect(result.rows.every(row => row.equipmentId === row.id)).toBe(true);
  });

  it('returns 96 sub-item rows and one auxiliary MEG row per equipment at L2, excluding MEG from totals', async () => {
    const result = await data<HwTimeLevelData>(hwTime.levelRows.id, { drillModule: 'PM1' });
    const auxiliary = result.rows.filter(row => row.auxiliary?.kind === 'MEG');
    const detailRows = result.rows.filter(row => !row.auxiliary);
    expect(result.level).toBe(1);
    expect(result.series.map(({ id }) => id)).toEqual(['Chuck', 'Dechuck', 'Pump', 'Vent', 'Transfer']);
    expect(result.rows).toHaveLength(120);
    expect(detailRows).toHaveLength(96);
    expect(auxiliary).toHaveLength(24);
    expect(auxiliary.every(row => row.id.endsWith('.MEG') && row.total === null)).toBe(true);
    expect(detailRows.map(({ id }) => id)).toEqual(Array.from({ length: 24 }, (_, i) =>
      ['H1', 'H2', 'H3', 'H4'].map(item => `EQ-${String(i + 1).padStart(3, '0')}.${item}`)).flat());
    const expectedChuckTotal = detailRows.reduce((sum, row) => sum + (row.values.Chuck ?? 0), 0);
    expect(result.totals.values.Chuck).toBe(expectedChuckTotal);
    const firstChuck = detailRows[0]?.values.Chuck ?? 0;
    expect(firstChuck * 100).not.toBe(Math.round(firstChuck * 100));
  });

  it('returns context and selected Motion detail in the same L3 response with identical row order', async () => {
    const result = await data<HwTimeLevelData>(hwTime.levelRows.id, { drillModule: 'PM1', drillMotion: 'Pump' });
    expect(result.level).toBe(2);
    expect(result.context?.series.map(({ id }) => id)).toEqual(['Chuck', 'Dechuck', 'Pump', 'Vent', 'Transfer']);
    expect(result.detail?.series.map(({ id }) => id)).toEqual(['Pump']);
    expect(result.context?.rows.map(({ id }) => id)).toEqual(result.detail?.rows.map(({ id }) => id));
    expect(result.context?.rows).toHaveLength(96);
    expect(result.detail?.rows).toHaveLength(96);
  });

  it('keeps missing PM3 values null at L1 and L2', async () => {
    const l1 = await data<HwTimeLevelData>(hwTime.levelRows.id, {});
    const l2 = await data<HwTimeLevelData>(hwTime.levelRows.id, { drillModule: 'PM3' });
    expect(l1.rows.some(row => row.values.PM3 === null)).toBe(true);
    expect(l2.rows.some(row => Object.values(row.values).includes(null))).toBe(true);
    expect(l2.rows.some(row => row.total === null && Object.values(row.values).includes(null))).toBe(true);
  });

  it('keeps PM4 Vent detail empty while its Module context remains available', async () => {
    const result = await data<HwTimeLevelData>(hwTime.levelRows.id, { drillModule: 'PM4', drillMotion: 'Vent' });
    expect(result.context?.rows).toHaveLength(96);
    expect(result.detail?.rows).toEqual([]);
  });
});

describe('HW Time trends and table endpoints', () => {
  it('returns eight daily points whose values differ for adjacent rows', async () => {
    const result = await data<HwTimeTrendData>(hwTime.trend.id, { rowIds: ['EQ-001.H1', 'EQ-001.H2'] });
    expect(result.rows).toHaveLength(2);
    expect(result.limits.maxRows).toBe(8);
    expect(result.rows.map(({ id }) => id)).toEqual(['EQ-001.H1', 'EQ-001.H2']);
    expect(result.rows[0]?.points).toHaveLength(8);
    expect(result.rows[0]?.points.map(point => point.at)).toEqual([
      '2026-09-18', '2026-09-19', '2026-09-20', '2026-09-21',
      '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25',
    ]);
    expect(result.rows[0]?.points.map(point => point.value)).not.toEqual(result.rows[1]?.points.map(point => point.value));
    expect(result.rows[0]?.points.every((point, i) => point.value !== result.rows[1]?.points[i]?.value)).toBe(true);
  });

  it('rejects more than eight trend rows and ids outside the static row format', async () => {
    const tooMany = await query(hwTime.trend.id, { rowIds: Array.from({ length: 9 }, (_, i) => `EQ-${String(i + 1).padStart(3, '0')}.H1`) });
    const malformed = await query(hwTime.trend.id, { rowIds: ['EQ-1.H1'] });
    expect(tooMany.outcome).toBe('error');
    expect(malformed.outcome).toBe('error');
  });

  it('pages L3-style table rows on the server and exports the selected rows', async () => {
    const params = { drillModule: 'PM1', drillMotion: 'Pump', pageSize: 10, sorting: [] };
    const page0 = await data<HwTimeTableData>(hwTime.tableRows.id, { ...params, page: 0 });
    const page1 = await data<HwTimeTableData>(hwTime.tableRows.id, { ...params, page: 1 });
    expect(page0.total).toBe(96);
    expect(page0.rows).toHaveLength(10);
    expect(page1.rows).toHaveLength(10);
    expect(page0.rows.map(({ id }) => id)).not.toEqual(page1.rows.map(({ id }) => id));

    const ids = page0.rows.slice(0, 2).map(({ id }) => id);
    const exported = await data<HwTimeRow[]>(hwTime.exportRows.id, {
      drillModule: 'PM1', drillMotion: 'Pump', ids, sorting: [],
    });
    expect(exported.map(({ id }) => id)).toEqual(ids);
  });

  it('declares response row caps', () => {
    expect(HW_TIME_UNIT).toEqual({ ko: '초', en: 's' });
    expect(hwTime.levelRows.limits?.maxRows).toBeUndefined();
    expect(hwTime.trend.limits?.maxRows).toBeUndefined();
    expect(hwTime.tableRows.limits?.maxRows).toBeUndefined();
    expect(hwTime.exportRows.limits?.maxRows).toBe(96);
  });
});
