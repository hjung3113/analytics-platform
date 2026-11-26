import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { contextCapabilities, groupId, menuPermission, type ApiResponse, type MenuMeta } from '@ap/contracts';
import { EQUIPMENT, createMockAdapter, getRole, setRole } from '@ap/mock-server';
import { HW_TIME_UNIT, hwTime, hwTimeOverview } from '../endpoints';
import type { HwTimeDistribution, HwTimeLevelData, HwTimeMatrix, HwTimeRuns, HwTimeTableData, HwTimeTrendData, HwTimeRow } from '../endpoints';
import { hwTimeMock } from './index';

const context = {
  scopeId: 'MEM', from: '2026-09-25T09:00:00', to: '2026-09-26T09:00:00',
  roomNames: ['PHOTO', 'ETCH', 'CVD'], prcGroups: null, condition: null, membershipBasis: null, selection: null,
};

const menu: MenuMeta = {
  id: 'hw-time',
  group: groupId('hwTime'),
  label: { ko: 'HW Time', en: 'HW Time' },
  description: { ko: '', en: '' },
  path: '/hw-time',
  permission: menuPermission('analytics:view'),
  requiresScope: true,
  context: contextCapabilities({ time: 'apply', roomNames: 'apply', prcGroup: 'apply', condition: 'apply', selection: 'apply', ppid: 'unsupported', recipe: 'unsupported' }),
  pageType: 'analysis',
  features: { export: false, savedView: false, annotate: false, compare: false },
  pageKeys: [],
};

const adapter = createMockAdapter({ endpoints: hwTimeMock, registry: { menus: [menu] } });
const previousRole = getRole();
beforeEach(() => { setRole('engineer'); });
afterEach(() => { setRole(previousRole); });

async function query<T>(endpoint: string, params: Record<string, unknown>, applied: Record<string, unknown> = {}): Promise<ApiResponse<T>> {
  return adapter.menuQuery({ endpoint, context: { ...context, ...applied }, params }) as Promise<ApiResponse<T>>;
}

async function data<T>(endpoint: string, params: Record<string, unknown>, applied: Record<string, unknown> = {}): Promise<T> {
  const response = await query<T>(endpoint, params, applied);
  expect(response.outcome).toBe('ok');
  return response.data as T;
}

describe('HW Time mock endpoint registration', () => {
  it('registers the level, trend, table, export and overview endpoints', () => {
    expect(() => createMockAdapter({ endpoints: hwTimeMock, registry: { menus: [menu] } })).not.toThrow();
    expect(hwTimeMock.map(({ spec }) => spec.id)).toEqual([
      'hwTime.levelRows', 'hwTime.trend', 'hwTime.tableRows', 'hwTime.exportRows', 'hwTime.matrix', 'hwTime.motionStats', 'hwTime.runs', 'hwTime.distribution',
      'hwTime.equipmentDays', 'hwTime.boundHistory',
    ]);
  });
});

describe('distribution Context filtering', () => {
  it.each([
    [{ roomNames: ['PHOTO'] }, 10],
    [{ selection: EQUIPMENT.filter(e => e.site === 'MEM' && e.room === 'PHOTO').slice(0, 2).map(e => e.equipmentId) }, 2],
    [{ condition: { maker: ['EBR'] } }, 0],
  ] as const)('uses the same resolved population as runs for %j', async (applied, equipment) => {
    const params = { moduleType: 'LK', drillModule: 'LK1', drillMotion: 'Pump' };
    const result = await query<HwTimeDistribution>('hwTime.distribution', params, applied);
    const runs = await query<{ total: number; bounds: unknown[] }>('hwTime.runs', params, applied);
    expect(result.outcome).toBe(runs.outcome);
    expect(result.data).not.toBeNull();
    expect(result.data!.total).toBe(runs.data!.total);
    expect(result.data!.equipment).toBe(runs.data!.bounds.length);
    expect(result.data!.equipment).toBe(equipment);
    expect(result.data!.total).toBe(equipment * 24);
    expect(result.data!.bins.reduce((sum, bin) => sum + bin.count, 0)).toBe(result.data!.total);
  });
});

