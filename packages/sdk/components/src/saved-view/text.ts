import { formatPeriod, periodSpan, type Result, type SavedView, type SavedViewContext, type ViewApproval, type ViewVisibility } from '@ap/contracts';
import type { DiagnoseReason, Text } from '@ap/kernel';

type Lang = 'ko' | 'en';
type Pair = { ko: string; en: string };

const WORDS = {
  trigger: { ko: '저장된 뷰', en: 'Saved views' },
  noView: { ko: '뷰 선택', en: 'Select a view' },
  unsavedCondition: { ko: '저장하지 않은 조건', en: 'Unsaved conditions' },
  modified: { ko: '수정됨', en: 'Modified' },
  unapplied: { ko: '적용 안 된 변경', en: 'Unapplied changes' },
  stale: { ko: '낡음', en: 'Out of date' },
  search: { ko: '뷰 이름 검색', en: 'Search view names' },
  filterGroup: { ko: '공개 대상 필터', en: 'Filter by audience' },
  filterAll: { ko: '전체', en: 'All' },
  filterMine: { ko: '내 뷰', en: 'My views' },
  filterOfficial: { ko: '공식', en: 'Official' },
  list: { ko: '뷰 목록', en: 'Views' },
  loading: { ko: '뷰 목록을 불러오는 중', en: 'Loading views' },
  error: { ko: '뷰 목록을 불러오지 못했습니다.', en: 'Could not load views.' },
  retry: { ko: '다시 시도', en: 'Retry' },
  empty: { ko: '저장된 뷰가 없습니다. 현재 조건을 저장해 보세요.', en: 'No saved views yet. Save the current conditions.' },
  noResult: { ko: '조건에 맞는 뷰가 없습니다.', en: 'No views match.' },
  current: { ko: '현재 뷰', en: 'Current view' },
  myDefault: { ko: '내 기본', en: 'My default' },
  rowActions: { ko: '동작', en: 'Actions' },
  details: { ko: '자세히 보기', en: 'Details' },
  backToList: { ko: '목록으로', en: 'Back to list' },
  makeDefault: { ko: '내 기본으로 지정', en: 'Set as my default' },
  clearDefault: { ko: '내 기본 해제', en: 'Clear my default' },
  remove: { ko: '삭제', en: 'Delete' },
  manage: { ko: '뷰 관리', en: 'Manage views' },
  denied: { ko: '볼 수 없는 뷰', en: 'View not accessible' },
  save: { ko: '저장', en: 'Save' },
  saveCurrent: { ko: '현재 뷰에 저장', en: 'Save to this view' },
  saveNew: { ko: '새 뷰로 저장', en: 'Save as new view' },
  saveCopy: { ko: '내 복사본으로 저장', en: 'Save as my copy' },
  revert: { ko: '저장본으로 되돌리기', en: 'Revert to saved' },
  discardTitle: { ko: '변경한 내용을 어떻게 할까요?', en: 'What about your changes?' },
  discardBody: { ko: '현재 뷰의 수정 내용이 저장되지 않았습니다.', en: 'Changes to the current view are not saved.' },
  discardSave: { ko: '저장하고 이동', en: 'Save and switch' },
  discardSaveCopy: { ko: '내 복사본으로 저장하고 이동', en: 'Save my copy and switch' },
  discardSaveNew: { ko: '새 뷰로 저장하고 이동', en: 'Save as new view and switch' },
  discardDrop: { ko: '버리고 이동', en: 'Discard and switch' },
  cancel: { ko: '취소', en: 'Cancel' },
  close: { ko: '닫기', en: 'Close' },
  detailName: { ko: '이름', en: 'Name' },
  detailKind: { ko: '종류', en: 'Type' },
  detailOwner: { ko: '소유자', en: 'Owner' },
  detailAudience: { ko: '공개 대상', en: 'Shared with' },
  detailApproval: { ko: '공식 승인', en: 'Official approval' },
  detailContent: { ko: '저장 내용', en: 'Saved content' },
  detailUpdated: { ko: '갱신', en: 'Updated' },
  kindConditionSet: { ko: '조건 세트', en: 'Condition set' },
  kindMenuView: { ko: '메뉴 뷰', en: 'Menu view' },
  private: { ko: '나만', en: 'Only me' },
  official: { ko: '공식', en: 'Official' },
  approvalPending: { ko: '승인 대기', en: 'Approval pending' },
  approvalApproved: { ko: '승인됨', en: 'Approved' },
  approvalRejected: { ko: '반려됨', en: 'Rejected' },
  approvalNone: { ko: '신청 안 함', en: 'Not requested' },
  noContent: { ko: '저장된 조건이 없습니다.', en: 'No saved conditions.' },
  dialogTitle: { ko: '뷰 저장', en: 'Save view' },
  dialogUpdateTitle: { ko: '현재 뷰에 저장', en: 'Save to current view' },
  unit: { ko: '저장 단위', en: 'Save as' },
  unitConditionSet: { ko: '조건 세트 — 조회 조건만, 다른 메뉴에서도 사용', en: 'Condition set — conditions only, usable in other menus' },
  unitMenuView: { ko: '메뉴 뷰 — 이 메뉴의 조건·표·차트·배치', en: 'Menu view — this menu: conditions, table, chart, layout' },
  mode: { ko: '저장 방식', en: 'Save mode' },
  modeNew: { ko: '새 뷰로 저장', en: 'Save as new view' },
  modeUpdate: { ko: '현재 뷰 갱신', en: 'Update current view' },
  name: { ko: '뷰 이름', en: 'View name' },
  nameRequired: { ko: '이름을 입력하세요.', en: 'Enter a name.' },
  draftNotice: { ko: '적용 뒤 저장: 아직 적용하지 않은 변경은 저장되지 않습니다. 저장되는 것은 지금 적용된 조건입니다.', en: 'Apply, then save: unapplied changes are not saved. The applied conditions are what gets saved.' },
  includes: { ko: '포함 내용', en: 'Included' },
  panelsHeading: { ko: '포함 패널', en: 'Included panels' },
  excludedHeading: { ko: '제외값', en: 'Excluded values' },
  visibility: { ko: '공개 대상', en: 'Audience' },
  visibilityHint: { ko: '저장 버튼을 눌러야 정해집니다.', en: 'Decided only when you press Save.' },
  submit: { ko: '저장', en: 'Save' },
  saving: { ko: '저장 중', en: 'Saving' },
} satisfies Record<string, Pair>;

