// THROWAWAY #595 — never merge.
// The FeedbackOps work system as a Registry space (only when a variant is on): 7 rail sections, one menu per sidebar entry of
// FeedbackOps' NAV_TREE (reporter-only entries left out). Screens are static mocks in ./screens.
import { lazy } from 'react';
import { Activity, Boxes, ClipboardList, Database, FileBarChart, Flag, House, Inbox, Layers, Link2, ListChecks, ListTodo, PenLine, Settings, Shield, ShieldCheck, User, UsersRound, type LucideIcon } from 'lucide-react';
import { NO_FEATURES, contextCapabilities, groupId, spaceId, type SpaceDef } from '@ap/contracts';
import type { GroupDef, MenuEntry } from '@ap/kernel';
import { PROTO } from './state';

const SPACE = spaceId('feedbackops');
const on = PROTO.variant !== null;

export const protoSpaces: SpaceDef[] = on ? [{
  id: SPACE, label: { ko: 'FeedbackOps', en: 'FeedbackOps' }, subtitle: { ko: '피드백 운영', en: 'Feedback operations' },
  description: { ko: 'VOC 접수부터 Finding·Task 실행까지 운영합니다.', en: 'Operate from VOC intake to Finding and Task execution.' },
  permission: 'feedbackops:access', homeMenuId: 'fo-dashboard',
}] : [];

const SECTIONS = [
  { id: 'foDash', ko: '대시보드', icon: House },
  { id: 'foVoc', ko: 'VOC', icon: UsersRound },
  { id: 'foFindings', ko: 'Findings', icon: FileBarChart },
  { id: 'foTasks', ko: 'Tasks', icon: ClipboardList },
  { id: 'foIntegration', ko: '연동', icon: Boxes },
  { id: 'foSurveys', ko: 'Surveys', icon: FileBarChart },
  { id: 'foAdmin', ko: '관리자', icon: Shield },
] as const;

export const protoGroups: GroupDef[] = on ? SECTIONS.map(s => ({ id: groupId(s.id), label: { ko: s.ko, en: s.ko }, icon: s.icon, space: SPACE })) : [];

type Def = [id: string, group: (typeof SECTIONS)[number]['id'], ko: string, path: string, icon: LucideIcon, primary?: boolean, tab?: boolean];
// The first menu of a group is what its rail button opens, so each group lists its landing screen first.
const DEFS: Def[] = [
  ['fo-dashboard', 'foDash', '대시보드', 'dashboard', House, true],
  ['fo-voc-inbox', 'foVoc', '수신함', 'vocs/inbox', Inbox, true, true],
  ['fo-voc-triage', 'foVoc', 'Triage', 'vocs/triage', Flag, false, true],
  ['fo-voc-clusters', 'foVoc', 'Clusters', 'voc-clusters', Layers],
  ['fo-findings', 'foFindings', '전체 Finding', 'findings', ListChecks, true],
  ['fo-tasks', 'foTasks', 'Tasks', 'tasks/board', ListTodo, true],
  ['fo-task-requests', 'foTasks', 'Task Requests', 'tasks/requests', Inbox],
  ['fo-my-tasks', 'foTasks', '내 Task', 'tasks/my', User],
  ['fo-milestones', 'foTasks', 'Milestones', 'tasks/milestones', Flag],
  ['fo-int-dashboard', 'foIntegration', '연동 액션 대시보드', 'integration', Activity, true],
  ['fo-int-evidence', 'foIntegration', 'Evidence', 'integration/evidence', FileBarChart],
  ['fo-int-links', 'foIntegration', '엔티티 링크', 'integration/links', Link2],
  ['fo-int-coverage', 'foIntegration', '커버리지', 'integration/coverage', Layers],
  ['fo-survey-manage', 'foSurveys', 'Survey 관리', 'surveys', PenLine, true],
  ['fo-admin-ms', 'foAdmin', 'Managed System', 'admin/managed-systems', Database, true],
  ['fo-admin-aa', 'foAdmin', 'Analytics Area', 'admin/analytics-areas', Layers],
  ['fo-admin-permissions', 'foAdmin', '권한 요청 검토', 'admin/permissions/requests', Shield],
  ['fo-admin-grants', 'foAdmin', '활성 권한', 'admin/permissions/grants', ShieldCheck],
  ['fo-admin-settings', 'foAdmin', 'FeedbackOps 설정', 'admin/settings', Settings],
];

const screen = (id: string) => lazy(async () => { const m = await import('./screens'); return { default: () => <m.FoScreen menuId={id} /> }; });

export const protoMenus: MenuEntry[] = on ? DEFS.map(([id, group, ko, path, icon, primary, tab]) => ({
  id, group: groupId(group), label: { ko, en: ko }, description: { ko: `FeedbackOps ${ko}`, en: `FeedbackOps ${ko}` },
  path: `/feedbackops/${path}`, icon, permission: 'feedbackops:access', requiresScope: false, pageType: 'workflow',
  context: contextCapabilities(), features: NO_FEATURES, pageKeys: tab ? ['tab', 'managedSystem'] : ['managedSystem'], primary: primary ?? false, component: screen(id),
} satisfies MenuEntry)) : [];
