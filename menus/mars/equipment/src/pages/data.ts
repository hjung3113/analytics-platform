import type { Equipment, EquipmentExportFilter, EquipmentFilter } from '../endpoints';
import { parseDateTime, shift, type ColumnFilter, type ColumnFilterSpec, type PageSort } from '@ap/contracts';
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
/** Column filters EquipmentMaster opts in to (#556b): enum status, text model, wall-clock date validity columns. */
export function columnFilter(key: keyof Equipment, lang: 'ko' | 'en'): ColumnFilterSpec | undefined {
  if (key === 'status') return { kind: 'enum', options: (Object.keys(statusText) as Equipment['status'][]).map(value => ({ value, label: statusText[value][lang] })) };
  if (key === 'model' || key === 'updatedBy') return { kind: 'text' };
  if (key === 'validFrom' || key === 'validTo') return { kind: 'date' };
  return undefined;
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

/** Table-owned export params (#173): the page filters, the selection ids (`null` = every filtered row) and the table's active sort. */
export function exportParams(
  { q, status, maker }: EquipmentFilter,
  request: { scope: { kind: 'selected'; ids: string[] } | { kind: 'filtered' }; sorting: PageSort[]; filters?: ColumnFilter[] },
): EquipmentExportFilter {
  return { q, status, maker, ids: request.scope.kind === 'selected' ? request.scope.ids : null, sorting: request.sorting, ...(request.filters ? { filters: request.filters } : {}) };
}

/** Readable page filters for the XLSX 조회 정보 sheet (#173 review P2-3); unset filters are omitted. */
export function exportFilterSummary({ q, status, maker }: EquipmentFilter, lang: 'ko' | 'en'): [string, string][] {
  const rows: [string, string][] = [];
  if (q) rows.push([lang === 'ko' ? '검색어' : 'Search', q]);
  if (status && status in statusText) rows.push([lang === 'ko' ? '상태' : 'Status', statusText[status as Equipment['status']][lang]]);
  if (maker) rows.push(['Maker', maker]);
  return rows;
}