export type WordKey = keyof typeof WORDS;
export const word = (key: WordKey, lang: Lang): string => WORDS[key][lang];

const count = (n: number, ko: string, en: string, lang: Lang): string => (lang === 'ko' ? `${ko} ${n}` : `${en} ${n}`);

export const panelBadgeText = (n: number, lang: Lang): string => (lang === 'ko' ? `패널 조건 ${n}` : `Panel conditions ${n}`);
export const kindText = (kind: SavedView['kind'], lang: Lang): string => word(kind === 'menu-view' ? 'kindMenuView' : 'kindConditionSet', lang);

export function approvalText(approval: ViewApproval, lang: Lang): string {
  return word({ none: 'approvalNone', pending: 'approvalPending', approved: 'approvalApproved', rejected: 'approvalRejected' }[approval] as WordKey, lang);
}

/** Audience label; group names come from the caller (`groupNames`), unknown ids stay countable. */
export function visibilityText(visibility: ViewVisibility, lang: Lang, groupNames: Readonly<Record<string, string>> = {}): string {
  switch (visibility.kind) {
    case 'private': return word('private', lang);
    case 'official': return word('official', lang);
    case 'people': return lang === 'ko' ? `사람 ${visibility.userIds.length}명` : `${visibility.userIds.length} people`;
    case 'groups': return visibility.groupIds.map(id => groupNames[id] ?? id).join(', ') || (lang === 'ko' ? '그룹' : 'Groups');
  }
}

