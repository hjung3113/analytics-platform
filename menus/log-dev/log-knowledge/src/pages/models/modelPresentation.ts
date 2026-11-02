/**
 * Pure rules of the model explore and profile screens (#1197 s1): the default filter, the process badge split and the date text.
 * No React, so they are unit-tested without a DOM.
 */
import { encodeFilterParams, formatInstant } from '@ap/contracts';
import { ACTIVE_ONLY } from '../catalogModel';

/** A bare address opens the table with the 활성 filter pinned (the same default as the catalog) and the default sort 모델명. */
export const DEFAULT_SORT = { id: 'name', desc: false } as const;
export const defaultExploreFilter = (): string[] => encodeFilterParams([ACTIVE_ONLY]);

/** The row shows at most two process badges; the rest are a `+N` that names them. */
export const PROCESS_BADGES_MAX = 2;
export function splitProcesses<T>(processes: readonly T[]): { shown: T[]; hidden: T[] } {
  return { shown: processes.slice(0, PROCESS_BADGES_MAX), hidden: processes.slice(PROCESS_BADGES_MAX) };
}

export const statusText = (active: boolean): string => (active ? '활성' : '비활성');
/** An ISO instant in the viewer's zone through the kernel formatter (06 kernel §6.3); `timeZone` is injectable for tests. */
export const instantText = (iso: string, timeZone?: string): string => formatInstant(iso, 'ko', timeZone);
export const SOFTWARE_LIST_NOTE = '최근 500개만 표시';
/** The catalog's page keys for 「SW 버전 추가」: its SW 버전 tab narrowed to this model, active rows like every tab entry. */
export const softwareTabPage = (modelId: string): Record<string, string | string[]> => ({
  tab: 'software', filter: encodeFilterParams([ACTIVE_ONLY, { id: 'modelId', op: 'in', value: [modelId] }]),
});
