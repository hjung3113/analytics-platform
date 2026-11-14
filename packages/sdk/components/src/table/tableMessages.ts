import { CONTEXT_LABELS, formatText, labelledCondition, type Lang } from '@ap/kernel';
import { formatNumber, type ApiResponse, type Capability, type ContextKey, type EquipmentAxisDescriptor, type GlobalContext, type Trust } from '@ap/contracts';
import { COMPONENTS_MESSAGES } from '../messages';
import { trustInstantText } from '../state/trustFormat';

/** Pure wording and formatting for the table's export/copy (#173, #174): no React, no state. */

/** Export refusal copy per outcome (#173, 06 §26 원인/행동): every refusal names a next action; no specific cause is claimed the server did not state. */
export const EXPORT_REFUSAL = {
  forbidden: COMPONENTS_MESSAGES.tableExportRefusalForbidden,
  too_large: COMPONENTS_MESSAGES.tableExportRefusalTooLarge,
  timeout: COMPONENTS_MESSAGES.tableExportRefusalTimeout,
  error: COMPONENTS_MESSAGES.tableExportRefusalError,
} as const;
/** Defensive client cap only: the server's declared `limits.maxRows` (#175) is the real guard — this one fires after the rows already arrived. */
export const EXPORT_ROW_CAP = 100_000;
export type ExportFormat = 'xlsx' | 'csv';
export type ExportScopeKind = 'selected' | 'filtered';
/** Export target wording (toolbar D, #172): one source for the menu group labels, item names and toasts. `count === null` = no usable total (no `ok` result yet). */
export function exportTarget(kind: ExportScopeKind, count: number | null, lang: Lang): string {
  if (kind !== 'selected' && count === null) return formatText(COMPONENTS_MESSAGES.tableExportTargetAllFiltered, lang);
  const key = kind === 'selected'
    ? (count === 1 ? COMPONENTS_MESSAGES.tableExportTargetSelectedOne : COMPONENTS_MESSAGES.tableExportTargetSelectedMany)
    : (count === 1 ? COMPONENTS_MESSAGES.tableExportTargetFilteredOne : COMPONENTS_MESSAGES.tableExportTargetFilteredMany);
  return formatText(key, lang, { count: String(count) });
}
export const FORMAT_LABEL: Record<ExportFormat, string> = { xlsx: 'Excel (.xlsx)', csv: 'CSV' };
/** Korean object particle for the export target (three wording sites keep it in lockstep): “선택 3행**을**”, “필터 결과 전체**를**”. */
export const objectParticle = (target: string) => (target.endsWith('행') ? '을' : '를');
// eslint-disable-next-line ap/no-lang-copy-ternary -- grammar, not copy: Korean object particle (을/를)
const koParticle = (target: string, lang: Lang) => (lang === 'ko' ? objectParticle(target) : '');
/** Menu item accessible name carries its target: "선택 3행을 Excel(.xlsx)로 내보내기" / "Export 3 selected rows as Excel (.xlsx)". */
export function exportItemName(kind: ExportScopeKind, count: number | null, format: ExportFormat, lang: Lang): string {
  const target = exportTarget(kind, count, lang);
  return formatText(format === 'xlsx' ? COMPONENTS_MESSAGES.tableExportItemXlsx : COMPONENTS_MESSAGES.tableExportItemCsv, lang, {
    target,
    particle: koParticle(target, lang),
  });
}

/** Toast body for a refused export/copy: the cause and next action only; the server message and correlationId stay as named detail (06 §26 원인/행동 + #304 F2). */
export function exportRefusal(outcome: keyof typeof EXPORT_REFUSAL, response: ApiResponse<unknown>, lang: Lang): { text: string; detail?: string } {
  // 06 §26 원인/행동 + #304 F2: the toast body names the cause and next action only; the server message and
  // correlationId stay as named detail (the shell draws it like StateMessage's 서버 세부) — never deleted.
  const correlation = outcome === 'error' && response.correlationId ? `correlationId: ${response.correlationId}` : null;
  const message = outcome === 'error' && response.message ? response.message : null;
  const detail = message !== null && correlation !== null ? `${message} (${correlation})` : message ?? correlation ?? undefined;
  return { text: EXPORT_REFUSAL[outcome][lang], detail };
}

/** “Preparing” announcement next to the export trigger (#173 UX P2-3). */
export function exportPreparingNote(startTarget: string, format: ExportFormat, lang: Lang): string {
  return formatText(format === 'xlsx' ? COMPONENTS_MESSAGES.tableExportPreparingXlsx : COMPONENTS_MESSAGES.tableExportPreparingCsv, lang, {
    target: startTarget,
    particle: koParticle(startTarget, lang),
  });
}
/** A selection that lost rows between the gesture and the server read (shared by export and copy). */
export function selectionShortNote(wanted: number, received: number, lang: Lang): string {
  const missing = wanted - received;
  return formatText(missing === 1 ? COMPONENTS_MESSAGES.tableSelectionShortOne : COMPONENTS_MESSAGES.tableSelectionShortMany, lang, { wanted, received, missing });
}
export const exportRowCapNote = (lang: Lang) => formatText(COMPONENTS_MESSAGES.tableExportRowCapNote, lang, { cap: formatNumber(EXPORT_ROW_CAP, lang) });
export const copyRowCapNote = (lang: Lang) => formatText(COMPONENTS_MESSAGES.tableCopyRowCapNote, lang, { cap: formatNumber(EXPORT_ROW_CAP, lang) });
export function exportDoneText(target: string, format: ExportFormat, lang: Lang): string {
  return formatText(format === 'xlsx' ? COMPONENTS_MESSAGES.tableExportDoneXlsx : COMPONENTS_MESSAGES.tableExportDoneCsv, lang, {
    target,
    particle: koParticle(target, lang),
  });
}
/** Provisional responses (#173 review P2-2): CSV has no trust sheet, so the toast carries the data-through time — never `updatedAt`; an unknown data-through is said to be unknown. */
export function provisionalSuffix(trust: Trust | null | undefined, lang: Lang): string {
  if (!trust?.provisional) return '';
  return trust.dataThrough
    ? formatText(COMPONENTS_MESSAGES.tableProvisionalWithTime, lang, { time: trustInstantText(trust.dataThrough, lang, 'minute') })
    : formatText(COMPONENTS_MESSAGES.tableProvisionalUnknownTime, lang);
}

