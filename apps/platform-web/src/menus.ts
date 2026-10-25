/**
 * The app's information architecture: sidebar groups and every menu manifest (docs/06 §5, §9).
 * Menus declare, the kernel's createRegistry validates and the shell consumes. Each group's manifests
 * live in their own menu package (docs/integration/platform-packages.md §5); the app concatenates them.
 */
import {
  BarChart3, ClipboardList, Cpu, Database, FileSearch, Gauge, Inbox, LayoutDashboard, LineChart, ListTodo, Megaphone, Ruler, ShieldCheck, Timer, UserRound,
} from 'lucide-react';
import { groupId, menuPermission, spaceId, type SpaceDef } from '@ap/contracts';
import { createRegistry, type GroupDef, type MenuEntry } from '@ap/kernel';
import { EQV_MODULE } from './modules';
// <gen:menu-imports>
import { manifests as home } from '@ap/menu-home';
import { manifests as myActivity } from '@ap/menu-my-activity';
import { manifests as equipment } from '@ap/menu-equipment';
import { manifests as masterData } from '@ap/menu-master-data';
import { manifests as analytics } from '@ap/menu-analytics';
import { manifests as metrics } from '@ap/menu-metrics';
import { manifests as noticeVoc } from '@ap/menu-notice-voc';
import { manifests as admin } from '@ap/menu-admin';
import { manifests as clas } from '@ap/menu-clas';
import { manifests as logMyWork } from '@ap/menu-log-my-work';
import { manifests as logModels } from '@ap/menu-log-models';
import { manifests as logCross } from '@ap/menu-log-cross';
import { manifests as logRules } from '@ap/menu-log-rules';
import { manifests as impMyWork } from '@ap/menu-imp-my-work';
import { manifests as impTasks } from '@ap/menu-imp-tasks';
import { manifests as impReports } from '@ap/menu-imp-reports';
import { manifests as hwTime } from '@ap/menu-hw-time';
import { manifests as foDashboard } from '@ap/menu-fo-dashboard';
import { manifests as foVoc } from '@ap/menu-fo-voc';
import { manifests as foTasks } from '@ap/menu-fo-tasks';
// </gen:menu-imports>

/** The menu permissions this app's menus use, on top of the kernel's (ADR-0072). Each menu package spells its own with `menuPermission`; `createRegistry` fails on one missing here. */
export const PERMISSIONS = [menuPermission('equipment:view'), menuPermission('master:view'), menuPermission('analytics:view'), menuPermission('metrics:view')];

export const GROUPS: GroupDef[] = [
  { id: groupId('overview'), label: { ko: '운영 개요', en: 'Overview' }, icon: LayoutDashboard, space: null, hideLabelWhenSingle: true },
  { id: groupId('myActivity'), label: { ko: '내 활동', en: 'My activity' }, icon: UserRound, space: null },
  { id: groupId('noticeVoc'), label: { ko: '공지·VOC', en: 'Notice & VOC' }, icon: Megaphone, space: null },
  { id: groupId('analytics'), label: { ko: '생산성 분석', en: 'Analytics' }, icon: BarChart3, space: spaceId('analytics') },
  { id: groupId('equipment'), label: { ko: '설비관리', en: 'Equipment' }, icon: Cpu, space: spaceId('analytics') },
  { id: groupId('masterData'), label: { ko: '기준정보관리', en: 'Master Data' }, icon: Database, space: spaceId('analytics') },
  { id: groupId('hwTime'), label: { ko: '동작시간분석', en: 'Operation time analysis' }, icon: Timer, space: spaceId('analytics') },
  { id: groupId('metrics'), label: { ko: '지표관리', en: 'Metrics' }, icon: Gauge, space: spaceId('metrics') },
  { id: groupId('clas'), label: { ko: '설비 동작 분석', en: 'Equipment operation' }, icon: LineChart, space: spaceId('clas') },
  { id: groupId('admin'), label: { ko: '관리·감사', en: 'Administration' }, icon: ShieldCheck, space: spaceId('operations') },
  { id: groupId('logMyWork'), label: { ko: '내 작업', en: 'My work' }, icon: Inbox, space: spaceId('log-dev') },
  { id: groupId('logModels'), label: { ko: '모델', en: 'Models' }, icon: Cpu, space: spaceId('log-dev') },
  { id: groupId('logCross'), label: { ko: '전체 모아 보기', en: 'Across models' }, icon: FileSearch, space: spaceId('log-dev') },
  { id: groupId('logRules'), label: { ko: '기준', en: 'Rules' }, icon: Ruler, space: spaceId('log-dev') },
  { id: groupId('impMyWork'), label: { ko: '내 작업', en: 'My work' }, icon: Inbox, space: spaceId('improvement') },
  { id: groupId('impTasks'), label: { ko: '과제', en: 'Tasks' }, icon: ClipboardList, space: spaceId('improvement') },
  { id: groupId('impReports'), label: { ko: '보고', en: 'Reports' }, icon: BarChart3, space: spaceId('improvement') },
  { id: groupId('foDashboard'), label: { ko: '대시보드', en: 'Dashboard' }, icon: ListTodo, space: spaceId('feedbackops') },
  { id: groupId('foVoc'), label: { ko: 'VOC', en: 'VOC' }, icon: Inbox, space: spaceId('feedbackops') },
  { id: groupId('foTasks'), label: { ko: 'Tasks', en: 'Tasks' }, icon: ClipboardList, space: spaceId('feedbackops') },
  // </gen:menu-groups>
];

