import { HW_TIME_MESSAGES } from './messages';
/** Client-safe endpoint contracts shared by all four HW Time menus and their mock handlers. */
import { defineEndpoint, menuPermission, type PageQuery, type PageResult, type PageSort } from '@ap/contracts';

export const MODULE_IDS = ['PM1', 'PM2', 'PM3', 'PM4'] as const;
export const MOTION_IDS = ['Chuck', 'Dechuck', 'Pump', 'Vent', 'Transfer'] as const;
export const SUB_ITEM_IDS = ['H1', 'H2', 'H3', 'H4'] as const;

export type ModuleId = typeof MODULE_IDS[number];
export type MotionId = typeof MOTION_IDS[number];
export type SubItemId = typeof SUB_ITEM_IDS[number];
export type HwTimeDrill = { drillModule?: string; drillMotion?: string; moduleType?: HwTimeModuleTypeId };
export type HwTimeSeries = { id: string; name: string; color: string };
export type HwTimeRow = {
  id: string;
  equipmentId: string;
  subItem?: SubItemId;
  auxiliary?: { kind: 'MEG'; label: string };
  values: Record<string, number | null>;
  total: number | null;
  judgements?: Record<string, HtmJudgement>;
};
export type HwTimeTotals = { values: Record<string, number | null>; total: number | null };
export type HwTimeBlock = { series: HwTimeSeries[]; rows: HwTimeRow[]; totals: HwTimeTotals };
export type HwTimeLevelData = HwTimeBlock & {
  level: 0 | 1 | 2;
  limits: { maxRows: number };
  context?: HwTimeBlock;
  detail?: HwTimeBlock;
};
export type HwTimeTrendPoint = { at: string; value: number | null };
export type HwTimeTrendRow = { id: string; points: HwTimeTrendPoint[] };
export type HwTimeTrendData = { rows: HwTimeTrendRow[]; limits: { maxRows: number } };
/** No key lists L1 rows (EquipmentID × Module), `drillModule` L2 rows (EquipmentID × sub-item, with MEG), both keys L3 rows. */
export type HwTimeTableFilter = HwTimeDrill;
/** A table row also carries each series value as a flat field (`row['PM1']`, `row['Dechuck']`) so the server and the table sort it. */
export type HwTimeTableRow = HwTimeRow & { [seriesId: string]: unknown };
export type HwTimeTableParams = HwTimeTableFilter & PageQuery;
export type HwTimeTableData = PageResult<HwTimeTableRow>;
export type HwTimeExportParams = HwTimeTableFilter & { ids: string[] | null; sorting: PageSort[] };
export type HwTimeExportRow = HwTimeTableRow;

/**
 * Synthetic Module types (#2329): each type lists its Modules and the Motions those Modules record. Identifiers are synthetic. `PM` keeps the
 * Modules and Motions above. `LK` is the mock's demo of the future Recipe-split state: the mock judges it against HTM bounds, every other type
 * answers `unjudgeable` / `recipe-unsplit` (advisor decision, PR Decisions). Screens never branch on a type id.
 */
export const HW_TIME_MODULE_TYPES = [
  { id: 'PM', modules: ['PM1', 'PM2', 'PM3', 'PM4'], motions: ['Chuck', 'Dechuck', 'Pump', 'Vent', 'Transfer'] },
  { id: 'TR', modules: ['TR1', 'TR2'], motions: ['Pick', 'Place', 'Rotate', 'Extend'] },
  { id: 'LK', modules: ['LK1', 'LK2'], motions: ['Pump', 'Vent', 'DoorOpen', 'DoorClose'] },
] as const;
export type HwTimeModuleType = typeof HW_TIME_MODULE_TYPES[number];
export type HwTimeModuleTypeId = HwTimeModuleType['id'];

/**
 * HTM judgement status, decided by the server (#1794): `over` = the Motion average is above the HTM upper bound, `under` = below the lower
 * bound (a weaker caution than `over`), `unjudgeable` = no judgement (see `HtmUnjudgeableReason`). A Module's status is the server's roll-up of
 * its Motions. The screen draws the status as given and never compares a value with the bounds itself.
 */
export const HTM_STATUSES = ['normal', 'over', 'under', 'unjudgeable'] as const;
export type HtmStatus = typeof HTM_STATUSES[number];
/** Why a value is not judged: `recipe-unsplit` = the statistics are not split by Recipe/PPID yet; `no-criteria` = no HTM is registered for the key. */
export type HtmUnjudgeableReason = 'recipe-unsplit' | 'no-criteria';
/**
 * One server judgement: the averaged value (seconds), the HTM bounds of its key (Maker + Model + PPID + Recipe + Module + Motion; `null` when
 * unknown) and the status. `reason` is present exactly when `status` is `unjudgeable`.
 */
export type HtmJudgement = { value: number | null; lower: number | null; upper: number | null; status: HtmStatus; reason?: HtmUnjudgeableReason };

export const HW_TIME_UNIT = HW_TIME_MESSAGES.endpointHwTimeUnit;
export const HW_TIME_MAX_ROWS = { level: 120, export: 120 } as const;
/** The eight-row cap keeps request URLs short and multi-row trends legible. */
export const HW_TIME_MAX_TREND_ROWS = 8;
export const HW_TIME_ROW_ID_PATTERN = /^EQ-\d{3}\.H[1-4]$/;

/** `hwTime.trend` ids: a sub-item row (`EQ-001.H1`) or an equipment total (`EQ-001`, the sum over its four sub-items). */
export const HW_TIME_TREND_ID_PATTERN = /^EQ-\d{3}(?:\.H[1-4])?$/;

export function isHwTimeRowId(value: unknown): value is string {
  return typeof value === 'string' && HW_TIME_ROW_ID_PATTERN.test(value);
}

export function isHwTimeTrendId(value: unknown): value is string {
  return typeof value === 'string' && HW_TIME_TREND_ID_PATTERN.test(value);
}

const PERMISSION = menuPermission('analytics:view');
/** Applied Context for the four HW Time menus. Values are synthetic with no Job axis, so ppid/recipe are unsupported (#2072). */
export const HW_TIME_CONTEXT = {
  time: 'apply', roomNames: 'apply', condition: 'apply', selection: 'apply',
} as const;
const common = {
  menuId: 'hw-time', permission: PERMISSION, requiresScope: true,
  context: HW_TIME_CONTEXT,
  kinds: ['collection', 'processing_delay', 'coverage'],
  mergeTimeDomain: true,
} as const;

export const hwTime = {
  levelRows: defineEndpoint<HwTimeDrill, HwTimeLevelData>({
    ...common,
    id: 'hwTime.levelRows',
    paramKeys: { moduleType: true, drillModule: true, drillMotion: true },
  }),
  trend: defineEndpoint<{ rowIds: string[]; moduleType?: HwTimeModuleTypeId }, HwTimeTrendData>({
    ...common,
    id: 'hwTime.trend',
    paramKeys: { moduleType: true, rowIds: true },
  }),
  tableRows: defineEndpoint<HwTimeTableParams, HwTimeTableData>({
    ...common,
    id: 'hwTime.tableRows',
    paramKeys: { moduleType: true, drillModule: true, drillMotion: true, page: true, pageSize: true, sorting: true },
  }),
  exportRows: defineEndpoint<HwTimeExportParams, HwTimeTableRow[]>({
    ...common,
    id: 'hwTime.exportRows',
    paramKeys: { moduleType: true, drillModule: true, drillMotion: true, ids: true, sorting: true },
    limits: { maxRows: HW_TIME_MAX_ROWS.export },
  }),
} as const;
