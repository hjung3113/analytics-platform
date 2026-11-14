import { formatPeriod, periodSpan, type Result, type SavedView, type SavedViewContext, type ViewApproval, type ViewVisibility } from '@ap/contracts';
import type { DiagnoseReason, Text } from '@ap/kernel';

type Lang = 'ko' | 'en';
type Pair = { ko: string; en: string };

const WORDS = {
  deleteTitle: { ko: '뷰 삭제', en: 'Delete view' },
  deleteBody: { ko: '삭제하면 공유 대상도 이 뷰를 볼 수 없습니다. 삭제한 뷰는 복구할 수 없습니다.', en: 'People it is shared with will also lose access. A deleted view cannot be restored.' },
  peopleMode: { ko: '사람 지정', en: 'Specific people' },
  groupsMode: { ko: '그룹', en: 'Groups' },
  officialMode: { ko: '공식 신청', en: 'Request official status' },
  shareTitle: { ko: '공유 대상', en: 'Share targets' },
  shareBody: { ko: '이 뷰를 볼 수 있는 사람을 고릅니다. 저장하기 전에는 바뀌지 않습니다.', en: 'Choose who can view this. Nothing changes until you save.' },
  shareMode: { ko: '공유 대상 종류', en: 'Share target type' },
  privateSummary: { ko: '나만 볼 수 있습니다.', en: 'Only you can view this.' },
  officialSummary: { ko: '공식 등록을 신청합니다. 신청해도 지금 보는 사람은 바뀌지 않습니다.', en: 'Request official status. The current audience stays unchanged.' },
  membersLocked: { ko: '멤버 편집 불가', en: 'Members cannot be edited' },
  edit: { ko: '편집', en: 'Edit' },
  selectedPeople: { ko: '선택한 사람', en: 'Selected people' },
  removePerson: { ko: '제거', en: 'Remove' },
  peopleSearch: { ko: '사람 검색', en: 'Search people' },
  peoplePlaceholder: { ko: '이름 또는 소속(공정·팀)으로 검색', en: 'Search by name or affiliation (room or team)' },
  searching: { ko: '검색 중…', en: 'Searching…' },
  searchFailed: { ko: '검색하지 못했습니다.', en: 'Could not search.' },
  searchEmpty: { ko: '검색 결과가 없습니다.', en: 'No results.' },
  searchResults: { ko: '검색 결과', en: 'Search results' },
  savePeopleGroup: { ko: '사람 목록을 그룹으로 저장', en: 'Save people as a group' },
  groupSearch: { ko: '그룹 검색', en: 'Search groups' },
  groupPlaceholder: { ko: '그룹 이름으로 검색', en: 'Search by group name' },
  groupsLoading: { ko: '그룹을 불러오는 중…', en: 'Loading groups…' },
  groupsFailed: { ko: '그룹을 불러오지 못했습니다.', en: 'Could not load groups.' },
  groupsEmpty: { ko: '그룹이 없습니다.', en: 'No groups.' },
  orgTeams: { ko: '조직 팀', en: 'Organization teams' },
  customGroups: { ko: '커스텀 그룹', en: 'Custom groups' },
  orgTeamsEmpty: { ko: '해당하는 조직 팀이 없습니다.', en: 'No matching organization teams.' },
  customGroupsEmpty: { ko: '해당하는 커스텀 그룹이 없습니다.', en: 'No matching custom groups.' },
  createGroup: { ko: '새 그룹 만들기', en: 'New group' },
  officialNotice: { ko: '공식 신청은 승인 대기 상태만 만듭니다. 승인 전에는 공개 대상이 그대로입니다.', en: 'A request waits for approval. The audience stays unchanged until approval.' },
  selectionSummary: { ko: '선택 요약', en: 'Selection summary' },
  saveTargets: { ko: '공유 대상 저장', en: 'Save share targets' },
  groupConflict: { ko: '다른 곳에서 먼저 바뀌었습니다. 다시 열어 확인하세요.', en: 'Changed elsewhere. Reopen and review it.' },
  groupForbidden: { ko: '이 그룹을 바꿀 권한이 없습니다.', en: 'You cannot change this group.' },
  groupUnavailable: { ko: '저장하지 못했습니다. 잠시 뒤 다시 시도하세요.', en: 'Could not save. Try again shortly.' },
  groupInvalid: { ko: '이름이나 멤버를 확인하세요.', en: 'Check the name and members.' },
  groupNameRequired: { ko: '그룹 이름을 입력하세요.', en: 'Enter a group name.' },
  editGroup: { ko: '그룹 편집', en: 'Edit group' },
  editGroupBody: { ko: '이름과 멤버를 바꿉니다.', en: 'Change the name and members.' },
  createGroupBody: { ko: '멤버는 직접 고른 사람만 들어갑니다. 만들어도 뷰는 아직 공유되지 않습니다.', en: 'Only people you select become members. Creating a group does not share the view.' },
  groupName: { ko: '그룹 이름', en: 'Group name' },
  managerYes: { ko: '관리 권한: 있음', en: 'Manager: yes' },
  managerNo: { ko: '관리 권한: 없음', en: 'Manager: no' },
  memberYes: { ko: '멤버: 포함', en: 'Member: yes' },
  memberNo: { ko: '멤버: 포함 안 됨', en: 'Member: no' },
  creatorRole: { ko: ' (만든 사람은 관리자이며, 멤버에는 직접 추가해야 들어갑니다)', en: ' (The creator is a manager; add yourself explicitly to become a member)' },
  orgMembersLocked: { ko: '조직 팀은 멤버를 편집할 수 없습니다.', en: 'Organization team members cannot be edited.' },
  selectedMembers: { ko: '선택한 멤버', en: 'Selected members' },
  membersEmpty: { ko: '아직 고른 멤버가 없습니다.', en: 'No members selected yet.' },
  memberSearch: { ko: '멤버 검색', en: 'Search members' },
  saveChanges: { ko: '변경 저장', en: 'Save changes' },
  submitGroup: { ko: '그룹 만들기', en: 'Create group' },
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
  unitConditionSet: { ko: '조건 세트 · 조회 조건만, 다른 메뉴에서도 사용', en: 'Condition set · conditions only, usable in other menus' },
  unitMenuView: { ko: '메뉴 뷰 · 이 메뉴의 조건·표·차트·배치', en: 'Menu view · this menu: conditions, table, chart, layout' },
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

/** A fixed period reads by the common rule; a stored value that is not a valid wall-clock time is shown as written. */
function fixedPeriod(from: string | null | undefined, to: string | null | undefined, lang: Lang): string {
  try { return formatPeriod(from ?? null, to ?? null, lang); } catch { return `${from ?? '—'} → ${to ?? '—'}`; }
}

/**
 * What a saved context holds, as user wording. A relative period (hours back from the server anchor) and a fixed
 * period are told apart; the room axis is shown as `공정` (GLOSSARY).
 */
export function summarizeContext(context: SavedViewContext, lang: Lang): string[] {
  const out: string[] = [];
  if (context.relativePeriod) out.push(lang === 'ko' ? `최근 ${periodSpan(context.relativePeriod.hours, lang)} (상대 기간)` : `Last ${periodSpan(context.relativePeriod.hours, lang)} (relative)`);
  else if (context.from != null || context.to != null) out.push(`${lang === 'ko' ? '고정 기간' : 'Fixed period'} ${fixedPeriod(context.from, context.to, lang)}`);
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
  conflict: { ko: '다른 곳에서 먼저 바뀌었습니다. 바뀐 저장본을 불러왔습니다. 내용을 확인하고 다시 저장하세요.', en: 'Changed elsewhere first. The latest saved version was loaded. Review it and save again.' },
  forbidden: { ko: '저장할 권한이 없습니다. 입력은 그대로입니다.', en: 'You cannot save this. Your input is kept.' },
  unavailable: { ko: '지금은 저장할 수 없습니다. 입력은 그대로이니 다시 시도하세요.', en: 'Saving is unavailable now. Your input is kept; try again.' },
  invalid: { ko: '저장할 수 없는 내용입니다. 입력은 그대로입니다.', en: 'This content cannot be saved. Your input is kept.' },
};

export const failureText = (outcome: Extract<Result<unknown>, { ok: false }>, tx: (text: Text) => string): string => tx(FAILURE_TEXT[outcome.reason]);

export const memberCountText = (n: number, lang: Lang): string => lang === 'ko' ? `${n}명` : `${n} members`;
export const groupCreatedText = (name: string, lang: Lang): string => lang === 'ko'
  ? `그룹 "${name}"을 만들었습니다. 취소해도 그룹은 남습니다. 공유는 "공유 대상 저장"을 눌러야 적용됩니다.`
  : `Group "${name}" created. It remains if you cancel. Sharing applies only after Save share targets.`;
export function shareSummaryText(mode: 'private' | 'official' | 'people' | 'groups', people: number, groups: number, names: string[], lang: Lang): string {
  if (mode === 'private') return word('privateSummary', lang);
  if (mode === 'official') return word('officialSummary', lang);
  if (mode === 'people') return lang === 'ko' ? `사람 ${people}명 선택` : `${people} people selected`;
  return (lang === 'ko' ? `그룹 ${groups}개 선택` : `${groups} groups selected`) + (names.length ? `: ${names.join(', ')}` : '');
}
