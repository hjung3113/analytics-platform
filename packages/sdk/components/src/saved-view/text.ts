import { formatPeriod, periodSpan, type Result, type SavedView, type SavedViewContext, type ViewApproval, type ViewVisibility } from '@ap/contracts';
import { formatText, type DiagnoseReason, type Text } from '@ap/kernel';
import { COMPONENTS_MESSAGES } from '../messages';

type Lang = 'ko' | 'en';

const fill = (template: string, vars: Record<string, string | number>): string =>
  template.replace(/\{(\w+)\}/g, (token, name: string) => (vars[name] === undefined ? token : String(vars[name])));

const WORD_KEYS = {
  deleteTitle: 'svDeleteTitle',
  deleteBody: 'svDeleteBody',
  peopleMode: 'svPeopleMode',
  groupsMode: 'svGroupsMode',
  officialMode: 'svOfficialMode',
  shareTitle: 'svShareTitle',
  shareBody: 'svShareBody',
  shareMode: 'svShareMode',
  privateSummary: 'svPrivateSummary',
  officialSummary: 'svOfficialSummary',
  membersLocked: 'svMembersLocked',
  edit: 'svEdit',
  selectedPeople: 'svSelectedPeople',
  removePerson: 'svRemovePerson',
  peopleSearch: 'svPeopleSearch',
  peoplePlaceholder: 'svPeoplePlaceholder',
  searching: 'svSearching',
  searchFailed: 'svSearchFailed',
  searchEmpty: 'svSearchEmpty',
  searchResults: 'svSearchResults',
  savePeopleGroup: 'svSavePeopleGroup',
  groupSearch: 'svGroupSearch',
  groupPlaceholder: 'svGroupPlaceholder',
  groupsLoading: 'svGroupsLoading',
  groupsFailed: 'svGroupsFailed',
  groupsEmpty: 'svGroupsEmpty',
  orgTeams: 'svOrgTeams',
  customGroups: 'svCustomGroups',
  orgTeamsEmpty: 'svOrgTeamsEmpty',
  customGroupsEmpty: 'svCustomGroupsEmpty',
  createGroup: 'svCreateGroup',
  officialNotice: 'svOfficialNotice',
  selectionSummary: 'svSelectionSummary',
  saveTargets: 'svSaveTargets',
  groupConflict: 'svGroupConflict',
  groupForbidden: 'svGroupForbidden',
  groupUnavailable: 'svGroupUnavailable',
  groupInvalid: 'svGroupInvalid',
  groupNameRequired: 'svGroupNameRequired',
  editGroup: 'svEditGroup',
  editGroupBody: 'svEditGroupBody',
  createGroupBody: 'svCreateGroupBody',
  groupName: 'svGroupName',
  managerYes: 'svManagerYes',
  managerNo: 'svManagerNo',
  memberYes: 'svMemberYes',
  memberNo: 'svMemberNo',
  creatorRole: 'svCreatorRole',
  orgMembersLocked: 'svOrgMembersLocked',
  selectedMembers: 'svSelectedMembers',
  membersEmpty: 'svMembersEmpty',
  memberSearch: 'svMemberSearch',
  saveChanges: 'svSaveChanges',
  submitGroup: 'svSubmitGroup',
  cancel: 'svCancel',
  close: 'svClose',
  retry: 'svRetry',
  remove: 'svRemove',
  private: 'svPrivate',
} as const satisfies Record<string, keyof typeof COMPONENTS_MESSAGES>;
export type WordKey = keyof typeof WORD_KEYS;
/** Share-target and group dialog copy for components that take `lang` as a prop. */
export const word = (key: WordKey, lang: Lang): string => formatText(COMPONENTS_MESSAGES[WORD_KEYS[key]], lang);


const APPROVAL_KEYS: Record<ViewApproval, keyof typeof COMPONENTS_MESSAGES> = {
  none: 'svApprovalNone',
  pending: 'svApprovalPending',
  approved: 'svApprovalApproved',
  rejected: 'svApprovalRejected',
};

const FAILURE_KEYS: Record<Extract<Result<unknown>, { ok: false }>['reason'], keyof typeof COMPONENTS_MESSAGES> = {
  conflict: 'svFailureConflict',
  forbidden: 'svFailureForbidden',
  unavailable: 'svFailureUnavailable',
  invalid: 'svFailureInvalid',
};

export const panelBadgeText = (n: number, lang: Lang): string =>
  formatText(COMPONENTS_MESSAGES.svPanelBadge, lang, { count: n });

export const kindText = (kind: SavedView['kind'], lang: Lang): string =>
  formatText(kind === 'menu-view' ? COMPONENTS_MESSAGES.svKindMenuView : COMPONENTS_MESSAGES.svKindConditionSet, lang);

export function approvalText(approval: ViewApproval, lang: Lang): string {
  return formatText(COMPONENTS_MESSAGES[APPROVAL_KEYS[approval]], lang);
}

/** Audience label; group names come from the caller (`groupNames`), unknown ids stay countable. */
export function visibilityText(visibility: ViewVisibility, lang: Lang, groupNames: Readonly<Record<string, string>> = {}): string {
  switch (visibility.kind) {
    case 'private': return formatText(COMPONENTS_MESSAGES.svPrivate, lang);
    case 'official': return formatText(COMPONENTS_MESSAGES.svOfficial, lang);
    case 'people': return formatText(COMPONENTS_MESSAGES.svPeopleCount, lang, { count: visibility.userIds.length });
    case 'groups': return visibility.groupIds.map(id => groupNames[id] ?? id).join(', ') || formatText(COMPONENTS_MESSAGES.svGroupsPlural, lang);
  }
}