/** Short audience for a row badge: a long group list collapses to a count; the details view lists every name. */
export function visibilityShort(visibility: ViewVisibility, lang: Lang, groupNames: Readonly<Record<string, string>> = {}): string {
  if (visibility.kind !== 'groups') return visibilityText(visibility, lang, groupNames);
  const [first] = visibility.groupIds;
  const name = first === undefined ? '' : (groupNames[first] ?? first);
  if (visibility.groupIds.length <= 1) return name || (lang === 'ko' ? '그룹' : 'Group');
  const rest = visibility.groupIds.length - 1;
  return lang === 'ko' ? `${name} 외 ${rest}` : `${name} +${rest}`;
}

/**
 * What a saved context holds, as user wording. A relative period (hours back from the server anchor) and a fixed
 * period are told apart; the room axis is shown as `공정` (GLOSSARY).
 */
export function summarizeContext(context: SavedViewContext, lang: Lang): string[] {
  const out: string[] = [];
  if (context.relativePeriod) out.push(lang === 'ko' ? `최근 ${periodSpan(context.relativePeriod.hours, lang)} (상대 기간)` : `Last ${periodSpan(context.relativePeriod.hours, lang)} (relative)`);
  else if (context.from != null || context.to != null) out.push(`${lang === 'ko' ? '고정 기간' : 'Fixed period'} ${formatPeriod(context.from ?? null, context.to ?? null, lang)}`);
  if (context.roomNames?.length) out.push(count(context.roomNames.length, '공정', 'Rooms', lang));
  if (context.lineNames?.length) out.push(count(context.lineNames.length, 'Line', 'Lines', lang));
  if (context.prcGroups?.length) out.push(count(context.prcGroups.length, 'PRC 그룹', 'PRC groups', lang));
  if (context.selection?.length) out.push(lang === 'ko' ? `설비 ${context.selection.length}대 선택` : `${context.selection.length} equipment selected`);
  if (context.condition) out.push(count(Object.keys(context.condition).length, '설비 조건 축', 'Equipment condition axes', lang));
  if (context.membershipBasis === 'asOf') out.push(lang === 'ko' ? '그 시점 소속 기준' : 'Membership as of then');
  return out;
}

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

/** One short line per saved part; uses the same context wording as the view picker. Never lists master values. */
export function contentLines(view: SavedView, tx: (text: Text) => string, lang: Lang): string[] {
  const lines = [tx(view.kind === 'menu-view' ? { ko: '메뉴 뷰', en: 'Menu view' } : { ko: '조회 조건', en: 'Query condition' }), ...summarizeContext(view.context, lang)];
  if (view.kind === 'menu-view') {
    const pageKeys = Array.isArray(view.page) ? new Set(view.page.map(([key]) => key)).size : Object.keys(view.page).length;
    if (pageKeys > 0) lines.push(tx({ ko: `화면 설정 ${pageKeys}개`, en: `${pageKeys} page settings` }));
  }
  return lines;
}

const FAILURE_TEXT: Record<Extract<Result<unknown>, { ok: false }>['reason'], Text> = {
  conflict: { ko: '다른 곳에서 먼저 바뀌었습니다.', en: 'Another change was saved elsewhere first.' },
  forbidden: { ko: '저장할 권한이 없습니다.', en: 'You do not have permission to save.' },
  unavailable: { ko: '지금은 저장할 수 없습니다.', en: 'Saving is unavailable right now.' },
  invalid: { ko: '저장할 수 없는 내용입니다.', en: 'This content cannot be saved.' },
};

export const failureText = (outcome: Extract<Result<unknown>, { ok: false }>, tx: (text: Text) => string): string => tx(FAILURE_TEXT[outcome.reason]);
