import type { SavedView } from '@ap/contracts';

/** Mock identity of the local ACL simulation (not a server): who the current role is, what it may open, which rooms it may read. */
export type Actor = { userId: string; admin: boolean; permissions: readonly string[]; rooms: readonly string[] };
export type DirectoryPerson = { userId: string; displayName: string; affiliation: string };
/** Stored group: membership lives here, so a member leaving cuts the group path on the next read. */
export type GroupRecord = { id: string; kind: 'org-team' | 'custom'; name: string; managerIds: string[]; memberIds: string[] };

/** Same role ids as the mock session (`platform:role`); unknown values fall back to `engineer`. */
export const ROLE_KEY = 'platform:role';
export const ACTORS: Readonly<Record<string, Actor>> = {
  engineer: { userId: 'engineer', admin: false, permissions: ['analytics:view', 'metrics:view', 'equipment:view', 'master:view'], rooms: ['PHOTO', 'ETCH', 'CVD'] },
  admin: { userId: 'admin', admin: true, permissions: ['analytics:view', 'metrics:view', 'equipment:view', 'master:view'], rooms: ['PHOTO', 'ETCH', 'CVD', 'DIFF', 'CMP'] },
  viewer: { userId: 'viewer', admin: false, permissions: ['metrics:view'], rooms: ['PHOTO'] },
};

/** Fictional people; two share a name so the affiliation line has work to do. */
export const DIRECTORY: readonly DirectoryPerson[] = [
  { userId: 'engineer', displayName: '한지우', affiliation: '포토공정1팀' },
  { userId: 'admin', displayName: '오세진', affiliation: '플랫폼운영팀' },
  { userId: 'viewer', displayName: '문하늘', affiliation: '현업지원팀' },
  { userId: 'u-kangminseo', displayName: '강민서', affiliation: '포토공정1팀' },
  { userId: 'u-yoondohyun', displayName: '윤도현', affiliation: '식각공정팀' },
  { userId: 'u-seojia', displayName: '서지아', affiliation: '공정기술팀' },
  { userId: 'u-limchaewon', displayName: '임채원', affiliation: '공정기술팀' },
  { userId: 'u-kimminjun-a', displayName: '김민준', affiliation: '포토공정1팀' },
  { userId: 'u-kimminjun-b', displayName: '김민준', affiliation: '설비기술팀' },
];

/** Menu permission per menu id; a menu absent here needs none. */
export const MENU_PERMISSIONS: Readonly<Record<string, string>> = {
  'productivity-overview': 'analytics:view',
  'cycle-time': 'analytics:view',
  'execution-detail': 'analytics:view',
};
/** The menu schema the seed treats as current; the stale seed view is saved one version earlier. */
const CURRENT_SCHEMA = 2;
const SEED_TIME = Date.UTC(2026, 9, 20);

export const seedGroups = (): GroupRecord[] => [
  { id: 'g-photo-team', kind: 'org-team', name: '포토공정1팀', managerIds: [], memberIds: ['engineer', 'u-kangminseo', 'u-kimminjun-a'] },
  { id: 'g-weekly-review', kind: 'custom', name: '주간 리뷰 모임', managerIds: ['u-yoondohyun'], memberIds: ['u-yoondohyun', 'engineer', 'u-seojia'] },
  { id: 'g-night-ops', kind: 'custom', name: '야간 운영', managerIds: ['engineer'], memberIds: ['engineer', 'u-limchaewon'] },
];

type Sharing = Pick<SavedView, 'visibility' | 'approval'> & { approvalNote?: string };
const PRIVATE: Sharing = { visibility: { kind: 'private' }, approval: 'none' };
const base = (ownerId: string, menuId: string | null, seq: number, name: string, sharing: Sharing) =>
  ({ id: `${ownerId}|${menuId ?? ''}|${seq}`, schemaVersion: 1 as const, name, ownerId, version: 1, updatedAt: SEED_TIME, ...sharing });
const menuView = (ownerId: string, menuId: string, seq: number, name: string, sharing: Sharing, over: { schema?: number; roomNames?: string[] } = {}): SavedView => ({
  ...base(ownerId, menuId, seq, name, sharing), kind: 'menu-view', menuId, menuSchemaVersion: over.schema ?? CURRENT_SCHEMA,
  context: { relativePeriod: { hours: 24 }, ...(over.roomNames ? { roomNames: over.roomNames } : {}) },
  page: { grain: ['hour'] }, chartOptions: { stacked: true }, layout: { split: [1, 2] }, panels: null,
});

/** Seed rows of one owner+menu bucket; the bucket is written (materialized) only when something in it changes. */
export function seedViews(ownerId: string, menuId: string | null): SavedView[] {
  if (menuId === null) return ownerId === 'engineer' ? [{ ...base(ownerId, null, 1, '야간 A동', PRIVATE), kind: 'condition-set', context: { lineNames: ['L1'], roomNames: ['PHOTO'] } }] : [];
  if (menuId !== 'productivity-overview') return [];
  switch (ownerId) {
    case 'engineer': return [
      menuView(ownerId, menuId, 1, '내 야간 점검', PRIVATE),
      menuView(ownerId, menuId, 2, '일일 점검 (승인 대기)', { visibility: { kind: 'private' }, approval: 'pending' }),
      menuView(ownerId, menuId, 3, 'LOT 추이 (이전 형식)', PRIVATE, { schema: CURRENT_SCHEMA - 1 }),
    ];
    case 'u-kangminseo': return [menuView(ownerId, menuId, 1, 'PHOTO 라인 주간', { visibility: { kind: 'people', userIds: ['engineer'] }, approval: 'none' }, { roomNames: ['PHOTO'] })];
    case 'u-yoondohyun': return [
      menuView(ownerId, menuId, 1, '주간 리뷰 기준', { visibility: { kind: 'groups', groupIds: ['g-weekly-review'] }, approval: 'none' }),
      menuView(ownerId, menuId, 2, '야간 공정 비교', { visibility: { kind: 'private' }, approval: 'pending' }),
    ];
    case 'u-seojia': return [menuView(ownerId, menuId, 1, '공식 생산성 일일 점검', { visibility: { kind: 'official' }, approval: 'approved' })];
    case 'u-limchaewon': return [menuView(ownerId, menuId, 1, 'CMP 설비 비교', { visibility: { kind: 'people', userIds: ['engineer'] }, approval: 'none' }, { roomNames: ['CMP'] })];
    default: return [];
  }
}
