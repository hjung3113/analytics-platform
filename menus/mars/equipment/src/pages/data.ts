import { EQUIPMENT_STATUS_VALUES, equipmentFilterSpecs, type Equipment, type EquipmentExportFilter, type EquipmentFilter } from '../endpoints';
import { exportScopeIds, type TableExportRequest } from '@ap/components';
import { parseDateTime, shift, type ColumnFilterSpec } from '@ap/contracts';
export const statusText = {
  active: { ko: '사용중', en: 'Active' }, idle: { ko: '대기', en: 'Idle' },
  maintenance: { ko: '정비', en: 'Maintenance' }, retired: { ko: '사용중지', en: 'Retired' },
};
export const statusTone = { active: 'success', idle: 'neutral', maintenance: 'warning', retired: 'neutral' } as const;
export const fields: { key: keyof Equipment; ko: string; en: string }[] = [
  { key: 'equipmentId', ko: '설비 ID', en: 'Equipment ID' },
  { key: 'room', ko: 'room_name', en: 'room_name' }, { key: 'line', ko: '라인', en: 'Line' },
  { key: 'stgroup', ko: 'StGroup', en: 'StGroup' }, { key: 'team', ko: '분임조', en: 'Team' },
  { key: 'maker', ko: 'Maker', en: 'Maker' }, { key: 'model', ko: 'Model', en: 'Model' },
  { key: 'chamberType', ko: '챔버 유형', en: 'Chamber type' }, { key: 'status', ko: '상태', en: 'Status' },
  { key: 'validFrom', ko: '유효 시작', en: 'Valid from' }, { key: 'validTo', ko: '유효 종료일', en: 'Valid to' },
  { key: 'updatedAt', ko: '변경 시각', en: 'Updated at' }, { key: 'updatedBy', ko: '변경자', en: 'Updated by' },
];
/** Pinned filter fields (ADR-0105, R2): their buttons sit on the filter line even before a condition is set. */
export const pinnedFilterKeys: readonly (keyof Equipment)[] = ['status', 'maker'];
/**
 * Filter fields EquipmentMaster declares (ADR-0104/0105): the wire kind and operators come from `equipmentFilterSpecs` (endpoints.ts), the
 * words from here — 상태 labels per language, Maker options from the makers endpoint (`makers`, the chosen values stay selectable while it loads).
 */
export function columnFilter(key: keyof Equipment, makers: readonly string[] = [], lang: 'ko' | 'en' = 'ko'): ColumnFilterSpec | undefined {
  const wire = equipmentFilterSpecs[key];
  if (!wire || wire.kind !== 'enum') return wire;
  if (key === 'status') return { ...wire, options: EQUIPMENT_STATUS_VALUES.map(value => ({ value, label: statusText[value][lang] })) };
  if (key === 'maker') return { ...wire, options: makers.map(value => ({ value, label: value })) };
  return wire;
}
/** Every filterable field by id: the table's column filters and the URL codec read the same declaration. */
export function filterSpecs(makers: readonly string[], lang: 'ko' | 'en'): Record<string, ColumnFilterSpec> {
  return Object.fromEntries(fields.flatMap(f => { const spec = columnFilter(f.key, makers, lang); return spec ? [[f.key, spec]] : []; }));
}
/** §6.1: sortable columns are exactly the data fields; the synthetic _select/_action columns never join the allow-list. */
export const sortFields: readonly (keyof Equipment)[] = fields.map(f => f.key);
export function validity(e: Equipment) {
  const durationHours = e.validTo ? (parseDateTime(e.validTo, 'validTo').getTime() - parseDateTime(e.validFrom, 'validFrom').getTime()) / 3_600_000 : 24 * 60;
  const changedAt = shift(e.validFrom, Math.min(24 * 30, Math.floor(durationHours / 2)));
  return [
    { from: e.validFrom, to: changedAt, chamberType: `${e.chamberType}-V1` },
    { from: changedAt, to: e.validTo, chamberType: e.chamberType },
  ];
}

/** Table-owned export params (#173): the quick search, the selection ids (`null` = every filtered row) and the table's active sort. */
export function exportParams(
  { q }: EquipmentFilter,
  request: TableExportRequest,
): EquipmentExportFilter {
  const scope = exportScopeIds(request.scope);
  const selection = scope.mode === 'all-except' ? { ids: null, excludedIds: scope.excludedIds } : { ids: scope.ids };
  return { q, ...selection, sorting: request.sorting, ...(request.filters ? { filters: request.filters } : {}) };
}

/** Readable page filter for the XLSX 조회 정보 sheet (#173 review P2-3); an unset search is omitted. Conditions are listed by the table itself (`필터 · <label>`). */
export function exportFilterSummary({ q }: EquipmentFilter, lang: 'ko' | 'en'): [string, string][] {
  return q ? [[lang === 'ko' ? '검색어' : 'Search', q]] : [];
}
