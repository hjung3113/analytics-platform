/** Client-safe endpoint contracts shared by all four HW Time menus and their mock handlers. */
import { defineEndpoint, menuPermission, type PageQuery, type PageResult, type PageSort } from '@ap/contracts';

export const MODULE_IDS = ['PM1', 'PM2', 'PM3', 'PM4'] as const;
export const MOTION_IDS = ['Chuck', 'Dechuck', 'Pump', 'Vent', 'Transfer'] as const;
export const SUB_ITEM_IDS = ['H1', 'H2', 'H3', 'H4'] as const;

export type ModuleId = typeof MODULE_IDS[number];
export type MotionId = typeof MOTION_IDS[number];
export type SubItemId = typeof SUB_ITEM_IDS[number];
export type HwTimeDrill = { drillModule?: string; drillMotion?: string };
export type HwTimeSeries = { id: string; name: string; color: string };
export type HwTimeRow = {
  id: string;
  equipmentId: string;
  subItem?: SubItemId;
  auxiliary?: { kind: 'MEG'; label: string };
  values: Record<string, number | null>;
  total: number | null;
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
export type HwTimeTableFilter = { drillModule: string; drillMotion: string };
export type HwTimeTableParams = HwTimeTableFilter & PageQuery;
export type HwTimeTableData = PageResult<HwTimeRow>;
export type HwTimeExportParams = HwTimeTableFilter & { ids: string[] | null; sorting: PageSort[] };

export const HW_TIME_UNIT = { ko: '초', en: 's' } as const;
export const HW_TIME_MAX_ROWS = { level: 120, export: 96 } as const;
/** The eight-row cap keeps request URLs short and multi-row trends legible. */
export const HW_TIME_MAX_TREND_ROWS = 8;
export const HW_TIME_ROW_ID_PATTERN = /^EQ-\d{3}\.H[1-4]$/;

export function isHwTimeRowId(value: unknown): value is string {
  return typeof value === 'string' && HW_TIME_ROW_ID_PATTERN.test(value);
}

const PERMISSION = menuPermission('analytics:view');
/** Match the applied Context used by the analytics productivity endpoints. */
export const HW_TIME_CONTEXT = {
  time: 'apply', roomNames: 'apply', condition: 'apply', selection: 'apply', ppid: 'apply', recipe: 'apply',
} as const;
const common = {
  menuId: 'hw-time-steps', permission: PERMISSION, requiresScope: true,
  context: HW_TIME_CONTEXT,
  kinds: ['collection', 'processing_delay', 'coverage'],
  mergeTimeDomain: true,
} as const;

export const hwTime = {
  levelRows: defineEndpoint<HwTimeDrill, HwTimeLevelData>({
    ...common,
    id: 'hwTime.levelRows',
    paramKeys: { drillModule: true, drillMotion: true },
  }),
  trend: defineEndpoint<{ rowIds: string[] }, HwTimeTrendData>({
    ...common,
    id: 'hwTime.trend',
    paramKeys: { rowIds: true },
  }),
  tableRows: defineEndpoint<HwTimeTableParams, HwTimeTableData>({
    ...common,
    id: 'hwTime.tableRows',
    paramKeys: { drillModule: true, drillMotion: true, page: true, pageSize: true, sorting: true },
  }),
  exportRows: defineEndpoint<HwTimeExportParams, HwTimeRow[]>({
    ...common,
    id: 'hwTime.exportRows',
    paramKeys: { drillModule: true, drillMotion: true, ids: true, sorting: true },
    limits: { maxRows: HW_TIME_MAX_ROWS.export },
  }),
} as const;
