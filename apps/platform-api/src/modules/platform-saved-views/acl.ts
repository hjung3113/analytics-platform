// Object ACL of a saved view (ADR-0099 section 1). Pure: it reads a stored record, the actor and the actor's
// group memberships, and answers who may see/copy/edit/share/approve/revoke it. Menu and Scope are never judged
// here; the data boundary does that when a view is opened.

import type { SavedViewJson } from './types.js';

export type ApprovalState = 'none' | 'pending' | 'approved' | 'rejected';
export type ApprovalAction = 'request' | 'approve' | 'reject' | 'revoke';

/** Same transitions as `APPROVAL_TRANSITIONS` in @ap/contracts (the backend does not import it). */
const TRANSITIONS: Readonly<Record<ApprovalAction, readonly ApprovalState[]>> = {
  request: ['none', 'rejected'],
  approve: ['pending'],
  reject: ['pending'],
  revoke: ['approved'],
};
export const canTransition = (approval: ApprovalState, action: ApprovalAction): boolean =>
  TRANSITIONS[action].includes(approval);

export const REVOKE_NOTE = '공식 게시가 회수되어 개인 비공개로 돌아왔습니다.';

export interface ViewBody {
  context: Record<string, unknown>;
  menuSchemaVersion?: number;
  page?: unknown;
  chartOptions?: Record<string, unknown>;
  layout?: unknown;
  panels?: unknown;
}

/** An official copy's proposed change, kept apart from the approved content. */
export interface Pending {
  name: string;
  content: ViewBody;
  approval: 'pending' | 'rejected';
  note: string | null;
}

export interface ViewRecord {
  id: string;
  ownerId: string;
  kind: 'condition-set' | 'menu-view';
  menuId: string | null;
  name: string;
  content: ViewBody;
  version: number;
  updatedAt: number;
  visibilityKind: 'private' | 'people' | 'groups' | 'official';
  approval: ApprovalState;
  approvalNote: string | null;
  pending: Pending | null;
  people: string[];
  groupIds: string[];
}

export interface ActorContext {
  id: string;
  workspaceId: string;
  /** `console:access` (workspace.admin mapping), judged by the server, never by the client. */
  approver: boolean;
}

export interface GroupStanding {
  member: boolean;
  manager: boolean;
}
export type Standings = ReadonlyMap<string, GroupStanding>;

export interface ViewCapabilitiesOut {
  canView: boolean;
  canCopy: boolean;
  canEdit: boolean;
  canShare: boolean;
  canApprove: boolean;
  canRevoke: boolean;
  reason?: string;
}

export interface Shown {
  name: string;
  content: ViewBody;
  approval: ApprovalState;
  note: string | null;
}

/** The owner and an approver see the proposed change; everyone else the approved copy. */
export function shownTo(view: ViewRecord, actor: ActorContext): Shown {
  const owner = view.ownerId === actor.id;
  if (view.pending && (owner || actor.approver)) {
    return {
      name: view.pending.name,
      content: view.pending.content,
      approval: view.pending.approval,
      note: view.pending.note,
    };
  }
  return {
    name: view.name,
    content: view.content,
    approval: view.approval,
    note: view.approvalNote,
  };
}

const sharedStanding = (view: ViewRecord, standings: Standings) =>
  view.visibilityKind === 'groups' ? view.groupIds.flatMap((id) => standings.get(id) ?? []) : [];

/** The owner or a manager of a shared group: the object relation that does not change with approval state. */
export function isOwnerOrManager(view: ViewRecord, actor: ActorContext, standings: Standings) {
  return view.ownerId === actor.id || sharedStanding(view, standings).some((s) => s.manager);
}

/** Reachable by any path: owner, named person, shared group member/manager, official, or an approver of a pending application. */
export function isReachable(view: ViewRecord, actor: ActorContext, standings: Standings): boolean {
  if (view.ownerId === actor.id || view.visibilityKind === 'official') return true;
  if (view.visibilityKind === 'people' && view.people.includes(actor.id)) return true;
  if (sharedStanding(view, standings).some((s) => s.member || s.manager)) return true;
  return actor.approver && (view.approval === 'pending' || view.pending?.approval === 'pending');
}

