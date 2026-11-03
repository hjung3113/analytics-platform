/**
 * #1287 THROWAWAY PROTOTYPE ① — role-based IA: 직속 group, 업무 흐름 space, reduced 운영 콘솔.
 * A: object groups + Korean terms (recommended). B: stage groups (접수·판단·실행·확인) + alt group name. C: object groups + current English terms.
 */
import { lazy } from 'react';
import { Boxes, ClipboardCheck, ClipboardList, Cog, Flag, Gavel, HelpCircle, Inbox, KeyRound, LayoutDashboard, ListChecks, ListTodo, Megaphone, Network, Play, SearchCheck, ShieldCheck, UserRound } from 'lucide-react';
import { groupId, spaceId, type SpaceDef } from '@ap/contracts';
import type { GroupDef, MenuEntry } from '@ap/kernel';
import { PROTO_1287 } from './variant';

type L = { ko: string; en: string };
const l = (ko: string): L => ({ ko, en: ko });

const FLOW_SPACE: SpaceDef = { id: spaceId('flow'), label: l('업무 흐름'), description: l('들어온 VOC를 판단하고 Task로 실행한 뒤 설문으로 효과를 확인합니다.'), homeMenuId: 'dashboard' };

type Placement = { group: string; label?: L; hidden?: boolean };
type Plan = { groups: GroupDef[]; menus: Record<string, Placement> };

const g = (id: string, ko: string, icon: GroupDef['icon'], space: string | null, extra: Partial<GroupDef> = {}): GroupDef =>
  ({ id: groupId(id), label: l(ko), icon, space: space === null ? null : spaceId(space), ...extra } as GroupDef);

const direct = (name: string): GroupDef[] => [
  g('noticeVoc', name, Megaphone, null),
  g('myActivity', '내 활동', UserRound, null),
];
const consoleGroups: GroupDef[] = [
  g('admin', '플랫폼 관리', ShieldCheck, 'operations'),
  g('access', '권한', KeyRound, 'operations'),
  g('systemsGroup', '시스템', Boxes, 'operations'),
];
const directMenus = (): Record<string, Placement> => ({
  notices: { group: 'noticeVoc', label: l('공지') },
  faq: { group: 'noticeVoc', label: l('FAQ') },
  voc: { group: 'noticeVoc', label: l('VOC') },
  'voc-detail': { group: 'noticeVoc', label: l('VOC 상세') },
  surveys: { group: 'noticeVoc', label: l('설문') },
  'survey-respond': { group: 'noticeVoc' },
  notifications: { group: 'myActivity', hidden: true },
  'my-tasks': { group: 'myActivity', label: l('내 Task') },
  'permission-requests': { group: 'myActivity', label: l('권한 요청') },
  'permission-request-review': { group: 'access', label: l('권한 요청 검토') },
  'permission-grants': { group: 'access', label: l('부여 목록') },
  systems: { group: 'systemsGroup', label: l('업무 시스템 연결') },
});

const PLAN_A: Plan = {
  groups: [...direct('소통'),
    g('dashboard', '대시보드', LayoutDashboard, 'flow', { hideLabelWhenSingle: true }),
    g('voc', 'VOC 처리', Inbox, 'flow'), g('findings', 'Finding', SearchCheck, 'flow'), g('tasks', 'Task', ClipboardList, 'flow'),
    g('surveys', '설문 운영', ClipboardCheck, 'flow'), g('integration', '연동', Network, 'flow'), g('flowSettings', '설정', Cog, 'flow'),
    ...consoleGroups],
  menus: { ...directMenus(),
    dashboard: { group: 'dashboard', label: l('대시보드') },
    inbox: { group: 'voc', label: l('VOC 처리함') }, triage: { group: 'voc', label: l('분류') }, clusters: { group: 'voc', label: l('반복 VOC') },
    findings: { group: 'findings', label: l('전체 Finding') }, evidence: { group: 'findings', label: l('근거') },
    'task-requests': { group: 'tasks', label: l('Task 요청') }, tasks: { group: 'tasks', label: l('Task 보드') }, milestones: { group: 'tasks', label: l('마일스톤') }, 'task-list': { group: 'tasks' },
    'survey-management': { group: 'surveys', label: l('설문 관리') }, 'survey-builder': { group: 'surveys' }, 'survey-results': { group: 'surveys' }, 'survey-follow-up': { group: 'surveys' },
    integration: { group: 'integration', label: l('연동 대시보드') }, 'entity-links': { group: 'integration', label: l('엔티티 링크') }, coverage: { group: 'integration', label: l('커버리지') },
    'managed-systems': { group: 'flowSettings', label: l('시스템') }, 'analytics-areas': { group: 'flowSettings', label: l('분석 영역') }, settings: { group: 'flowSettings', label: l('흐름 정책') },
  },
};

