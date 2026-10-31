import { exportScopeIds, type TableExportRequest } from '@ap/components';
import { HW_TIME_UNIT, MODULE_IDS, MOTION_IDS, type HwTimeDrill, type HwTimeLevelData, type HwTimeRow } from '../../endpoints';
import { formatSeconds, missingText } from '../../shared/format';

export type TableLevel = 0 | 1 | 2;

/** The columns the server sorts by; a series column sorts the flat field of the same id on the table row. */
export const SORT_FIELDS = ['equipmentId', 'subItem', ...MODULE_IDS, ...MOTION_IDS, 'total'] as const;

export const levelOf = (module: string | null, motion: string | null): TableLevel => (module === null ? 0 : motion === null ? 1 : 2);

/** The series shown as columns: Module at L1, Motion at L2, the chosen Motion alone at L3. */
export function seriesIds(level: TableLevel, motion: string | null): readonly string[] {
  return level === 0 ? MODULE_IDS : level === 1 ? MOTION_IDS : motion ? [motion] : [];
}

export const drillParams = (module: string | null, motion: string | null): HwTimeDrill => ({
  ...(module ? { drillModule: module } : {}), ...(module && motion ? { drillMotion: motion } : {}),
});

/** The rows the level response lists, for the empty/partial states and the drawer's row. */
export function levelRowsOf(data: HwTimeLevelData): HwTimeRow[] {
  return data.level === 2 ? data.detail?.rows ?? [] : data.rows;
}

/** The unit the export file carries; the cell shows the value, the column header names the unit. */
export const unitOf = (lang: 'ko' | 'en') => HW_TIME_UNIT[lang];

/**
 * Column widths (px) by level: every column is sized so L1/L2 show 합계 at 1440 wide without a horizontal scroll while the drawer is closed.
 * L1 has only four value columns, so they get room for a four-digit value with two decimals on one line; L2/L3 keep the narrower sizes.
 */
export const columnSizeOf = (level: number) => level === 0
  ? { equipmentId: 128, subItem: 88, value: 124, total: 124 } as const
  : { equipmentId: 112, subItem: 88, value: 100, total: 112 } as const;

/** What an export file carries for a value: two decimals like the screen (no float noise), `미측정` for a missing one. */
export const exportNumber = (value: number | null | undefined, lang: 'ko' | 'en'): number | string => value === null || value === undefined ? missingText(lang) : Number(value.toFixed(2));

export function valueText(value: number | null | undefined, lang: 'ko' | 'en'): string {
  return value === null || value === undefined ? missingText(lang) : formatSeconds(value);
}

/** MEG rows show their label in the sub-item cell, two decimals and the unit like the stack bars. */
export function auxiliaryText(row: HwTimeRow, lang: 'ko' | 'en'): string {
  const seconds = Number(/-?\d+(?:\.\d+)?\s*$/.exec(row.auxiliary?.label ?? '')?.[0]);
  return `${row.auxiliary?.kind ?? ''}${Number.isFinite(seconds) ? ` ${formatSeconds(seconds)} ${unitOf(lang)}` : ''}`;
}

export function exportParams(drill: HwTimeDrill, request: TableExportRequest) {
  const scope = exportScopeIds(request.scope);
  // This table does not enable selectAllResults: an `all` scope would export the excluded rows, so it is refused.
  if (scope.mode === 'all-except') throw new Error('select-all export scope is not supported by this table');
  return { ...drill, ids: scope.ids, sorting: request.sorting };
}

/** Readable page filters for the 조회 정보 sheet. */
export function exportFilterSummary(module: string | null, motion: string | null, ko: boolean): [string, string][] {
  return [['Module', module ?? (ko ? '전체' : 'All')], ['Motion', motion ?? (ko ? '전체' : 'All')]];
}
