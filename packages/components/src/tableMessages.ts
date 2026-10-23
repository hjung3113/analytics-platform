import { CONTEXT_LABELS, labelledCondition } from '@ap/kernel';
import type { ApiResponse, Capability, ContextKey, EquipmentAxisDescriptor, GlobalContext, Trust } from '@ap/contracts';

/** Pure wording and formatting for the table's export/copy (#173, #174): no React, no state. */
type Lang = 'ko' | 'en';

/** Export refusal copy per outcome (#173, 06 §26 원인/행동): every refusal names a next action; no specific cause is claimed the server did not state. */
export const EXPORT_REFUSAL: Record<'forbidden' | 'too_large' | 'error' | 'timeout', { ko: string; en: string }> = {
  forbidden: { ko: '서버가 이 조건의 내보내기를 거부했습니다. 현재 Scope와 접근 권한을 확인하세요.', en: 'The server rejected the export for this context. Check the current scope and your access rights.' },
  too_large: { ko: '내보내기 결과가 내보내기 상한을 넘었습니다. 필터를 좁혀 주세요.', en: 'The export result is over the export limit. Narrow the filter.' },
  timeout: { ko: '내보내기 요청이 시간 초과되었습니다. 다시 시도해 주세요.', en: 'The export request timed out. Please try again.' },
  error: { ko: '내보내기를 수행하지 못했습니다. 다시 시도하고, 반복되면 관리자에게 문의하세요.', en: 'The export could not be completed. Try again, and contact the administrator if it keeps failing.' },
};
/** Defensive client cap only: the server's declared `limits.maxRows` (#175) is the real guard — this one fires after the rows already arrived. */
export const EXPORT_ROW_CAP = 100_000;
export type ExportFormat = 'xlsx' | 'csv';
export type ExportScopeKind = 'selected' | 'filtered';
/** Export target wording (toolbar D, #172): one source for the menu group labels, item names and toasts. `count === null` = no usable total (no `ok` result yet). */
export function exportTarget(kind: ExportScopeKind, count: number | null, lang: Lang): string {
  if (lang === 'ko') return kind === 'selected' ? `선택 ${count}행` : count === null ? '필터 결과 전체' : `필터 결과 전체 ${count}행`;
  const rows = count !== null && count === 1 ? 'row' : 'rows';
  return kind === 'selected' ? `${count} selected ${rows}` : count === null ? 'all filtered rows' : `all ${count} filtered ${rows}`;
}
export const FORMAT_LABEL: Record<ExportFormat, string> = { xlsx: 'Excel (.xlsx)', csv: 'CSV' };
/** Korean object particle for the export target (three wording sites keep it in lockstep): “선택 3행**을**”, “필터 결과 전체**를**”. */
export const objectParticle = (target: string) => (target.endsWith('행') ? '을' : '를');
/** Menu item accessible name carries its target: "선택 3행을 Excel(.xlsx)로 내보내기" / "Export 3 selected rows as Excel (.xlsx)". */
export function exportItemName(kind: ExportScopeKind, count: number | null, format: ExportFormat, lang: Lang): string {
  const target = exportTarget(kind, count, lang);
  return lang === 'ko'
    ? `${target}${objectParticle(target)} ${format === 'xlsx' ? 'Excel(.xlsx)' : 'CSV'}로 내보내기`
    : `Export ${target} as ${FORMAT_LABEL[format]}`;
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
  const file = format === 'xlsx' ? 'Excel' : 'CSV';
  return lang === 'ko' ? `${startTarget}${objectParticle(startTarget)} ${file} 파일로 준비 중입니다` : `Preparing ${startTarget} as ${format === 'xlsx' ? 'an Excel' : 'a CSV'} file`;
}
/** A selection that lost rows between the gesture and the server read (shared by export and copy). */
export function selectionShortNote(wanted: number, received: number, lang: Lang): string {
  const missing = wanted - received;
  return lang === 'ko' ? `선택 ${wanted}행 중 ${received}행 — ${missing}행은 현재 결과에 없음` : `${received} of ${wanted} selected rows — ${missing} ${missing === 1 ? 'row is' : 'rows are'} not in the current results`;
}
export const exportRowCapNote = (lang: Lang) => lang === 'ko' ? `받은 행이 ${EXPORT_ROW_CAP.toLocaleString('ko-KR')}행을 넘어 파일을 만들지 않습니다. 필터를 좁혀 주세요.` : `More than ${EXPORT_ROW_CAP.toLocaleString('en-US')} rows arrived; no file was built. Narrow the filter.`;
export const copyRowCapNote = (lang: Lang) => lang === 'ko' ? `받은 행이 ${EXPORT_ROW_CAP.toLocaleString('ko-KR')}행을 넘어 복사하지 않습니다. 선택을 줄여 주세요.` : `More than ${EXPORT_ROW_CAP.toLocaleString('en-US')} rows arrived; nothing was copied. Select fewer rows.`;
export function exportDoneText(target: string, format: ExportFormat, lang: Lang): string {
  const file = format === 'xlsx' ? 'Excel' : 'CSV';
  return lang === 'ko' ? `${target}${objectParticle(target)} ${file} 파일로 내보냈습니다` : `Exported ${target} to ${format === 'xlsx' ? 'an' : 'a'} ${file} file`;
}
/** Provisional responses (#173 review P2-2): CSV has no trust sheet, so the toast carries the data-through time — never `updatedAt`; an unknown data-through is said to be unknown. */
export function provisionalSuffix(trust: Trust | null | undefined, lang: Lang): string {
  return trust?.provisional
    ? (lang === 'ko'
        ? ` — 잠정 데이터(${trust.dataThrough ? `데이터 기준 시각 ${trust.dataThrough.replace('T', ' ').slice(0, 16)}` : '기준 시각 미확인'})`
        : ` — provisional data (${trust.dataThrough ? `data through ${trust.dataThrough.replace('T', ' ').slice(0, 16)}` : 'data-through unknown'})`)
    : '';
}

