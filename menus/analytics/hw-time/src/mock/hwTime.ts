/** Deterministic synthetic HW Time data. The package mock never reads real equipment names or records. */
import { shift, sortAndPage, sortRows, type PageSort } from '@ap/contracts';
import { defineMockEndpoint, type AnyMockEndpoint } from '@ap/mock-server';
import {
  HW_TIME_MAX_ROWS, HW_TIME_MAX_TREND_ROWS, MODULE_IDS, MOTION_IDS, SUB_ITEM_IDS, hwTime, isHwTimeRowId,
  type HwTimeBlock, type HwTimeDrill, type HwTimeRow, type HwTimeSeries, type ModuleId, type MotionId,
} from '../endpoints';

const EQUIPMENT_IDS = Array.from({ length: 24 }, (_, i) => `EQ-${String(i + 1).padStart(3, '0')}`);
const MODULE_COLORS: Record<ModuleId, string> = {
  PM1: 'chart-blue', PM2: 'chart-teal', PM3: 'chart-purple', PM4: 'chart-series-1',
};
const MOTION_COLORS: Record<MotionId, string> = {
  Chuck: 'chart-blue', Dechuck: 'chart-teal', Pump: 'chart-purple', Vent: 'cat-amber', Transfer: 'chart-series-1',
};
const MODULE_SERIES: HwTimeSeries[] = MODULE_IDS.map(id => ({ id, name: id, color: MODULE_COLORS[id] }));
const MOTION_SERIES: HwTimeSeries[] = MOTION_IDS.map(id => ({ id, name: id, color: MOTION_COLORS[id] }));

function seconds(seed: number, phase: number): number {
  return 2.125 + ((seed * 131_071 + phase * 52_429) % 1_000_003) / 10_000;
}

function completeSum(values: readonly (number | null)[]): number | null {
  if (values.length === 0) return null;
  const known = values.filter((value): value is number => value !== null);
  if (known.length !== values.length) return null;
  return known.reduce((sum, value) => sum + value, 0);
}

function totalOf(values: Record<string, number | null>): number | null {
  return completeSum(Object.values(values));
}

function motionValue(equipmentNumber: number, subItemIndex: number, module: ModuleId, motionIndex: number): number | null {
  const seed = equipmentNumber * 4 + subItemIndex;
  if (module === 'PM3' && (seed + motionIndex) % 19 === 0) return null;
  const moduleIndex = MODULE_IDS.indexOf(module);
  return seconds(seed, moduleIndex * 113 + motionIndex * 29);
}

function moduleValue(equipmentNumber: number, module: ModuleId): number | null {
  return completeSum(SUB_ITEM_IDS.flatMap((_, subItemIndex) =>
    MOTION_IDS.map((_, motionIndex) => motionValue(equipmentNumber, subItemIndex, module, motionIndex))));
}

function aggregate(rows: HwTimeRow[], series: HwTimeSeries[]): HwTimeBlock {
  const dataRows = rows.filter(row => !row.auxiliary);
  const values = Object.fromEntries(series.map(({ id }) => [
    id,
    completeSum(dataRows.map(row => row.values[id] ?? null)),
  ]));
  return {
    series,
    rows,
    totals: { values, total: completeSum(Object.values(values)) },
  };
}

function equipmentRows(): HwTimeRow[] {
  return EQUIPMENT_IDS.map((equipmentId, index) => {
    const equipmentNumber = index + 1;
    const values = Object.fromEntries(MODULE_IDS.map(module => [module, moduleValue(equipmentNumber, module)]));
    return { id: equipmentId, equipmentId, values, total: totalOf(values) };
  });
}

function moduleRows(module: ModuleId, includeMeg: boolean): HwTimeRow[] {
  return EQUIPMENT_IDS.flatMap((equipmentId, equipmentIndex) => {
    const equipmentNumber = equipmentIndex + 1;
    const rows: HwTimeRow[] = SUB_ITEM_IDS.map((subItem, subItemIndex) => {
      const values = Object.fromEntries(MOTION_IDS.map((_, motionIndex) => [
        MOTION_IDS[motionIndex], motionValue(equipmentNumber, subItemIndex, module, motionIndex),
      ]));
      return {
        id: `${equipmentId}.${subItem}`,
        equipmentId,
        subItem,
        values,
        total: totalOf(values),
      } satisfies HwTimeRow;
    });
    if (includeMeg) {
      const moduleIndex = MODULE_IDS.indexOf(module);
      const label = String(seconds(equipmentNumber * 4, 251 + moduleIndex));
      rows.push({ id: `${equipmentId}.MEG`, equipmentId, auxiliary: { kind: 'MEG', label }, values: {}, total: null });
    }
    return rows;
  });
}

function detailRows(module: ModuleId, motion: MotionId): HwTimeRow[] {
  if (module === 'PM4' && motion === 'Vent') return [];
  const motionIndex = MOTION_IDS.indexOf(motion);
  return moduleRows(module, false).map(row => {
    const value = row.values[motion] ?? null;
    const values = { [motion]: value };
    return { ...row, values, total: totalOf(values) };
  });
}

