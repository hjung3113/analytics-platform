/** Deterministic synthetic HW Time data. The package mock never reads real equipment names or records. */
import { bucketStart, shift, type PageSort } from '@ap/contracts';
import { defineMockEndpoint, type AnyMockEndpoint, type Equipment } from '@ap/mock-server';
import {
  HW_TIME_MAX_ROWS, HW_TIME_MAX_TREND_ROWS, HW_TIME_MODULE_TYPES, HW_TIME_MOTION_COLORS, HW_TIME_MOTION_COLOR_BY_ID, SUB_ITEM_IDS, hwTime, isHwTimeTrendId,
  type HwTimeBlock, type HwTimeDrill, type HwTimeRow, type HwTimeSeries, type HwTimeTableRow, type HwTimeModuleType,
} from '../endpoints';
import { judge, rollUp } from './htm';

const MAX_SYNTHETIC_EQUIPMENT = 24;
const SYNTHETIC_PER_EQUIPMENT = 3;

/**
 * The synthetic population follows the equipment the engine resolved for the applied Scope and Condition: each
 * resolved equipment hosts three synthetic ones, capped at 24, numbered from EQ-001 so a row keeps its values when
 * the population shrinks. A narrower condition gives fewer rows; no resolved equipment gives none.
 */
function syntheticEquipmentIds(equipment: readonly Equipment[]): string[] {
  const count = Math.min(MAX_SYNTHETIC_EQUIPMENT, equipment.length * SYNTHETIC_PER_EQUIPMENT);
  return Array.from({ length: count }, (_, i) => `EQ-${String(i + 1).padStart(3, '0')}`);
}
const typeOf = (params: { moduleType?: string }): HwTimeModuleType => HW_TIME_MODULE_TYPES.find(type => type.id === params.moduleType) ?? HW_TIME_MODULE_TYPES[0];
const seriesOf = (ids: readonly string[], kind: 'module' | 'motion' = 'motion'): HwTimeSeries[] => ids.map((id, index) => {
  if (kind === 'motion') return { id, name: id, color: HW_TIME_MOTION_COLOR_BY_ID[id]! };
  const color = index === 3 ? 'chart-series-1' : HW_TIME_MOTION_COLORS[index]!;
  return { id, name: id, color };
});

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

/** PM4 records no Vent at all (its L3 detail is empty), so no PM4 row at any level carries a Vent value or counts one in a total. */
function hasRecords(module: string, motion: string): boolean {
  return !(module === 'PM4' && motion === 'Vent');
}

function motionValue(equipmentNumber: number, subItemIndex: number, module: string, motionIndex: number, type: HwTimeModuleType): number | null {
  const seed = equipmentNumber * 4 + subItemIndex;
  if (module === 'PM3' && (seed + motionIndex) % 19 === 0) return null;
  const moduleIndex = (type.modules as readonly string[]).indexOf(module);
  return seconds(seed, moduleIndex * 113 + motionIndex * 29);
}