/** Row copy (#174) wording. */
export const copyTargetText = (count: number, lang: Lang) => exportTarget('selected', count, lang);
export const copiedText = (count: number, lang: Lang) => lang === 'ko'
  ? `${copyTargetText(count, lang)}${objectParticle(copyTargetText(count, lang))} 복사했습니다 — 엑셀에 붙여넣을 수 있습니다`
  : `Copied ${copyTargetText(count, lang)} — you can paste them into Excel`;
export const copyingNote = (count: number, lang: Lang) => lang === 'ko' ? `${copyTargetText(count, lang)}${objectParticle(copyTargetText(count, lang))} 복사하는 중입니다` : `Copying ${copyTargetText(count, lang)}`;
/** 06 §26 cause/action per failure (review P3-3): a real clipboard rejection names the permission. */
export function clipboardFailure(error: unknown, lang: Lang): string {
  // DOMException (NotAllowedError…) is not an Error subclass everywhere: read its message structurally.
  const message = (error as { message?: unknown } | null)?.message;
  const reason = typeof message === 'string' && message ? message : String(error);
  return lang === 'ko' ? `클립보드에 복사하지 못했습니다(${reason}). 브라우저의 클립보드 권한을 확인하고 다시 시도하세요.` : `Could not copy to the clipboard (${reason}). Check the browser's clipboard permission and try again.`;
}
export const copyUnavailable = (lang: Lang) => lang === 'ko' ? '이 환경에서는 복사할 수 없습니다 — 내보내기(CSV·Excel)를 쓰세요' : 'Copying is not available in this environment — use Export (CSV · Excel) instead';
export const noSelectedOnPage = (lang: Lang) => lang === 'ko' ? '현재 페이지에 선택한 행이 없어 복사하지 못했습니다. 선택한 행이 있는 페이지로 이동해 다시 시도하세요.' : 'No selected row is on this page, so nothing was copied. Go to a page with selected rows and try again.';
export const loadedRowsOnlyNote = (loaded: number, lang: Lang) => lang === 'ko' ? `이 환경에서는 현재 페이지에 보이는 선택 ${loaded}행만 복사됩니다` : `In this environment only the ${loaded} selected ${loaded === 1 ? 'row' : 'rows'} visible on this page ${loaded === 1 ? 'is' : 'are'} copied`;

/** 조회 정보 (#173 review P2-3): id sets render as count + leading ids; the explicit empty set is shown, never folded into “all”. */
const CONTEXT_ID_LIMIT = 10;
export const INFO_LABELS = {
  ko: { menu: '메뉴', target: '대상', exportedAt: '내보낸 시각', period: '기간', updatedAt: '갱신 시각', dataThrough: '데이터 기준 시각', coverage: '커버리지', metricVersion: '지표 버전', provisional: '잠정 여부', provisionalYes: '잠정', provisionalNo: '확정', source: '원천' },
  en: { menu: 'Menu', target: 'Target', exportedAt: 'Exported at', period: 'Period', updatedAt: 'Updated at', dataThrough: 'Data through', coverage: 'Coverage', metricVersion: 'Metric version', provisional: 'Provisional', provisionalYes: 'Provisional', provisionalNo: 'Final', source: 'Source' },
} as const;
// Global id sets count ids (“N개” / “N ids”), not exported rows — “행” stays for table rows (#173 review N-P3-6).
const EXPLICIT_EMPTY = { ko: '(빈 선택)', en: '(empty selection)' } as const;
export function idSetValue(ids: string[], lang: Lang): string {
  const count = lang === 'ko' ? `${ids.length}개` : `${ids.length} ${ids.length === 1 ? 'id' : 'ids'}`;
  if (ids.length === 0) return `${count} ${EXPLICIT_EMPTY[lang]}`;
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
  if (applied('roomNames') && global.roomNames !== null) rows.push([CONTEXT_LABELS.roomNames[lang], global.roomNames.length > 0 ? global.roomNames.join(', ') : EXPLICIT_EMPTY[lang]]);
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