/** SPACES stays separate from GROUPS so the folder-space invariant reads each declaration independently. */
export const SPACES = [
  { id: spaceId('analytics'), label: { ko: 'MARS', en: 'MARS' }, subtitle: { ko: '생산성 분석', en: 'Productivity analysis' }, description: { ko: '설비·기간별 생산성과 사이클타임을 분석합니다.', en: 'Analyze productivity and cycle time by equipment and period.' }, homeMenuId: 'productivity-overview' },
  { id: spaceId('metrics'), label: { ko: 'BRAVO', en: 'BRAVO' }, subtitle: { ko: '지표관리', en: 'Metrics' }, description: { ko: '지표 정의·버전·발행을 관리합니다.', en: 'Manage metric definitions, versions, and releases.' }, homeMenuId: 'metric-catalog' },
  { id: spaceId('clas'), label: { ko: 'CLAS', en: 'CLAS' }, subtitle: { ko: '생산성 분석', en: 'Productivity analysis' }, description: { ko: '설비별 동작시간과 동작 흐름을 분석합니다.', en: 'Analyze operation time and operation flow by equipment.' }, homeMenuId: 'operation-time' },
  { id: spaceId('tools'), label: { ko: '도구', en: 'Tools' }, subtitle: { ko: '설비 Top View', en: 'Equipment Top View' }, description: { ko: '설비 레이아웃을 Top View로 보고 로그를 재생합니다.', en: 'View equipment layouts as a Top View and replay their logs.' }, homeMenuId: 'eqv:topview' },
  { id: spaceId('log-dev'), label: { ko: '표준 로그 개발', en: 'Standard log development' }, description: { ko: '설비 모델별 로그 개발 단계와 검증을 관리합니다.', en: 'Manage log development stages and validation per equipment model.' }, homeMenuId: 'log-my-queue' },
  { id: spaceId('improvement'), label: { ko: '개선 실행', en: 'Improvement execution' }, description: { ko: '개선 과제의 현장 적용과 효과를 관리합니다.', en: 'Manage field application and effect of improvement tasks.' }, homeMenuId: 'imp-my-tasks' },
  { id: spaceId('operations'), label: { ko: '운영 콘솔', en: 'Operations console' }, description: { ko: '권한·감사·메뉴 활용률을 운영합니다.', en: 'Operate permissions, audit, and menu usage.' }, permission: 'console:access', homeMenuId: 'admin-roles' },
  { id: spaceId('feedbackops'), label: { ko: 'FeedbackOps', en: 'FeedbackOps' }, subtitle: { ko: '피드백 운영', en: 'Feedback operations' }, description: { ko: 'VOC 접수부터 Finding·Task 실행까지 운영합니다.', en: 'Operate from VOC intake to Finding and Task execution.' }, permission: 'feedbackops:access', carriedPageKeys: ['managedSystem', 'returnTo'], homeMenuId: 'fo-dashboard' },
] satisfies readonly SpaceDef[];

export const MENUS: MenuEntry[] = [
  // <gen:menu-spreads>
  ...home,
  ...myActivity,
  ...equipment,
  ...masterData,
  ...analytics,
  ...metrics,
  ...noticeVoc,
  ...admin,
  ...logMyWork,
  ...logModels,
  ...logCross,
  ...logRules,
  ...impMyWork,
  ...impTasks,
  ...impReports,
  ...clas,
  ...hwTime,
  ...foDashboard,
  ...foVoc,
  ...foTasks,
  // </gen:menu-spreads>
];

/** External host modules (src/modules.ts) join at the registry call only; GROUPS and MENUS stay the platform's own. */
export const registry = createRegistry({ spaces: SPACES, groups: [...GROUPS, ...EQV_MODULE.groups], menus: [...MENUS, ...EQV_MODULE.menus], permissions: PERMISSIONS });