describe('HW Time level rows', () => {
  it('returns 24 equipment rows and Module series at L1', async () => {
    const result = await data<HwTimeLevelData>(hwTime.levelRows.id, {});
    expect(result.level).toBe(0);
    expect(result.series.map(({ id }) => id)).toEqual(['PM1', 'PM2', 'PM3', 'PM4']);
    expect(result.rows).toHaveLength(24);
    expect(result.limits.maxRows).toBe(120);
    expect(result.rows.map(({ id }) => id)).toEqual(EQUIPMENT.slice(0, 24).map(e => e.equipmentId));
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
    expect(detailRows.map(({ id }) => id)).toEqual(EQUIPMENT.slice(0, 24).flatMap(e =>
      ['H1', 'H2', 'H3', 'H4'].map(item => `${e.equipmentId}.${item}`)));
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

  it('carries no Vent value on any PM4 row at L2 and L3, and none in a PM4 row or Module total (#690i UX-8)', async () => {
    const l1 = await data<HwTimeLevelData>(hwTime.levelRows.id, {});
    const l2 = await data<HwTimeLevelData>(hwTime.levelRows.id, { drillModule: 'PM4' });
    const l3 = await data<HwTimeLevelData>(hwTime.levelRows.id, { drillModule: 'PM4', drillMotion: 'Transfer' });
    const pm1 = await data<HwTimeLevelData>(hwTime.levelRows.id, { drillModule: 'PM1' });
    const withVent = (rows: HwTimeLevelData['rows']) => rows.filter(row => row.values.Vent !== undefined && row.values.Vent !== null);
    expect(withVent(l2.rows)).toEqual([]);
    expect(withVent(l3.context?.rows ?? [])).toEqual([]);
    expect(withVent(pm1.rows).length).toBeGreaterThan(0);
    const dataRows = l2.rows.filter(row => !row.auxiliary);
    expect(dataRows.every(row => row.total === Object.values(row.values).reduce((sum: number, value) => sum + (value ?? 0), 0))).toBe(true);
    const pm4Total = l1.totals.values.PM4;
    expect(pm4Total).toBeCloseTo(dataRows.reduce((sum, row) => sum + (row.total ?? 0), 0), 6);
  });
});

describe('HW Time trends and table endpoints', () => {
  it('applies equipment selection before paging and shares that population with level rows and export', async () => {
    const motionEquipment = ['MEM-PHOTO-0105', 'MEM-PHOTO-0111'];
    const page = await data<HwTimeTableData>(hwTime.tableRows.id, { motionEquipment, page: 1, pageSize: 1, sorting: [] });
    expect(page.total).toBe(2);
    expect(page.rows.map(row => row.equipmentId)).toEqual(['MEM-PHOTO-0111']);
    const level = await data<HwTimeLevelData>(hwTime.levelRows.id, { motionEquipment });
    expect(level.rows.map(row => row.equipmentId)).toEqual(motionEquipment);
    const exported = await data<HwTimeRow[]>(hwTime.exportRows.id, { motionEquipment, ids: null, sorting: [] });
    expect(exported.map(row => row.equipmentId)).toEqual(motionEquipment);
  });

  it('returns daily points in the period whose values differ for adjacent rows', async () => {
    const result = await data<HwTimeTrendData>(hwTime.trend.id, { rowIds: ['MEM-PHOTO-0103.H1', 'MEM-PHOTO-0103.H2'] });
    expect(result.rows).toHaveLength(2);
    expect(result.limits.maxRows).toBe(8);
    expect(result.rows.map(({ id }) => id)).toEqual(['MEM-PHOTO-0103.H1', 'MEM-PHOTO-0103.H2']);
    expect(result.rows[0]?.points).toHaveLength(2);
    expect(result.rows[0]?.points.map(point => point.at)).toEqual([
      '2026-09-25', '2026-09-26',
    ]);
    expect(result.rows[0]?.points.map(point => point.value)).not.toEqual(result.rows[1]?.points.map(point => point.value));
    expect(result.rows[0]?.points.every((point, i) => point.value !== result.rows[1]?.points[i]?.value)).toBe(true);
  });

  it('scales a sub-item trend to the table: the latest day is its measured L1 total and earlier days stay within ±15%', async () => {
    const trend = await data<HwTimeTrendData>(hwTime.trend.id, { rowIds: ['MEM-PHOTO-0105.H3', 'MEM-PHOTO-0105'] });
    let known = 0;
    for (const drillModule of ['PM1', 'PM2', 'PM3', 'PM4']) {
      const level = await data<HwTimeLevelData>(hwTime.levelRows.id, { drillModule });
      const row = level.rows.find(item => item.id === 'MEM-PHOTO-0105.H3')!;
      known += Object.values(row.values).reduce<number>((sum, value) => sum + (value ?? 0), 0);
    }
    const values = trend.rows[0]!.points.map(point => point.value as number);
    expect(values.at(-1)).toBeCloseTo(known, 9);
    values.slice(0, -1).forEach(value => expect(Math.abs(value / known - 1)).toBeLessThanOrEqual(0.15));
    expect(new Set(values).size).toBeGreaterThan(1);
  });

  it('gives an equipment total that equals the sum of its four sub-item trends on each day, deterministically', async () => {
    const subs = ['H1', 'H2', 'H3', 'H4'].map(item => `MEM-PHOTO-0105.${item}`);
    const result = await data<HwTimeTrendData>(hwTime.trend.id, { rowIds: ['MEM-PHOTO-0105', ...subs] });
    const again = await data<HwTimeTrendData>(hwTime.trend.id, { rowIds: ['MEM-PHOTO-0105'] });
    const [total, ...items] = result.rows;
    expect(total?.id).toBe('MEM-PHOTO-0105');
    expect(total?.points).toHaveLength(2);
    total?.points.forEach((point, day) => {
      expect(point.value).toBeCloseTo(items.reduce((sum, item) => sum + (item.points[day]?.value ?? 0), 0), 9);
    });
    expect(again.rows[0]).toEqual(total);
  });

  it('rejects more than eight trend rows and ids outside the static row format', async () => {
    const tooMany = await query(hwTime.trend.id, { rowIds: EQUIPMENT.slice(0, 9).map(e => `${e.equipmentId}.H1`) });
    const malformed = await query(hwTime.trend.id, { rowIds: ['MEM-PHOTO-0103.H5'] });
    const shortEquipment = await query(hwTime.trend.id, { rowIds: ['mem-photo-0103'] });
    expect(tooMany.outcome).toBe('error');
    expect(malformed.outcome).toBe('error');
    expect(shortEquipment.outcome).toBe('error');
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

  it.each([
    [{}, 24, 24],
    [{ drillModule: 'PM1' }, 120, 96],
    [{ drillModule: 'PM1', drillMotion: 'Pump' }, 96, 96],
  ])('pages, sorts and exports table rows at every level (%j)', async (drill, total, dataRows) => {
    const page = await data<HwTimeTableData>(hwTime.tableRows.id, { ...drill, page: 0, pageSize: 200, sorting: [] });
    expect(page.total).toBe(total);
    expect(page.rows.filter(row => !row.auxiliary)).toHaveLength(dataRows);
    const exported = await data<HwTimeRow[]>(hwTime.exportRows.id, { ...drill, ids: null, sorting: [] });
    expect(exported).toHaveLength(total);
    if ('drillModule' in drill && !('drillMotion' in drill)) {
      const meg = page.rows.filter(row => row.auxiliary);
      expect(meg).toHaveLength(24);
      expect(meg.every(row => row.auxiliary?.kind === 'MEG' && row.auxiliary.label !== '')).toBe(true);
      expect(exported.filter(row => row.auxiliary)).toHaveLength(24);
    }
  });

  it('sorts by a series id on its flat field, nulls last, ties by id', async () => {
    for (const desc of [false, true]) {
      const page = await data<HwTimeTableData>(hwTime.tableRows.id, { drillModule: 'PM3', page: 0, pageSize: 200, sorting: [{ id: 'Chuck', desc }] });
      const values = page.rows.map(row => row['Chuck'] as number | null | undefined ?? null);
      const known = values.filter((v): v is number => v !== null);
      expect(known).toEqual([...known].sort((a, b) => desc ? b - a : a - b));
      expect(values.indexOf(null)).toBeGreaterThan(known.length - 1);
      expect(values.slice(known.length).every(v => v === null)).toBe(true);
    }
    const l1 = await data<HwTimeTableData>(hwTime.tableRows.id, { page: 0, pageSize: 10, sorting: [{ id: 'PM1', desc: false }] });
    expect(l1.rows[0]?.['PM1']).toBe(l1.rows[0]?.values['PM1']);
  });

  it('rejects a Motion without a Module on the table endpoints', async () => {
    expect((await query(hwTime.tableRows.id, { drillMotion: 'Pump', page: 0, pageSize: 10, sorting: [] })).outcome).toBe('error');
    expect((await query(hwTime.exportRows.id, { drillModule: 'PM9', ids: null, sorting: [] })).outcome).toBe('error');
  });

  it('declares response row caps', () => {
    expect(HW_TIME_UNIT).toEqual({ ko: '초', en: 's' });
    expect(hwTime.levelRows.limits?.maxRows).toBeUndefined();
    expect(hwTime.trend.limits?.maxRows).toBeUndefined();
    expect(hwTime.tableRows.limits?.maxRows).toBeUndefined();
    expect(hwTime.exportRows.limits?.maxRows).toBe(120);
  });
});

describe('HW Time population follows the applied Scope and Condition', () => {
  const photo = EQUIPMENT.filter(e => e.site === 'MEM' && e.room === 'PHOTO').map(e => e.equipmentId);
  const narrowed = { selection: photo.slice(0, 2) };
  const noMatch = { condition: { maker: ['EBR'] } };
  const tableParams = { drillModule: 'PM1', drillMotion: 'Pump', page: 0, pageSize: 200, sorting: [] };
  const exportParams = { drillModule: 'PM1', drillMotion: 'Pump', ids: null, sorting: [] };

  it('gives fewer rows when a Selection narrows the resolved equipment, keeping the values of the rows that remain', async () => {
    const full = await data<HwTimeLevelData>(hwTime.levelRows.id, {});
    const l1 = await data<HwTimeLevelData>(hwTime.levelRows.id, {}, narrowed);
    expect(l1.rows.map(({ id }) => id)).toEqual(full.rows.slice(0, 2).map(({ id }) => id));
    expect(l1.rows).toEqual(full.rows.slice(0, 2));
    const l2 = await data<HwTimeLevelData>(hwTime.levelRows.id, { drillModule: 'PM1' }, narrowed);
    expect(l2.rows).toHaveLength(10);
    const l3 = await data<HwTimeLevelData>(hwTime.levelRows.id, { drillModule: 'PM1', drillMotion: 'Pump' }, narrowed);
    expect(l3.context?.rows).toHaveLength(8);
    expect(l3.detail?.rows).toHaveLength(8);
    const table = await data<HwTimeTableData>(hwTime.tableRows.id, tableParams, narrowed);
    expect(table.total).toBe(8);
    const exported = await data<HwTimeRow[]>(hwTime.exportRows.id, exportParams, narrowed);
    expect(exported).toHaveLength(8);
  });

  it('drops trend rows outside the narrowed population', async () => {
    const result = await data<HwTimeTrendData>(hwTime.trend.id, { rowIds: ['MEM-PHOTO-0103.H1', 'MEM-ETCH-0138.H1'] }, narrowed);
    expect(result.rows.map(({ id }) => id)).toEqual(['MEM-PHOTO-0103.H1']);
  });

  it('resolves PRC groups through the same population as fixed equipment IDs', async () => {
    const photoEquipment = EQUIPMENT.filter(e => e.site === 'MEM' && e.room === 'PHOTO');
    const prcGroup = photoEquipment[0].prcGroup;
    const selection = photoEquipment.filter(e => e.prcGroup === prcGroup).map(e => e.equipmentId);
    const full = await data<HwTimeLevelData>(hwTime.levelRows.id, {});
    const grouped = await data<HwTimeLevelData>(hwTime.levelRows.id, {}, { prcGroups: [prcGroup] });
    const fixed = await data<HwTimeLevelData>(hwTime.levelRows.id, {}, { selection });
    expect(grouped.rows.length).toBeGreaterThan(0);
    expect(grouped.rows.length).toBeLessThan(full.rows.length);
    expect(grouped.rows).toEqual(fixed.rows);
  });

  it.each([
    ['MEM · PHOTO', 'engineer', { roomNames: ['PHOTO'] }],
    ['MEM · ETCH', 'engineer', { roomNames: ['ETCH'] }],
    ['MEM · PRC', 'engineer', { roomNames: null, prcGroups: ['PRC-CVD-1'] }],
    ['FDRY', 'engineer', { scopeId: 'FDRY', roomNames: null }],
  ] as const)('accepts a shown bar as the equipment condition in %s and keeps that row and its values (#2868)', async (_, role, applied) => {
    setRole(role);
    const matrix = await data<HwTimeMatrix>(hwTimeOverview.matrix.id, { moduleType: 'PM' }, applied);
    const shown = matrix.equipment[1]!;
    const all = await data<HwTimeLevelData>(hwTime.levelRows.id, {}, applied);
    expect(all.rows.map(row => row.equipmentId)).toEqual(matrix.equipment);
    const narrowed = await data<HwTimeLevelData>(hwTime.levelRows.id, {}, { ...applied, selection: [shown] });
    expect(narrowed.rows.map(row => row.equipmentId)).toEqual([shown]);
    expect(narrowed.rows[0]!.values).toEqual(all.rows.find(row => row.equipmentId === shown)!.values);
  });

  it('refuses a fixed selection over 24 equipment instead of answering for part of it (#2868)', async () => {
    const granted = EQUIPMENT.filter(e => e.site === 'MEM' && ['PHOTO', 'ETCH', 'CVD'].includes(e.room)).map(e => e.equipmentId);
    expect((await query(hwTime.levelRows.id, {}, { selection: granted.slice(0, 24) })).outcome).toBe('ok');
    const over = await query(hwTime.levelRows.id, {}, { selection: granted.slice(0, 25) });
    expect(over).toMatchObject({
      outcome: 'too_large',
      message: 'fixed_equipment_limit: 25/24',
      data: null,
    });
  });

  it('keeps every fixed ID of a mixed selection as its own row (#2868)', async () => {
    const fixed = [photo[0]!, EQUIPMENT.find(e => e.site === 'MEM' && e.room === 'CVD')!.equipmentId];
    const result = await data<HwTimeLevelData>(hwTime.levelRows.id, {}, { selection: fixed });
    expect(result.rows.map(row => row.equipmentId)).toEqual(fixed);
  });

  it('answers empty for every endpoint when the Condition matches no equipment', async () => {
    const responses = await Promise.all([
      query<HwTimeLevelData>(hwTime.levelRows.id, {}, noMatch),
      query<HwTimeLevelData>(hwTime.levelRows.id, { drillModule: 'PM1', drillMotion: 'Pump' }, noMatch),
      query<HwTimeTrendData>(hwTime.trend.id, { rowIds: ['MEM-PHOTO-0103.H1'] }, noMatch),
      query<HwTimeTableData>(hwTime.tableRows.id, tableParams, noMatch),
      query<HwTimeRow[]>(hwTime.exportRows.id, exportParams, noMatch),
    ]);
    expect(responses.map(response => response.outcome)).toEqual(['empty', 'empty', 'empty', 'empty', 'empty']);
  });
});

describe('HW Time time-domain recovery (#3064)', () => {
  const from = '2026-09-05T09:00:00';

  it('explains why exclusion is unavailable when it would leave 36 fixed equipment', async () => {
    const response = await query(hwTimeOverview.matrix.id, { moduleType: 'LK' }, { from, roomNames: null });
    expect(response).toMatchObject({ outcome: 'error', message: 'time_domain_unverified · fixed_equipment_limit: 36/24' });
    expect(response.recovery).toBeUndefined();
  });

  it('offers exclusion when it leaves exactly 24 equipment and the fixed selection can be queried', async () => {
    const applied = { from, roomNames: ['PHOTO', 'CVD'] };
    const params = { moduleType: 'LK' };
    const response = await query(hwTimeOverview.matrix.id, params, applied);
    expect(response).toMatchObject({ outcome: 'error', message: 'time_domain_unverified' });
    const { affectedEquipmentIds, authorizedEquipmentIds } = response.recovery ?? {};
    expect(affectedEquipmentIds).toEqual(['MEM-PHOTO-0103', 'MEM-PHOTO-0105']);
    const selection = authorizedEquipmentIds?.filter(id => !affectedEquipmentIds?.includes(id));
    expect(selection).toHaveLength(24);
    expect((await query(hwTimeOverview.matrix.id, params, { ...applied, selection })).outcome).toBe('ok');
  });
});


it('MEN-51 keeps daily trend dates in the applied half-open period', async () => {
  const result = await data<HwTimeTrendData>(hwTime.trend.id, { rowIds: ['MEM-PHOTO-0103.H1'] });
  expect(result.rows[0]!.points.map(p => p.at)).toEqual(['2026-09-25', '2026-09-26']);
  const midnight = await data<HwTimeTrendData>(hwTime.trend.id, { rowIds: ['MEM-PHOTO-0103.H1'] }, { from: '2026-09-25T00:00:00', to: '2026-09-26T00:00:00' });
  expect(midnight.rows[0]!.points.map(p => p.at)).toEqual(['2026-09-25']);
});

describe('HW Time Module types and server judgements (#2328)', () => {
  it.each([['TR', ['TR1', 'TR2'], 'Pick'], ['LK', ['LK1', 'LK2'], 'Pump']] as const)('serves %s consistently across level, trend, table and export', async (moduleType, modules, motion) => {
    const level = await data<HwTimeLevelData>(hwTime.levelRows.id, { moduleType });
    expect(level.series.map(s => s.id)).toEqual(modules);
    const params = { moduleType, drillModule: modules[0], drillMotion: motion };
    const detail = await data<HwTimeLevelData>(hwTime.levelRows.id, params);
    expect(detail.detail?.series.map(s => s.id)).toEqual([motion]);
    const table = await data<HwTimeTableData>(hwTime.tableRows.id, { ...params, page: 0, pageSize: 10, sorting: [] });
    const exported = await data<HwTimeRow[]>(hwTime.exportRows.id, { ...params, ids: [table.rows[0]!.id], sorting: [] });
    expect(exported[0]).toEqual(table.rows[0]);
    const trend = await data<HwTimeTrendData>(hwTime.trend.id, { moduleType, rowIds: ['MEM-PHOTO-0103'] });
    const pm = await data<HwTimeTrendData>(hwTime.trend.id, { rowIds: ['MEM-PHOTO-0103'] });
    expect(trend.rows[0]?.points).not.toEqual(pm.rows[0]?.points);
  });
  it('provides LK over and under Motion judgements and worst-Motion Module roll-ups', async () => {
    const detail = await data<HwTimeLevelData>(hwTime.levelRows.id, { moduleType: 'LK', drillModule: 'LK1' });
    const judgements = detail.rows.flatMap(row => Object.values(row.judgements ?? {}));
    expect(judgements.some(j => j.status === 'over')).toBe(true);
    expect(judgements.some(j => j.status === 'under')).toBe(true);
    expect(judgements.every(j => j.lower !== null && j.upper !== null)).toBe(true);
    const level = await data<HwTimeLevelData>(hwTime.levelRows.id, { moduleType: 'LK' });
    expect(level.rows.every(row => row.judgements?.LK1?.status === 'over')).toBe(true);
  });
  it.each(['PM', 'TR'])('keeps %s unjudgeable with the shared reason', async moduleType => {
    const result = await data<HwTimeLevelData>(hwTime.levelRows.id, { moduleType });
    expect(result.rows.every(row => Object.values(row.judgements ?? {}).length > 0)).toBe(true);
    expect(result.rows.flatMap(row => Object.values(row.judgements ?? {})).every(j => j.status === 'unjudgeable' && j.reason === 'recipe-unsplit' && j.lower === null && j.upper === null)).toBe(true);
  });
  it('keeps absent and explicit PM numerically identical and rejects unknown types or drills', async () => {
    expect(await data(hwTime.levelRows.id, {})).toEqual(await data(hwTime.levelRows.id, { moduleType: 'PM' }));
    for (const params of [{ moduleType: 'unknown' }, { moduleType: 'TR', drillModule: 'PM1' }, { moduleType: 'LK', drillModule: 'LK1', drillMotion: 'Pick' }]) {
      expect((await query(hwTime.levelRows.id, params)).outcome).toBe('error');
    }
  });
});

describe('HW Time single-equipment run query', () => {
  const selected = EQUIPMENT.find(item => item.site === 'MEM' && item.room === 'PHOTO')!.equipmentId;
  const params = { moduleType: 'LK', drillModule: 'LK1', drillMotion: 'Pump', equipmentId: selected };
  const applied = { selection: [selected], from: '2026-09-25T00:00:00', to: '2026-09-28T00:00:00' };

  it('returns daily HTM bounds for the one equipment resolved by Scope and Selection', async () => {
    const runs = await data<HwTimeRuns>('hwTime.runs', params, applied);
    expect(runs.daily.length).toBeGreaterThan(1);
    expect([...new Set(runs.daily.map(point => point.equipmentId))]).toEqual([selected]);
    expect(runs.bounds).toEqual([{ equipmentId: selected, moduleId: 'LK1', motion: 'Pump', lower: 2.4, upper: 4 }]);
  });

  it('rejects an equipment parameter that does not match the selected equipment', async () => {
    const response = await query('hwTime.runs', { ...params, equipmentId: 'other-equipment' }, applied);
    expect(response.outcome).toBe('error');
  });

  it('returns no rows if the selected equipment is outside the scoped room filter', async () => {
    const response = await query('hwTime.runs', params, { ...applied, roomNames: ['ETCH'] });
    expect(response.outcome).toBe('empty');
  });

  it('returns an empty envelope when the applied intersection excludes the selected equipment', async () => {
    const response = await query('hwTime.runs', params, { ...applied, selection: [] });
    expect(response).toMatchObject({ outcome: 'empty', data: null, assessments: [] });
  });

  it('checks permission before returning an empty intersection', async () => {
    setRole('viewer');
    const response = await query('hwTime.runs', params, { ...applied, selection: [] });
    expect(response.outcome).toBe('forbidden');
  });

  it('still rejects an invalid equipment ID with an empty intersection', async () => {
    const response = await query('hwTime.runs', { ...params, equipmentId: ' ' }, { ...applied, selection: [] });
    expect(response).toMatchObject({ outcome: 'error', message: 'Invalid equipmentId' });
  });

  it('uses the endpoint permission from the server declaration', async () => {
    setRole('viewer');
    const response = await query('hwTime.runs', params, applied);
    expect(response.outcome).toBe('forbidden');
  });
});

describe('HW Time exact compared-equipment run query', () => {
  const selection = EQUIPMENT.filter(item => item.site === 'MEM' && item.room === 'PHOTO').slice(0, 2).map(item => item.equipmentId);
  const params = { moduleType: 'LK', drillModule: 'LK1', drillMotion: 'Pump', equipmentIds: selection };
  const applied = { selection, from: '2026-09-25T00:00:00', to: '2026-09-28T00:00:00' };

  it('serves each canonical selected equipment without expanding the population', async () => {
    const runs = await data<HwTimeRuns>('hwTime.runs', params, applied);
    expect([...new Set(runs.daily.map(point => point.equipmentId))]).toEqual(selection);
    expect(runs.bounds.map(bound => bound.equipmentId)).toEqual(selection);
  });

  it('rejects an equipment list that does not match Selection', async () => {
    expect((await query('hwTime.runs', { ...params, equipmentIds: selection.slice(0, 1) }, applied)).outcome).toBe('error');
  });

  const etch = EQUIPMENT.find(item => item.site === 'MEM' && item.room === 'ETCH')!.equipmentId;
  const mixed = [selection[0]!, etch];

  it('rejects a same-count equipment list with different IDs from Selection', async () => {
    expect((await query('hwTime.runs', { ...params, equipmentIds: mixed }, applied)).outcome).toBe('error');
  });

  it('returns only the requested equipment that passes the process filter', async () => {
    const runs = await data<HwTimeRuns>('hwTime.runs', { ...params, equipmentIds: mixed }, { ...applied, selection: mixed, roomNames: ['PHOTO'] });
    expect([...new Set(runs.daily.map(point => point.equipmentId))]).toEqual([selection[0]]);
    expect(runs.bounds.map(bound => bound.equipmentId)).toEqual([selection[0]]);
  });

  it('returns empty when the process filter excludes all requested equipment', async () => {
    const response = await query('hwTime.runs', params, { ...applied, roomNames: ['ETCH'] });
    expect(response).toMatchObject({ outcome: 'empty', data: { daily: [], bounds: [], points: [], total: 0, shown: 0 } });
  });

  it('rejects a requested equipment outside Scope even when Selection matches', async () => {
    const outside = EQUIPMENT.find(item => item.site === 'FDRY')!.equipmentId;
    const requested = [selection[0]!, outside];
    const response = await query('hwTime.runs', { ...params, equipmentIds: requested }, { ...applied, selection: requested });
    expect(response.outcome).toBe('forbidden');
  });
});
