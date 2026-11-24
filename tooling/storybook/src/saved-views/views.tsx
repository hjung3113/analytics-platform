import type { GroupMember, Result, SavedView, SavedViewEntry, SavedViewListItem, ViewCapabilities, ViewGroupEntry } from '@ap/contracts';
import type { ApprovalRequestInfo, PeopleSearch } from '@ap/components';

// Synthetic saved views, people and groups of the 저장된 뷰 pages. 'me' is the signed-in user; the stores are stubs that accept every call.
export const ME = 'me';
export const PEOPLE: GroupMember[] = [
  { userId: ME, displayName: '홍길동', affiliation: '생산기술팀' }, { userId: 'u-kim', displayName: '김민준', affiliation: '설비보전팀' },
  { userId: 'u-lee', displayName: '이서연', affiliation: '품질팀' }, { userId: 'u-park', displayName: '박지훈', affiliation: '설비보전팀' },
];
export const personName = (id: string) => PEOPLE.find(p => p.userId === id)?.displayName ?? id;
export const searchPeople: PeopleSearch = async query => PEOPLE.filter(p => p.displayName.includes(query) || p.affiliation.includes(query));

export const GROUP: ViewGroupEntry = {
  group: { id: 'g-etch', kind: 'custom', name: '식각 분석', memberCount: 3, managerIds: [ME] },
  members: PEOPLE.slice(0, 3), capabilities: { canView: true, canEditMembers: true, canRename: true, canDelete: true },
};
export const GROUPS = [{ id: GROUP.group.id, name: GROUP.group.name }];
export const groupName = (id: string) => GROUPS.find(g => g.id === id)?.name ?? id;
export const ok = async <T,>(value: T): Promise<Result<T>> => ({ ok: true, value });

const CAPS: ViewCapabilities = { canView: true, canCopy: true, canEdit: false, canShare: false, canApprove: false, canRevoke: false };
const at = (day: number) => Date.UTC(2026, 10, day, 1, 0);
const entry = (id: string, name: string, owner: string, sharing: Pick<SavedView, 'visibility' | 'approval'> & { approvalNote?: string }, caps: Partial<ViewCapabilities> = {}): SavedViewEntry => ({
  view: { id, schemaVersion: 1, kind: 'condition-set', name, ownerId: owner, version: 3, updatedAt: at(20), context: { relativePeriod: { hours: 168 }, lineNames: ['L1', 'L2'] }, ...sharing } as SavedView,
  capabilities: { ...CAPS, ...caps },
});
export const VIEWS: SavedViewListItem[] = [
  entry('v-etch', '식각 일 가동률', ME, { visibility: { kind: 'private' }, approval: 'none' }, { canEdit: true, canShare: true }),
  entry('v-dep', '증착 알람 주간', 'u-kim', { visibility: { kind: 'groups', groupIds: ['g-etch'] }, approval: 'none' }, { reason: '소유자만 수정할 수 있습니다' }),
  entry('v-std', '공장 표준 조건', 'u-lee', { visibility: { kind: 'official' }, approval: 'approved' }, { canRevoke: true }),
  entry('v-clean', '세정 대기 분석', 'u-park', { visibility: { kind: 'private' }, approval: 'pending' }, { canApprove: true }),
  entry('v-old', '모듈 정지 사유', 'u-kim', { visibility: { kind: 'private' }, approval: 'rejected', approvalNote: '기간이 너무 넓습니다' }),
  { id: 'v-denied', denied: true, reason: '이 Scope를 볼 권한이 없습니다' },
];
export const REQUESTS: Record<string, ApprovalRequestInfo> = {
  'v-clean': { requestedBy: 'u-park', requestedAt: at(21), targetVersion: 4, changes: ['기간 24시간 → 7일', '라인 L1 → L1·L2'] },
  'v-old': { requestedBy: ME, requestedAt: at(18), targetVersion: 3, changes: ['공정 식각 추가'], rejectReason: '기간이 너무 넓습니다' },
};
export const decide = async (): Promise<Result<unknown>> => ({ ok: true, value: null });