/** Row copy (#174) wording. */
export const copyTargetText = (count: number, lang: Lang) => exportTarget('selected', count, lang);
export const copiedText = (count: number, lang: Lang) => {
  const target = copyTargetText(count, lang);
  return formatText(COMPONENTS_MESSAGES.tableCopiedText, lang, { target, particle: koParticle(target, lang) });
};
export const copyingNote = (count: number, lang: Lang) => {
  const target = copyTargetText(count, lang);
  return formatText(COMPONENTS_MESSAGES.tableCopyingNote, lang, { target, particle: koParticle(target, lang) });
};
/** 06 §26 cause/action per failure (review P3-3): a real clipboard rejection names the permission. */
export function clipboardFailure(error: unknown, lang: Lang): string {
  // DOMException (NotAllowedError…) is not an Error subclass everywhere: read its message structurally.
  const message = (error as { message?: unknown } | null)?.message;
  const reason = typeof message === 'string' && message ? message : String(error);
  return formatText(COMPONENTS_MESSAGES.tableClipboardFailure, lang, { reason });
}
export const copyUnavailable = (lang: Lang) => formatText(COMPONENTS_MESSAGES.tableCopyUnavailable, lang);
export const noSelectedOnPage = (lang: Lang) => formatText(COMPONENTS_MESSAGES.tableNoSelectedOnPage, lang);
export const loadedRowsOnlyNote = (loaded: number, lang: Lang) =>
  formatText(loaded === 1 ? COMPONENTS_MESSAGES.tableLoadedRowsOnlyOne : COMPONENTS_MESSAGES.tableLoadedRowsOnlyMany, lang, { count: loaded });

/** 조회 정보 (#173 review P2-3): id sets render as count + leading ids; the explicit empty set is shown, never folded into “all”. */
const CONTEXT_ID_LIMIT = 10;
// Global id sets count ids (“N개” / “N ids”), not exported rows — “행” stays for table rows (#173 review N-P3-6).
export function idSetValue(ids: string[], lang: Lang): string {
  const count = formatText(ids.length === 1 ? COMPONENTS_MESSAGES.tableIdCountOne : COMPONENTS_MESSAGES.tableIdCountMany, lang, { count: ids.length });
  if (ids.length === 0) return `${count} ${formatText(COMPONENTS_MESSAGES.tableExplicitEmpty, lang)}`;
  const head = ids.slice(0, CONTEXT_ID_LIMIT).join(', ');
  return ids.length > CONTEXT_ID_LIMIT ? `${count}: ${head} …` : `${count}: ${head}`;
}
/**
 * Applied global Context keys of this menu, rendered readably (the GlobalContextBar vocabulary). Limited to keys the
 * menu's manifest applies; absent keys are omitted as whole rows — never invented.
 */
export function globalContextRows(global: GlobalContext, context: Readonly<Partial<Record<ContextKey, Capability>>>, lang: Lang, axes: readonly EquipmentAxisDescriptor[], asOf: string): [string, string][] {
  const applied = (key: ContextKey) => context[key] === 'apply';
  const rows: [string, string][] = [];
  if (applied('roomNames') && global.roomNames !== null) rows.push([CONTEXT_LABELS.roomNames[lang], global.roomNames.length > 0 ? global.roomNames.join(', ') : formatText(COMPONENTS_MESSAGES.tableExplicitEmpty, lang)]);
  if (applied('line') && global.lineNames !== null) rows.push([CONTEXT_LABELS.line[lang], idSetValue(global.lineNames, lang)]);
  if (applied('prcGroup') && global.prcGroups !== null) rows.push([CONTEXT_LABELS.prcGroup[lang], idSetValue(global.prcGroups, lang) + (global.membershipBasis === 'asOf' ? ` · ${asOf}` : '')]);
  if (applied('condition') && global.condition !== null) rows.push([CONTEXT_LABELS.condition[lang], labelledCondition(global.condition, axes, lang) + (global.membershipBasis === 'asOf' ? ` · ${asOf}` : '')]);
  if (applied('selection') && global.selection !== null) rows.push([CONTEXT_LABELS.selection[lang], idSetValue(global.selection, lang)]);
  if (applied('lot') && global.lotIds !== null) rows.push([CONTEXT_LABELS.lot[lang], idSetValue(global.lotIds, lang)]);
  if (applied('ppid') && global.ppid !== null) rows.push([CONTEXT_LABELS.ppid[lang], global.ppid]);
  if (applied('recipe') && global.recipeIds !== null) rows.push([CONTEXT_LABELS.recipe[lang], idSetValue(global.recipeIds, lang)]);
  if (applied('metric') && global.metricId !== null) rows.push([CONTEXT_LABELS.metric[lang], global.metricVersion !== null ? `${global.metricId} v${global.metricVersion}` : global.metricId]);
  return rows;
}