export function capabilitiesOf(
  view: ViewRecord,
  actor: ActorContext,
  standings: Standings,
): ViewCapabilitiesOut {
  const owner = view.ownerId === actor.id;
  const manager = sharedStanding(view, standings).some((s) => s.manager);
  const shown = shownTo(view, actor);
  const official = view.visibilityKind === 'official';
  const published = official && shown.approval === 'approved';
  const canEdit = (owner || manager) && !published;
  return {
    canView: true,
    canCopy: true,
    canEdit,
    canShare: (owner || manager) && !official,
    canApprove: actor.approver && canTransition(shown.approval, 'approve'),
    canRevoke: actor.approver && official && canTransition(view.approval, 'revoke'),
    ...(canEdit
      ? {}
      : {
          reason: published
            ? '공식 게시본은 직접 편집할 수 없습니다. 변경하면 재승인을 요청합니다.'
            : '다른 사람의 뷰입니다. 복제해서 편집하세요.',
        }),
  };
}

/** What the viewer may learn of the audience: the owner, group managers and approvers see it all; others only their own part. */
export function visibilityOut(
  view: ViewRecord,
  actor: ActorContext,
  standings: Standings,
): SavedViewJson['visibility'] {
  const full =
    view.ownerId === actor.id ||
    actor.approver ||
    sharedStanding(view, standings).some((s) => s.manager);
  switch (view.visibilityKind) {
    case 'people':
      return {
        kind: 'people',
        userIds: full ? view.people : view.people.filter((id) => id === actor.id),
      };
    case 'groups':
      return {
        kind: 'groups',
        groupIds: full ? view.groupIds : view.groupIds.filter((id) => standings.has(id)),
      };
    case 'official':
      return { kind: 'official' };
    default:
      return { kind: 'private' };
  }
}

export function savedViewOf(
  view: ViewRecord,
  actor: ActorContext,
  standings: Standings,
): SavedViewJson {
  const shown = shownTo(view, actor);
  const base = {
    id: view.id,
    schemaVersion: 1 as const,
    name: shown.name,
    ownerId: view.ownerId,
    version: view.version,
    updatedAt: view.updatedAt,
    visibility: visibilityOut(view, actor, standings),
    approval: shown.approval,
    ...(shown.note === null ? {} : { approvalNote: shown.note }),
    context: shown.content.context,
  };
  if (view.kind === 'condition-set') return { ...base, kind: 'condition-set' } as SavedViewJson;
  return {
    ...base,
    kind: 'menu-view',
    menuId: view.menuId,
    menuSchemaVersion: shown.content.menuSchemaVersion,
    page: shown.content.page,
    chartOptions: shown.content.chartOptions,
    layout: shown.content.layout,
    panels: shown.content.panels,
  } as SavedViewJson;
}

const differs = (x: unknown, y: unknown) => JSON.stringify(x) !== JSON.stringify(y);

/** Plain lines for what an approval would publish: the fields a pending edit changes, or the plain request for a first publication. */
export function proposalChanges(view: ViewRecord): string[] {
  const pending = view.pending;
  if (!pending) return [`공식 게시 신청: "${view.name}"`];
  const lines: string[] = [];
  if (pending.name !== view.name) lines.push(`이름 "${view.name}" → "${pending.name}"`);
  if (differs(pending.content.context, view.content.context)) lines.push('조회 조건 변경');
  if (view.kind === 'menu-view') {
    if (pending.content.menuSchemaVersion !== view.content.menuSchemaVersion) {
      lines.push(
        `메뉴 화면 버전 ${view.content.menuSchemaVersion} → ${pending.content.menuSchemaVersion}`,
      );
    }
    if (differs(pending.content.page, view.content.page)) lines.push('화면 키 변경');
    if (differs(pending.content.chartOptions, view.content.chartOptions))
      lines.push('차트 옵션 변경');
    if (differs(pending.content.layout, view.content.layout)) lines.push('레이아웃 변경');
    if (differs(pending.content.panels, view.content.panels)) lines.push('패널 변경');
  }
  return lines.length > 0 ? lines : ['내용 변경 없이 재승인 요청'];
}
