import { sortAndPage, type ApiResponse, type PageQuery, type PageResult, type PageSort } from '@ap/contracts';
import { HW_TIME_UNIT, MODULE_IDS, MOTION_IDS, type HwTimeDrill, type HwTimeLevelData, type HwTimeRow } from '../../endpoints';
import { formatSeconds, missingText } from '../../shared/format';

export type TableLevel = 0 | 1 | 2;
export type TableExportRequest = { scope: { kind: 'selected'; ids: string[] } | { kind: 'filtered' }; sorting: PageSort[] };

/** The columns a row field can be sorted by on the server; series columns read `values[id]`, which the endpoints do not sort. */
export const SORT_FIELDS = ['equipmentId', 'subItem', 'total'] as const;

export const levelOf = (module: string | null, motion: string | null): TableLevel => (module === null ? 0 : motion === null ? 1 : 2);

/** The series shown as columns: Module at L1, Motion at L2, the chosen Motion alone at L3. */
export function seriesIds(level: TableLevel, motion: string | null): readonly string[] {
  return level === 0 ? MODULE_IDS : level === 1 ? MOTION_IDS : motion ? [motion] : [];
}

export const drillParams = (module: string | null, motion: string | null): HwTimeDrill => ({
  ...(module ? { drillModule: module } : {}), ...(module && motion ? { drillMotion: motion } : {}),
});

/** The rows the table lists at a level. L3 detail rows come from `hwTime.tableRows`; L1/L2 have no paged endpoint, so the level response is sorted and paged here. */
export function levelRowsOf(data: HwTimeLevelData): HwTimeRow[] {
  return data.level === 2 ? data.detail?.rows ?? [] : data.rows;
}

export function pageOfLevel(response: ApiResponse<HwTimeLevelData>, query: PageQuery): ApiResponse<PageResult<HwTimeRow>> {
  return { ...response, data: response.data ? sortAndPage(levelRowsOf(response.data), query) : null };
}

/** The unit the export file carries; the cell shows the value, the column header names the unit. */
export const unitOf = (lang: 'ko' | 'en') => HW_TIME_UNIT[lang];

export function valueText(value: number | null | undefined, lang: 'ko' | 'en'): string {
  return value === null || value === undefined ? missingText(lang) : formatSeconds(value);
}

/** MEG rows show their label in the sub-item cell, two decimals and the unit like the stack bars. */
export function auxiliaryText(row: HwTimeRow, lang: 'ko' | 'en'): string {
  const seconds = Number(/-?\d+(?:\.\d+)?\s*$/.exec(row.auxiliary?.label ?? '')?.[0]);
  return `${row.auxiliary?.kind ?? ''}${Number.isFinite(seconds) ? ` ${formatSeconds(seconds)} ${unitOf(lang)}` : ''}`;
}

export function exportParams(drill: { drillModule: string; drillMotion: string }, request: TableExportRequest) {
  return { ...drill, ids: request.scope.kind === 'selected' ? request.scope.ids : null, sorting: request.sorting };
}

/** Readable page filters for the 조회 정보 sheet. */
export function exportFilterSummary(module: string, motion: string, ko: boolean): [string, string][] {
  return [['Module', module], [ko ? 'Motion' : 'Motion', motion]];
}