const PLAN_B: Plan = {
  groups: [...direct('참여'),
    g('dashboard', '대시보드', LayoutDashboard, 'flow', { hideLabelWhenSingle: true }),
    g('voc', '접수', Inbox, 'flow'), g('findings', '판단', Gavel, 'flow'), g('tasks', '실행', Play, 'flow'),
    g('surveys', '확인', ListChecks, 'flow'), g('flowSettings', '설정', Cog, 'flow'),
    ...consoleGroups],
  menus: { ...directMenus(),
    dashboard: { group: 'dashboard', label: l('대시보드') },
    inbox: { group: 'voc', label: l('VOC 처리함') }, triage: { group: 'voc', label: l('분류') }, clusters: { group: 'voc', label: l('반복 VOC') },
    findings: { group: 'findings', label: l('Finding') }, evidence: { group: 'findings', label: l('근거') }, 'entity-links': { group: 'findings', label: l('연결 추적') },
    'task-requests': { group: 'tasks', label: l('Task 요청') }, tasks: { group: 'tasks', label: l('Task 보드') }, milestones: { group: 'tasks', label: l('마일스톤') }, 'task-list': { group: 'tasks' },
    'survey-management': { group: 'surveys', label: l('효과 확인 설문') }, 'survey-builder': { group: 'surveys' }, 'survey-results': { group: 'surveys' }, 'survey-follow-up': { group: 'surveys' },
    integration: { group: 'surveys', label: l('연동 대시보드') }, coverage: { group: 'flowSettings', label: l('커버리지') },
    'managed-systems': { group: 'flowSettings', label: l('시스템') }, 'analytics-areas': { group: 'flowSettings', label: l('분석 영역') }, settings: { group: 'flowSettings', label: l('흐름 정책') },
  },
};

const PLAN_C: Plan = {
  groups: [...direct('소통'),
    g('dashboard', '대시보드', LayoutDashboard, 'flow', { hideLabelWhenSingle: true }),
    g('voc', 'VOC', Inbox, 'flow'), g('findings', 'Finding', ListChecks, 'flow'), g('tasks', 'Task 관리', ClipboardList, 'flow'),
    g('surveys', '설문 관리', ClipboardCheck, 'flow'), g('integration', '연동', Boxes, 'flow'), g('flowSettings', '기능 설정', Flag, 'flow'),
    ...consoleGroups],
  menus: { ...directMenus(),
    dashboard: { group: 'dashboard' },
    inbox: { group: 'voc' }, triage: { group: 'voc' }, clusters: { group: 'voc' },
    findings: { group: 'findings' }, evidence: { group: 'findings' },
    'task-requests': { group: 'tasks' }, tasks: { group: 'tasks' }, milestones: { group: 'tasks' }, 'task-list': { group: 'tasks' },
    'survey-management': { group: 'surveys' }, 'survey-builder': { group: 'surveys' }, 'survey-results': { group: 'surveys' }, 'survey-follow-up': { group: 'surveys' },
    integration: { group: 'integration' }, 'entity-links': { group: 'integration' }, coverage: { group: 'integration' },
    'managed-systems': { group: 'flowSettings' }, 'analytics-areas': { group: 'flowSettings' }, settings: { group: 'flowSettings' },
  },
};

const PLAN: Plan | null = PROTO_1287 === 'A' ? PLAN_A : PROTO_1287 === 'B' ? PLAN_B : PROTO_1287 === 'C' ? PLAN_C : null;
export const PROTO_IA_ACTIVE = PLAN !== null;