/** Short audience for a row badge: a long group list collapses to a count; the details view lists every name. */
export function visibilityShort(visibility: ViewVisibility, lang: Lang, groupNames: Readonly<Record<string, string>> = {}): string {
  if (visibility.kind !== 'groups') return visibilityText(visibility, lang, groupNames);
  const [first] = visibility.groupIds;
  const name = first === undefined ? '' : (groupNames[first] ?? first);
  if (visibility.groupIds.length <= 1) return name || formatText(COMPONENTS_MESSAGES.svGroupSingular, lang);
  const rest = visibility.groupIds.length - 1;
  return formatText(COMPONENTS_MESSAGES.svGroupsShortMore, lang, { name, rest });
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
  if (context.relativePeriod) out.push(formatText(COMPONENTS_MESSAGES.svRelativePeriod, lang, { span: periodSpan(context.relativePeriod.hours, lang) }));
  else if (context.from != null || context.to != null) out.push(formatText(COMPONENTS_MESSAGES.svFixedPeriod, lang, { period: fixedPeriod(context.from, context.to, lang) }));
  if (context.roomNames?.length) out.push(formatText(COMPONENTS_MESSAGES.svContextRooms, lang, { count: context.roomNames.length }));
  if (context.lineNames?.length) out.push(formatText(COMPONENTS_MESSAGES.svContextLines, lang, { count: context.lineNames.length }));
  if (context.prcGroups?.length) out.push(formatText(COMPONENTS_MESSAGES.svContextPrcGroups, lang, { count: context.prcGroups.length }));
  if (context.selection?.length) out.push(formatText(COMPONENTS_MESSAGES.svContextEquipmentSelected, lang, { count: context.selection.length }));
  if (context.condition) out.push(formatText(COMPONENTS_MESSAGES.svContextConditionAxes, lang, { count: Object.keys(context.condition).length }));
  if (context.membershipBasis === 'asOf') out.push(formatText(COMPONENTS_MESSAGES.svContextAsOf, lang));
  return out;
}

/** The user-facing sentence for one Kernel reason; `denied` carries the store's own wording, and a key is data shown as is. */
export function reasonText(reason: DiagnoseReason | string, tx: (text: Text) => string): string {
  if (typeof reason === 'string') return reason;
  const key = reason.key ?? '';
  switch (reason.code) {
    case 'denied': return reason.message ?? tx(COMPONENTS_MESSAGES.svReasonDenied);
    case 'menu-mismatch': return fill(tx(COMPONENTS_MESSAGES.svReasonMenuMismatch), { key });
    case 'stale-context-key': return fill(tx(COMPONENTS_MESSAGES.svReasonStaleContextKey), { key });
    case 'stale-page-key': return fill(tx(COMPONENTS_MESSAGES.svReasonStalePageKey), { key });
    case 'menu-schema-version': return tx(COMPONENTS_MESSAGES.svReasonMenuSchemaVersion);
    case 'metric-version': return tx(COMPONENTS_MESSAGES.svReasonMetricVersion);
    case 'unknown-axis': return fill(tx(COMPONENTS_MESSAGES.svReasonUnknownAxis), { key });
    case 'invalid-selection': return fill(tx(COMPONENTS_MESSAGES.svReasonInvalidSelection), { key });
    case 'migration-unavailable': return tx(COMPONENTS_MESSAGES.svReasonMigrationUnavailable);
  }
}

/** One short line per saved part; uses the same context wording as the view picker. Never lists master values. */
export function contentLines(view: SavedView, tx: (text: Text) => string, lang: Lang): string[] {
  const lines = [tx(view.kind === 'menu-view' ? COMPONENTS_MESSAGES.svKindMenuView : COMPONENTS_MESSAGES.svContentQueryCondition), ...summarizeContext(view.context, lang)];
  if (view.kind === 'menu-view') {
    const pageKeys = Array.isArray(view.page) ? new Set(view.page.map(([key]) => key)).size : Object.keys(view.page).length;
    if (pageKeys > 0) lines.push(fill(tx(COMPONENTS_MESSAGES.svContentPageSettingsCount), { count: pageKeys }));
  }
  return lines;
}

export const failureText = (outcome: Extract<Result<unknown>, { ok: false }>, tx: (text: Text) => string): string =>
  tx(COMPONENTS_MESSAGES[FAILURE_KEYS[outcome.reason]]);

export const memberCountText = (n: number, lang: Lang): string => formatText(COMPONENTS_MESSAGES.svMemberCount, lang, { count: n });
export const groupCreatedText = (name: string, lang: Lang): string => formatText(COMPONENTS_MESSAGES.svGroupCreated, lang, { name });
export function shareSummaryText(mode: 'private' | 'official' | 'people' | 'groups', people: number, groups: number, names: string[], lang: Lang): string {
  if (mode === 'private') return word('privateSummary', lang);
  if (mode === 'official') return word('officialSummary', lang);
  if (mode === 'people') return formatText(COMPONENTS_MESSAGES.svSharePeopleSelected, lang, { count: people });
  return formatText(COMPONENTS_MESSAGES.svShareGroupsSelected, lang, { count: groups }) + (names.length ? `: ${names.join(', ')}` : '');
}
