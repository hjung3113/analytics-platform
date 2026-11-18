/** Synthetic Configuration comparison wire contract; domain semantics stay outside the SDK. */
import { defineEndpoint, menuPermission, parseFilterParams, wallClockEpochMs, type GlobalContext, type ColumnFilter, type ColumnFilterSpec, type MatrixNode, type MatrixWindow, type MatrixWindowQuery, type SavedViewSupport } from '@ap/contracts';

export const EQUIPMENT = Array.from({ length: 20 }, (_, index) => `EQ${String(index + 1).padStart(2, '0')}`);
export const DEFAULT_EQUIPMENT = EQUIPMENT.slice(0, 12);
export const DEFAULT_LEVELS = ['module', 'category'];
export const LEVELS = ['module', 'category', 'item', 'filename'].map(id => ({ id, label: id[0].toUpperCase() + id.slice(1) }));
export const STATUS = ['review', 'diff', 'violation', 'missing', 'all'] as const;
export type CompareStatus = typeof STATUS[number];
export type CompareParams = { eq: string[]; mode: 'all' | 'reference'; ref: string; status: CompareStatus; q: string; asOf: 'latest'; coreOnly?: boolean };
export type ValueState = 'equal' | 'diff' | 'violation' | 'missing' | 'not-comparable';
export type ConfigValue = { value: number | string | null; state: ValueState };
export type ConfigRow = {
  id: string; key: string; module: string; category: string; item: string; filename: string; group: string;
  coreKnown: boolean; diff: boolean; violation: boolean; missing: boolean; notComparable: boolean;
  values: Record<string, ConfigValue>; source: string; collectedAt: string; spec?: { min: number; max: number };
};
export type StatusCounts = Record<CompareStatus, number>;
export type TreeRow = MatrixNode & { axis?: string; parentId?: string; differences: number; item?: ConfigRow };
export type PivotParams = CompareParams & { levels: string[]; filters?: ColumnFilter[] };
export type TreeParams = PivotParams & MatrixWindowQuery;
export type PivotColumn = Omit<ConfigRow, 'values'>;
export type PivotRow = { id: string; values: Record<string, ConfigValue> };
export type PivotResult = { over: true; count: number } | { over: false; count: number; columns: PivotColumn[]; rows: PivotRow[] };
// Bound rendered columns for readability because the table does not virtualize them.
export const COLUMN_LIMIT = 200;
export type TreePage = MatrixWindow<TreeRow> & { counts: StatusCounts; totalItems: number; expanded: string[]; firstItem: string | null; sameColumns: string[] };
export type TreeNavigationParams = TreeParams & { focus: string | null; direction: 'previous' | 'next' };
export type TreeNavigation = { focus: string; expanded: string[]; offset: number; ordinal: number; total: number } | null;
export const TREE_WINDOW = 80;
export const ROW_COUNT = 90_000;
export const EXPORT_LIMIT = 10_000;
export const isRowId = (value: string) => /^cfg-\d{6}$/.test(value) && Number(value.slice(4)) < ROW_COUNT;
export const validEquipment = (values: string[]) => values.length >= 2 && values.length <= EQUIPMENT.length && new Set(values).size === values.length && values.every(value => EQUIPMENT.includes(value));
/** Empty strings are deleted by the kernel codec; this token preserves an intentional empty draft. */
export const EMPTY_EQUIPMENT = 'none';
export function equipmentFromKey(raw: string | null) {
  if (raw === null) return DEFAULT_EQUIPMENT;
  if (raw === EMPTY_EQUIPMENT) return [];
  return raw.split(',');
}
export const equipmentToKey = (eq: string[]) => eq.length ? eq.join(',') : EMPTY_EQUIPMENT;
export const validEquipmentKey = (raw: string) => raw === EMPTY_EQUIPMENT || (raw.split(',').every(eq => EQUIPMENT.includes(eq)) && new Set(raw.split(',')).size === raw.split(',').length);
export const validLevels = (levels: string[]) => levels.length > 0 && new Set(levels).size === levels.length && levels.every(level => LEVELS.some(option => option.id === level));