const FLOW_GROUPS = new Set(['dashboard', 'voc', 'findings', 'tasks', 'surveys', 'integration', 'flowSettings']);

export function protoSpaces<T extends SpaceDef>(spaces: readonly T[]): T[] {
  if (PLAN === null) return [...spaces];
  const out = spaces.map(s => s.id === 'operations'
    ? { ...s, description: l('권한·업무 시스템 연결·감사·사용 현황 등 플랫폼을 관리합니다.'), homeMenuId: 'admin-roles' } as T : s);
  const at = out.findIndex(s => s.id === 'operations');
  out.splice(at, 0, FLOW_SPACE as T);
  return out;
}

export function protoGroups(groups: readonly GroupDef[]): GroupDef[] {
  if (PLAN === null) return [...groups];
  const replaced = new Set(['noticeVoc', 'myActivity', 'voc', 'findings', 'tasks', 'surveys', 'dashboard', 'integration', 'featureAdmin', 'admin']);
  const keep = groups.filter(gr => !replaced.has(gr.id));
  const head = keep.filter(gr => gr.space === null);
  const rest = keep.filter(gr => gr.space !== null);
  const plan = PLAN.groups;
  return [...head, ...plan.filter(gr => gr.space === null), ...rest, ...plan.filter(gr => gr.space !== null)];
}

const planned = (id: string, path: string, label: L, group: string, icon: MenuEntry['icon'], permission: string): MenuEntry => ({
  id, group: groupId(group), label, description: l(`${label.ko} (시안: 화면 없음)`), path, icon, permission, requiresScope: false, pageType: 'management',
  context: { scope: 'ignored', time: 'ignored', equipment: 'ignored' }, features: { compare: false, board: false, export: false }, pageKeys: [],
} as unknown as MenuEntry);

export function protoMenus(menus: readonly MenuEntry[]): MenuEntry[] {
  if (PLAN === null) return [...menus];
  const plan = PLAN.menus;
  const notices = menus.find(m => m.id === 'notices')!;
  const extra = [
    { ...planned('faq', '/faq', l('FAQ'), 'noticeVoc', HelpCircle, 'platform:view'), context: notices.context, features: notices.features } as MenuEntry,
    { ...planned('systems', '/operations/systems', l('업무 시스템 연결'), 'systemsGroup', Boxes, 'console:access'), context: notices.context, features: notices.features } as MenuEntry,
  ];
  const all = [...menus];
  const noticeAt = all.findIndex(m => m.id === 'notices');
  all.splice(noticeAt + 1, 0, extra[0]!);
  all.push(extra[1]!);
  const mapped = all.map(m => {
    const p = plan[m.id];
    if (p === undefined) return m;
    const next = { ...m, group: groupId(p.group) } as MenuEntry & { navHidden?: boolean; path: string };
    if (p.label) next.label = p.label;
    if (p.hidden) next.navHidden = true;
    if (FLOW_GROUPS.has(p.group) && m.path.startsWith('/operations/')) next.path = m.path.replace('/operations/', '/flow/');
    if (m.id === 'notices') { (next as { permission: string }).permission = 'platform:view'; (next as { component?: unknown }).component = lazy(() => import('./NoticesProto')); }
    if (m.id === 'voc') (next as { component?: unknown }).component = lazy(() => import('./VocListProto'));
    if (m.id === 'voc-detail') (next as { component?: unknown }).component = lazy(() => import('./VocDetailProto'));
    return next;
  });
  const touched = new Set(PLAN.groups.map(gr => String(gr.id)));
  const seen = new Set<string>();
  return mapped.map(m => {
    const grp = String(m.group);
    if (!touched.has(grp)) return m;
    const first = !seen.has(grp) && !(m as { navHidden?: boolean }).navHidden && !(m as { parent?: string }).parent;
    if (first) seen.add(grp);
    return { ...m, primary: first } as MenuEntry;
  });
}

export const PROTO_ORDER = ['notices', 'faq', 'voc', 'voc-detail', 'surveys', 'survey-respond', 'notifications', 'my-tasks', 'permission-requests'] as const;
export { ListTodo };