function isModuleId(value: string | undefined): value is ModuleId {
  return value !== undefined && MODULE_IDS.includes(value as ModuleId);
}

function isMotionId(value: string | undefined): value is MotionId {
  return value !== undefined && MOTION_IDS.includes(value as MotionId);
}

function validateDrill(drill: HwTimeDrill): string | null {
  if (drill.drillModule !== undefined && !isModuleId(drill.drillModule)) return 'drillModule must be PM1, PM2, PM3, or PM4';
  if (drill.drillMotion !== undefined && !isMotionId(drill.drillMotion)) return 'drillMotion is not a supported Motion';
  if (drill.drillMotion !== undefined && drill.drillModule === undefined) return 'drillMotion requires drillModule';
  return null;
}

function validateTableFilter(filter: { drillModule: string; drillMotion: string }): string | null {
  if (!isModuleId(filter.drillModule)) return 'drillModule must be PM1, PM2, PM3, or PM4';
  if (!isMotionId(filter.drillMotion)) return 'drillMotion is not a supported Motion';
  return null;
}

function levelRows(drill: HwTimeDrill) {
  const invalid = validateDrill(drill);
  if (invalid) throw new Error(invalid);

  if (drill.drillModule === undefined) {
    return { ...aggregate(equipmentRows(), MODULE_SERIES), level: 0 as const, limits: { maxRows: HW_TIME_MAX_ROWS.level } };
  }

  const module = drill.drillModule as ModuleId;
  if (drill.drillMotion === undefined) {
    return { ...aggregate(moduleRows(module, true), MOTION_SERIES), level: 1 as const, limits: { maxRows: HW_TIME_MAX_ROWS.level } };
  }

  const context = aggregate(moduleRows(module, false), MOTION_SERIES);
  const motion = drill.drillMotion as MotionId;
  const detailSeries = MOTION_SERIES.filter(series => series.id === motion);
  const detail = aggregate(detailRows(module, motion), detailSeries);
  return {
    ...context,
    level: 2 as const,
    context,
    detail,
    limits: { maxRows: HW_TIME_MAX_ROWS.level },
  };
}

function validateTrend(rowIds: string[]): string | null {
  if (!Array.isArray(rowIds)) return 'rowIds must be an array';
  if (rowIds.length > HW_TIME_MAX_TREND_ROWS) return `rowIds may contain at most ${HW_TIME_MAX_TREND_ROWS} rows`;
  if (rowIds.some(rowId => !isHwTimeRowId(rowId))) return 'rowIds must match ^EQ-\\d{3}\\.H[1-4]$';
  return null;
}

function trendRows(rowIds: string[], to: string) {
  return {
    rows: rowIds.map(id => {
      const match = /^EQ-(\d{3})\.H([1-4])$/.exec(id)!;
      const seed = Number(match[1]) * 4 + Number(match[2]) - 1;
      const phase = seed % 8;
      return {
        id,
        points: Array.from({ length: 8 }, (_, dayIndex) => ({
          at: shift(to, -24 * (8 - dayIndex)).slice(0, 10),
          value: 5 + ((seed * 127 + ((dayIndex + phase) % 8) * 991) % 100_003) / 1_000,
        })),
      };
    }),
    limits: { maxRows: HW_TIME_MAX_TREND_ROWS },
  };
}

function tableRows(drillModule: string, drillMotion: string, page: number, pageSize: number, sorting: PageSort[]) {
  const module = drillModule as ModuleId;
  const motion = drillMotion as MotionId;
  return sortAndPage(detailRows(module, motion), { page, pageSize, sorting });
}

function exportRows(drillModule: string, drillMotion: string, ids: string[] | null, sorting: PageSort[]) {
  const rows = detailRows(drillModule as ModuleId, drillMotion as MotionId);
  return sortRows(ids === null ? rows : rows.filter(row => ids.includes(row.id)), sorting);
}

export const hwTimeMock: readonly AnyMockEndpoint[] = [
  defineMockEndpoint(hwTime.levelRows, {
    handle: ({ params }) => levelRows(params),
    validate: ({ params }) => validateDrill(params),
    isEmpty: data => data.rows.length === 0,
  }),
  defineMockEndpoint(hwTime.trend, {
    handle: ({ params, context }) => trendRows(params.rowIds, context.to!),
    validate: ({ params }) => validateTrend(params.rowIds),
    isEmpty: data => data.rows.length === 0,
  }),
  defineMockEndpoint(hwTime.tableRows, {
    handle: ({ params }) => tableRows(params.drillModule, params.drillMotion, params.page, params.pageSize, params.sorting),
    validate: ({ params }) => validateTableFilter(params),
    isEmpty: data => data.rows.length === 0,
  }),
  defineMockEndpoint(hwTime.exportRows, {
    handle: ({ params }) => exportRows(params.drillModule, params.drillMotion, params.ids, params.sorting),
    validate: ({ params }) => {
      const invalidFilter = validateTableFilter(params);
      if (invalidFilter) return invalidFilter;
      if (params.ids !== null && (!Array.isArray(params.ids) || params.ids.some(id => typeof id !== 'string'))) return 'ids must be a string array or null';
      return null;
    },
  }),
];