/** Equipment can contain both value types across items; typed fields never coerce a string into a number. */
export function filterDeclarations(equipment: readonly string[]) {
  return [
    ...LEVELS.map(level => ({ ...level, spec: { kind: 'text' as const } })),
    ...equipment.flatMap(eq => [
      { id: `value.${eq}.number`, label: eq, valueKind: 'number' as const, spec: { kind: 'number' as const } },
      { id: `value.${eq}.text`, label: eq, valueKind: 'text' as const, spec: { kind: 'text' as const } },
    ]),
  ];
}
export const filterSpecs = (equipment: readonly string[]): Record<string, ColumnFilterSpec> => Object.fromEntries(filterDeclarations(equipment).map(field => [field.id, field.spec]));
export const readFilters = (values: readonly string[], equipment: readonly string[]) => parseFilterParams(values, filterSpecs(equipment), 'filter');

export const TREND_ITEM_KEY = 'trendItem';
export const HW_TREND_ITEM_KEY = 'hwTrendItem';
export const HW_TREND_CLOSED = 'off';
export const AXIS_KEY = 'axis';
export const EQUIPMENT_AXIS = 'equipment';
export const PAGE_KEYS = [AXIS_KEY, 'equipment', 'mode', 'ref', 'asOf', 'core', 'status', 'q', 'levels', 'filter', 'hideSameCols', TREND_ITEM_KEY, HW_TREND_ITEM_KEY];
export const SAVED_VIEW_SUPPORT: SavedViewSupport = { menuId: 'configuration', menuSchemaVersion: 1, contextKeys: ['time'], pageKeys: PAGE_KEYS };
// The synthetic latest value represents the end-of-period snapshot.
const base = { menuId: 'configuration', permission: menuPermission('analytics:view'), requiresScope: true, context: { time: 'apply' } as const, kinds: ['collection', 'coverage'] as const, mergeTimeDomain: false };
const conditions = { eq: true, mode: true, ref: true, status: true, q: true, asOf: true, coreOnly: true, filters: true, levels: true } as const;
export const configurationPivotEndpoint = defineEndpoint<PivotParams, PivotResult>({ ...base, id: 'configuration.pivot', paramKeys: conditions });
export const configurationTreeEndpoint = defineEndpoint<TreeParams, TreePage>({ ...base, id: 'configuration.tree', paramKeys: { ...conditions, expanded: true, offset: true, limit: true } });
export const configurationTreeNavigationEndpoint = defineEndpoint<TreeNavigationParams, TreeNavigation>({ ...base, id: 'configuration.tree-navigation', paramKeys: { ...configurationTreeEndpoint.paramKeys, focus: true, direction: true } });
export const configurationDetailEndpoint = defineEndpoint<TreeParams & { focus: string }, ConfigRow>({ ...base, id: 'configuration.detail', paramKeys: { ...configurationTreeEndpoint.paramKeys, focus: true } });
export const configurationExportEndpoint = defineEndpoint<TreeParams, ConfigRow[]>({ ...base, id: 'configuration.export', paramKeys: configurationTreeEndpoint.paramKeys, limits: { maxRows: EXPORT_LIMIT } });

export type HistoryParams = { itemId: string; equipment: string[] };
export type HistoryPoint = { at: string; value: number | string | null };
export type ConfigHistory = { item: string; valueType: 'number' | 'string'; series: { equipment: string; points: HistoryPoint[] }[] };

export function historyPeriod({ from, to }: Pick<GlobalContext, 'from' | 'to'>) {
  if (typeof from !== 'string' || typeof to !== 'string') return null;
  const start = wallClockEpochMs(from);
  const end = wallClockEpochMs(to);
  return start !== null && end !== null && start < end ? { from, to, start, end } : null;
}

export const configurationHistoryEndpoint = defineEndpoint<HistoryParams, ConfigHistory>({
  ...base, id: 'configuration.history', paramKeys: { itemId: true, equipment: true },
});
