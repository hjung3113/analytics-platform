import { formatPeriod, type ApprovalRequestInfo as StoredApprovalRequest, type ChangeLine, type Result, type SavedView, type ViewApproval, type ViewVisibility } from '@ap/contracts';
import type { DiagnoseReason, Text } from '@ap/kernel';

/** What `diagnoseSavedView` found for one entry; its result is passed in as it is. A plain string is shown as written. */
export type ViewDiagnosis = {
  status: 'ok' | 'stale' | 'denied';
  reasons: readonly (DiagnoseReason | string)[];
  /** A meaning-preserving upgrade; the preview is shown before the user confirms. Absent = re-select with the stored condition kept. */
  migration?: { preview: readonly ChangeLine[] };
};

/** The pending application behind an approval state (the contract's request without its view id, which the caller keys by). */
export type ApprovalRequestInfo = Omit<StoredApprovalRequest, 'viewId'>;

export type ViewActionOutcome = Result<unknown>;
export type ViewDecideHandler = (id: string, decision: 'approve' | 'reject', note: string | undefined, expectedVersion: number) => Promise<ViewActionOutcome>;
export type ViewRevokeHandler = (id: string, expectedVersion: number) => Promise<ViewActionOutcome>;

const KST = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
/** Wall-clock time of the platform (KST), the default when the caller gives no formatter. */
export const formatKst = (ms: number): string => KST.format(new Date(ms));

export const APPROVAL_LABEL: Record<ViewApproval, Text> = {
  none: { ko: '신청 없음', en: 'Not requested' },
  pending: { ko: '승인 대기', en: 'Awaiting approval' },
  approved: { ko: '승인됨', en: 'Approved' },
  rejected: { ko: '반려됨', en: 'Rejected' },
};
export const APPROVAL_TONE = { none: 'neutral', pending: 'warning', approved: 'success', rejected: 'danger' } as const;

/** The user-facing sentence for one Kernel reason; `denied` carries the store's own wording, and a key is data shown as is. */
export function reasonText(reason: DiagnoseReason | string, tx: (text: Text) => string): string {
  if (typeof reason === 'string') return reason;
  const key = reason.key ?? '';
  switch (reason.code) {
    case 'denied': return reason.message ?? tx({ ko: '이 뷰를 볼 권한이 없습니다.', en: 'You cannot view this.' });
    case 'menu-mismatch': return tx({ ko: `다른 메뉴(${key})에서 저장한 뷰입니다.`, en: `Saved in another menu (${key}).` });
    case 'stale-context-key': return tx({ ko: `더 이상 지원하지 않는 조건이 저장되어 있습니다: ${key}`, en: `A condition that is no longer supported was saved: ${key}` });
    case 'stale-page-key': return tx({ ko: `더 이상 지원하지 않는 화면 설정이 저장되어 있습니다: ${key}`, en: `A page setting that is no longer supported was saved: ${key}` });
    case 'menu-schema-version': return tx({ ko: '메뉴 화면 버전이 올라갔습니다.', en: 'The menu view version has moved on.' });
    case 'metric-version': return tx({ ko: '지표 버전이 올라갔습니다.', en: 'The metric version has moved on.' });
    case 'unknown-axis': return tx({ ko: `없어진 조건 축이 저장되어 있습니다: ${key}`, en: `A condition axis that no longer exists was saved: ${key}` });
    case 'invalid-selection': return tx({ ko: `더 이상 찾을 수 없는 선택이 있습니다: ${key}`, en: `A selection that can no longer be found: ${key}` });
    case 'migration-unavailable': return tx({ ko: '자동으로 옮길 방법이 없습니다.', en: 'There is no automatic way to move it.' });
  }
}

export function visibilityText(visibility: ViewVisibility, tx: (text: Text) => string): string {
  switch (visibility.kind) {
    case 'private': return tx({ ko: '나만', en: 'Only me' });
    case 'people': return tx({ ko: `사람 지정 ${visibility.userIds.length}명`, en: `${visibility.userIds.length} people` });
    case 'groups': return tx({ ko: `그룹 ${visibility.groupIds.length}개`, en: `${visibility.groupIds.length} groups` });
    case 'official': return tx({ ko: '공식', en: 'Official' });
  }
}

/** A fixed period reads by the common rule; a stored value that is not a valid wall-clock time is shown as written. */
function fixedPeriod(from: string | null | undefined, to: string | null | undefined, lang: 'ko' | 'en'): string {
  try { return formatPeriod(from ?? null, to ?? null, lang); } catch { return `${from ?? '—'} → ${to ?? '—'}`; }
}

/** One short line per saved part; a relative period and an absolute one read differently. Never lists master values. */
export function contentLines(view: SavedView, tx: (text: Text) => string, lang: 'ko' | 'en'): string[] {
  const lines = [view.kind === 'menu-view' ? tx({ ko: '메뉴 화면', en: 'Menu view' }) : tx({ ko: '조회 조건', en: 'Query condition' })];
  const { context } = view;
  if (context.relativePeriod) lines.push(tx({ ko: `기간 최근 ${context.relativePeriod.hours}시간`, en: `Period: last ${context.relativePeriod.hours} h` }));
  else if (context.from != null || context.to != null) { const period = fixedPeriod(context.from, context.to, lang); lines.push(tx({ ko: `기간 ${period}`, en: `Period: ${period}` })); }
  if (context.selection) lines.push(tx({ ko: `선택 ${context.selection.length}개`, en: `${context.selection.length} selected` }));
  if (context.condition) lines.push(tx({ ko: `조건 축 ${Object.keys(context.condition).length}개`, en: `${Object.keys(context.condition).length} condition axes` }));
  const scoped = [context.lineNames, context.prcGroups, context.roomNames].filter(value => value != null).length;
  if (scoped > 0) lines.push(tx({ ko: `범위 조건 ${scoped}개`, en: `${scoped} scope filters` }));
  if (view.kind === 'menu-view') {
    const pageKeys = Array.isArray(view.page) ? new Set(view.page.map(([key]) => key)).size : Object.keys(view.page).length;
    if (pageKeys > 0) lines.push(tx({ ko: `화면 설정 ${pageKeys}개`, en: `${pageKeys} page settings` }));
  }
  return lines;
}

export const failureText = (outcome: Extract<ViewActionOutcome, { ok: false }>, tx: (text: Text) => string): string => {
  const base = {
    conflict: { ko: '다른 변경이 먼저 저장되어 처리하지 못했습니다. 최신 내용을 확인한 뒤 다시 시도하세요. 입력한 내용은 그대로 남겨 두었습니다.', en: 'Another change was saved first, so this was not applied. Check the latest content and try again. Your input is kept.' },
    forbidden: { ko: '이 처리를 할 권한이 없습니다. 입력한 내용은 그대로 남겨 두었습니다.', en: 'You are not allowed to do this. Your input is kept.' },
    unavailable: { ko: '지금은 처리할 수 없습니다. 잠시 뒤 다시 시도하세요. 입력한 내용은 그대로 남겨 두었습니다.', en: 'This cannot be done right now. Try again shortly. Your input is kept.' },
    invalid: { ko: '요청이 올바르지 않아 처리하지 못했습니다. 입력한 내용은 그대로 남겨 두었습니다.', en: 'The request was not valid, so it was not applied. Your input is kept.' },
  }[outcome.reason];
  return tx(base);
};