function moduleValue(equipmentNumber: number, module: string, type: HwTimeModuleType): number | null {
  return completeSum(SUB_ITEM_IDS.flatMap((_, subItemIndex) =>
    type.motions.flatMap((motion, motionIndex) => hasRecords(module, motion) ? [motionValue(equipmentNumber, subItemIndex, module, motionIndex, type)] : [])));
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

function equipmentRows(equipmentIds: readonly string[], type: HwTimeModuleType): HwTimeRow[] {
  return equipmentIds.map((equipmentId, index) => {
    const equipmentNumber = index + 1;
    const values = Object.fromEntries(type.modules.map(module => [module, moduleValue(equipmentNumber, module, type)]));
    const judgements = Object.fromEntries(type.modules.map(module => {
      const motions = SUB_ITEM_IDS.flatMap((_, subIndex) => type.motions.flatMap((motion, motionIndex) => hasRecords(module, motion)
        ? [judge(type.id, motion, motionValue(equipmentNumber, subIndex, module, motionIndex, type))] : []));
      return [module, rollUp(values[module] ?? null, motions)];
    }));
    return { id: equipmentId, equipmentId, values, total: totalOf(values), judgements };
  });
}

function moduleRows(equipmentIds: readonly string[], module: string, includeMeg: boolean, type: HwTimeModuleType): HwTimeRow[] {
  return equipmentIds.flatMap((equipmentId, equipmentIndex) => {
    const equipmentNumber = equipmentIndex + 1;
    const rows: HwTimeRow[] = SUB_ITEM_IDS.map((subItem, subItemIndex) => {
      const values = Object.fromEntries(type.motions.flatMap((motion, motionIndex) => hasRecords(module, motion)
        ? [[motion, motionValue(equipmentNumber, subItemIndex, module, motionIndex, type)]] : []));
      return {
        id: `${equipmentId}.${subItem}`,
        equipmentId,
        subItem,
        values,
        total: totalOf(values),
        judgements: Object.fromEntries(Object.entries(values).map(([motion, value]) => [motion, judge(type.id, motion, value)])),
      } satisfies HwTimeRow;
    });
    if (includeMeg) {
      const moduleIndex = (type.modules as readonly string[]).indexOf(module);
      const label = String(seconds(equipmentNumber * 4, 251 + moduleIndex));
      rows.push({ id: `${equipmentId}.MEG`, equipmentId, auxiliary: { kind: 'MEG', label }, values: {}, total: null });
    }
    return rows;
  });
}

function detailRows(equipmentIds: readonly string[], module: string, motion: string, type: HwTimeModuleType): HwTimeRow[] {
  if (!hasRecords(module, motion)) return [];
  return moduleRows(equipmentIds, module, false, type).map(row => {
    const value = row.values[motion] ?? null;
    const values = { [motion]: value };
    return { ...row, values, total: totalOf(values), judgements: { [motion]: row.judgements![motion]! } };
  });
}

function validateDrill(drill: HwTimeDrill): string | null {
  const type = typeOf(drill);
  if (drill.moduleType !== undefined && !HW_TIME_MODULE_TYPES.some(type => type.id === drill.moduleType)) return 'moduleType is not supported';
  if (drill.drillModule !== undefined && !(type.modules as readonly string[]).includes(drill.drillModule)) return 'drillModule is not supported by moduleType';
  if (drill.drillMotion !== undefined && !(type.motions as readonly string[]).includes(drill.drillMotion)) return 'drillMotion is not supported by moduleType';
  if (drill.drillMotion !== undefined && drill.drillModule === undefined) return 'drillMotion requires drillModule';
  return null;
}

function levelRows(equipmentIds: readonly string[], drill: HwTimeDrill) {
  const type = typeOf(drill);
  const invalid = validateDrill(drill);
  if (invalid) throw new Error(invalid);

  if (drill.drillModule === undefined) {
    return { ...aggregate(equipmentRows(equipmentIds, type), seriesOf(type.modules, 'module')), level: 0 as const, limits: { maxRows: HW_TIME_MAX_ROWS.level } };
  }

  const module = drill.drillModule!;
  if (drill.drillMotion === undefined) {
    return { ...aggregate(moduleRows(equipmentIds, module, true, type), seriesOf(type.motions)), level: 1 as const, limits: { maxRows: HW_TIME_MAX_ROWS.level } };
  }

  const context = aggregate(moduleRows(equipmentIds, module, false, type), seriesOf(type.motions));
  const motion = drill.drillMotion!;
  const detailSeries = seriesOf(type.motions).filter(series => series.id === motion);
  const detail = aggregate(detailRows(equipmentIds, module, motion, type), detailSeries);
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
  if (rowIds.some(rowId => !isHwTimeTrendId(rowId))) return 'rowIds must match ^EQ-\\d{3}(\\.H[1-4])?$';
  return null;
}

/**
 * A sub-item's daily total over all Modules and Motions: the latest day equals its L1 total (the measured values summed, as the
 * table shows them per Module), earlier days vary deterministically within ±15% so a trend reads next to the table value.
 */
function subItemTrend(equipmentNumber: number, subItem: number, type: HwTimeModuleType): number[] {
  const seed = equipmentNumber * 4 + subItem - 1;
  const subItemIndex = subItem - 1;
  const total = type.modules.reduce((sum, module) => sum + type.motions.reduce((inner, motion, motionIndex) =>
    inner + (hasRecords(module, motion) ? motionValue(equipmentNumber, subItemIndex, module, motionIndex, type) ?? 0 : 0), 0), 0);
  return Array.from({ length: 8 }, (_, dayIndex) => dayIndex === 7 ? total : total * (1 + (((seed * 37 + dayIndex * 53) % 301) - 150) / 1_000));
}

/** A sub-item id gives its own daily values; an equipment id gives their per-day sum over H1–H4. */
function trendValues(id: string, type: HwTimeModuleType): number[] {
  const match = /^EQ-(\d{3})(?:\.H([1-4]))?$/.exec(id)!;
  const equipmentNumber = Number(match[1]);
  if (match[2] !== undefined) return subItemTrend(equipmentNumber, Number(match[2]), type);
  const items = [1, 2, 3, 4].map(item => subItemTrend(equipmentNumber, item, type));
  return Array.from({ length: 8 }, (_, dayIndex) => items.reduce((sum, item) => sum + item[dayIndex]!, 0));
}

function trendRows(equipmentIds: readonly string[], rowIds: string[], from: string, to: string, type: HwTimeModuleType) {
  const endDay = bucketStart(to, 'day');
  const lastDay = to === endDay ? shift(endDay, -24) : endDay;
  return {
    rows: rowIds.filter(id => equipmentIds.includes(id.slice(0, 6))).map(id => {
      const values = trendValues(id, type);
      return {
        id,
        points: values.map((value, dayIndex) => ({ at: shift(lastDay, -24 * (7 - dayIndex)).slice(0, 10), value }))
          .filter(point => point.at >= from.slice(0, 10)),
      };
    }),
    limits: { maxRows: HW_TIME_MAX_TREND_ROWS },
  };
}

/** The rows of the level the drill keys name, each with its series values as flat fields. */
function tableLevelRows(equipmentIds: readonly string[], drill: HwTimeDrill): HwTimeTableRow[] {
  const type = typeOf(drill);
  const rows = drill.drillModule === undefined ? equipmentRows(equipmentIds, type)
    : drill.drillMotion === undefined ? moduleRows(equipmentIds, drill.drillModule!, true, type)
      : detailRows(equipmentIds, drill.drillModule!, drill.drillMotion!, type);
  return rows.map(row => ({ ...row, ...row.values }));
}

/** First sort key only; unmeasured and missing values come last in either direction and ties keep the stable id order. */
function sortTableRows(rows: HwTimeTableRow[], sorting: PageSort[]): HwTimeTableRow[] {
  const s = sorting[0];
  return [...rows].sort((a, b) => {
    if (s) {
      const av = a[s.id] ?? null; const bv = b[s.id] ?? null;
      if (av === null || bv === null) { if (av !== bv) return av === null ? 1 : -1; }
      else if (av !== bv) return ((av as number | string) < (bv as number | string) ? -1 : 1) * (s.desc ? -1 : 1);
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

function tableRows(equipmentIds: readonly string[], drill: HwTimeDrill, page: number, pageSize: number, sorting: PageSort[]) {
  const sorted = sortTableRows(tableLevelRows(equipmentIds, drill), sorting);
  return { rows: sorted.slice(page * pageSize, (page + 1) * pageSize), total: sorted.length };
}

function exportRows(equipmentIds: readonly string[], drill: HwTimeDrill, ids: string[] | null, sorting: PageSort[]) {
  const rows = tableLevelRows(equipmentIds, drill);
  return sortTableRows(ids === null ? rows : rows.filter(row => ids.includes(row.id)), sorting);
}

export const hwTimeMock: readonly AnyMockEndpoint[] = [
  defineMockEndpoint(hwTime.levelRows, {
    handle: ({ params, equipment }) => levelRows(syntheticEquipmentIds(equipment), params),
    validate: ({ params }) => validateDrill(params),
    isEmpty: data => data.rows.length === 0,
  }),
  defineMockEndpoint(hwTime.trend, {
    handle: ({ params, context, equipment }) => trendRows(syntheticEquipmentIds(equipment), params.rowIds, context.from!, context.to!, typeOf(params)),
    validate: ({ params }) => validateDrill({ moduleType: params.moduleType }) ?? validateTrend(params.rowIds),
    isEmpty: data => data.rows.length === 0,
  }),
  defineMockEndpoint(hwTime.tableRows, {
    handle: ({ params, equipment }) => tableRows(syntheticEquipmentIds(equipment), params, params.page, params.pageSize, params.sorting),
    validate: ({ params }) => validateDrill(params),
    isEmpty: data => data.rows.length === 0,
  }),
  defineMockEndpoint(hwTime.exportRows, {
    handle: ({ params, equipment }) => exportRows(syntheticEquipmentIds(equipment), params, params.ids, params.sorting),
    validate: ({ params }) => {
      const invalidFilter = validateDrill(params);
      if (invalidFilter) return invalidFilter;
      if (params.ids !== null && (!Array.isArray(params.ids) || params.ids.some(id => typeof id !== 'string'))) return 'ids must be a string array or null';
      return null;
    },
    isEmpty: data => data.length === 0,
  }),
];
