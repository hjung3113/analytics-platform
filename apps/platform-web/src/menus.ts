/**
 * The app's information architecture: sidebar groups and every menu manifest (docs/06 §5, §9).
 * Menus declare, the kernel's createRegistry validates and the shell consumes. Each group's manifests
 * live in their own menu package (docs/integration/platform-packages.md §5); the app concatenates them.
 */
import {
  BarChart3, Boxes, ClipboardCheck, ClipboardList, Cpu, Database, FileSearch, Gauge, Inbox, LayoutDashboard, LineChart, ListChecks, ListTodo, Megaphone, Ruler, Settings, ShieldCheck, Timer, UserCog, UserRound, Waves, Workflow, CircleGauge,
} from 'lucide-react';
import { carrySetId, groupId, menuPermission, spaceId, type CarrySetDef, type SpaceDef } from '@ap/contracts';
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
import { manifests as dashboard } from '@ap/menu-dashboard';
import { manifests as voc } from '@ap/menu-voc';
import { manifests as findings } from '@ap/menu-findings';
import { manifests as tasks } from '@ap/menu-tasks';
import { manifests as integration } from '@ap/menu-integration';
import { manifests as surveys } from '@ap/menu-surveys';
import { manifests as featureAdmin } from '@ap/menu-feature-admin';
import { manifests as rcc } from '@ap/menu-rcc';
import { manifests as mcc } from '@ap/menu-mcc';
import { manifests as wpt } from '@ap/menu-wpt';
import { manifests as configuration } from '@ap/menu-configuration';
// </gen:menu-imports>

/** The menu permissions this app's menus use, on top of the kernel's (ADR-0072). Each menu package spells its own with `menuPermission`; `createRegistry` fails on one missing here. */
export const PERMISSIONS = [menuPermission('equipment:view'), menuPermission('master:view'), menuPermission('analytics:view'), menuPermission('metrics:view')];

export const GROUPS: GroupDef[] = [
  { id: groupId('overview'), label: { ko: '운영 개요', en: 'Overview' }, icon: LayoutDashboard, space: null, hideLabelWhenSingle: true },
  { id: groupId('myActivity'), label: { ko: '내 활동', en: 'My activity' }, icon: UserRound, space: null },
  { id: groupId('noticeVoc'), label: { ko: '공지', en: 'Notice' }, icon: Megaphone, space: null },
  { id: groupId('analytics'), label: { ko: '생산성 분석', en: 'Analytics' }, icon: BarChart3, space: spaceId('mars') },
  { id: groupId('equipment'), label: { ko: '설비관리', en: 'Equipment' }, icon: Cpu, space: spaceId('mars') },
  { id: groupId('masterData'), label: { ko: '기준정보관리', en: 'Master Data' }, icon: Database, space: spaceId('mars') },
  { id: groupId('hwTime'), label: { ko: '동작시간분석', en: 'Operation time analysis' }, icon: Timer, space: spaceId('mars') },
  { id: groupId('rcc'), label: { ko: 'RCC', en: 'RCC' }, icon: Workflow, space: spaceId('mars') },
  { id: groupId('mcc'), label: { ko: 'MCC', en: 'MCC' }, icon: CircleGauge, space: spaceId('mars') },
  { id: groupId('wpt'), label: { ko: 'WPT', en: 'WPT' }, icon: Waves, space: spaceId('mars') },
  { id: groupId('configuration'), label: { ko: 'Configuration', en: 'Configuration' }, icon: Settings, space: spaceId('mars') },
  { id: groupId('metrics'), label: { ko: '지표관리', en: 'Metrics' }, icon: Gauge, space: spaceId('bravo') },
  { id: groupId('clas'), label: { ko: 'CLAS', en: 'CLAS' }, icon: LineChart, space: spaceId('clas') },
  { id: groupId('logMyWork'), label: { ko: '내 작업', en: 'My work' }, icon: Inbox, space: spaceId('log-dev') },
  { id: groupId('logModels'), label: { ko: '모델', en: 'Models' }, icon: Cpu, space: spaceId('log-dev') },
  { id: groupId('logCross'), label: { ko: '전체 모아 보기', en: 'Across models' }, icon: FileSearch, space: spaceId('log-dev') },
  { id: groupId('logRules'), label: { ko: '기준', en: 'Rules' }, icon: Ruler, space: spaceId('log-dev') },
  { id: groupId('impMyWork'), label: { ko: '내 작업', en: 'My work' }, icon: Inbox, space: spaceId('improvement') },
  { id: groupId('impTasks'), label: { ko: '과제', en: 'Tasks' }, icon: ClipboardList, space: spaceId('improvement') },
  { id: groupId('impReports'), label: { ko: '보고', en: 'Reports' }, icon: BarChart3, space: spaceId('improvement') },
  { id: groupId('voc'), label: { ko: 'VOC', en: 'VOC' }, icon: Inbox, space: spaceId('operations') },
  { id: groupId('findings'), label: { ko: 'Finding', en: 'Finding' }, icon: ListChecks, space: spaceId('operations') },
  { id: groupId('tasks'), label: { ko: 'Task 관리', en: 'Task management' }, icon: ClipboardList, space: spaceId('operations') },
  { id: groupId('surveys'), label: { ko: '설문 관리', en: 'Survey management' }, icon: ClipboardCheck, space: spaceId('operations') },
  { id: groupId('dashboard'), label: { ko: '대시보드', en: 'Dashboard' }, icon: ListTodo, space: spaceId('operations') },
  { id: groupId('integration'), label: { ko: '연동', en: 'Integration' }, icon: Boxes, space: spaceId('operations') },
  { id: groupId('featureAdmin'), label: { ko: '기능 관리', en: 'Feature management' }, icon: UserCog, space: spaceId('operations') },
  { id: groupId('admin'), label: { ko: '플랫폼 관리', en: 'Platform management' }, icon: ShieldCheck, space: spaceId('operations') },
  // </gen:menu-groups>
];

/** Former space id → current id (ADR-0090 D3, 713m). The kernel moves a tab's per-space resume entry once; usage records already stored keep the former id. */
export const SPACE_ID_MIGRATIONS: Readonly<Record<string, string>> = { analytics: 'mars', metrics: 'bravo' };

/** SPACES stays separate from GROUPS so the folder-space invariant reads each declaration independently. */
export const SPACES = [
  { id: spaceId('mars'), label: { ko: 'MARS', en: 'MARS' }, subtitle: { ko: '생산성 분석', en: 'Productivity analysis' }, description: { ko: '설비·기간별 생산성과 사이클타임을 분석합니다.', en: 'Analyze productivity and cycle time by equipment and period.' }, homeMenuId: 'productivity-overview' },
  { id: spaceId('bravo'), label: { ko: 'BRAVO', en: 'BRAVO' }, subtitle: { ko: '지표관리', en: 'Metrics' }, description: { ko: '지표 정의·버전·발행을 관리합니다.', en: 'Manage metric definitions, versions, and releases.' }, homeMenuId: 'metric-catalog' },
  { id: spaceId('clas'), label: { ko: 'CLAS', en: 'CLAS' }, subtitle: { ko: '생산성 분석', en: 'Productivity analysis' }, description: { ko: '설비별 동작시간과 동작 흐름을 분석합니다.', en: 'Analyze operation time and operation flow by equipment.' }, homeMenuId: 'operation-time' },
  { id: spaceId('tools'), label: { ko: '도구', en: 'Tools' }, subtitle: { ko: '설비 Top View', en: 'Equipment Top View' }, description: { ko: '설비 레이아웃을 Top View로 보고 로그를 재생합니다.', en: 'View equipment layouts as a Top View and replay their logs.' }, homeMenuId: 'eqv:topview' },
  { id: spaceId('log-dev'), label: { ko: '표준 로그 개발', en: 'Standard log development' }, description: { ko: '설비 모델별 로그 개발 단계와 검증을 관리합니다.', en: 'Manage log development stages and validation per equipment model.' }, homeMenuId: 'log-my-queue' },
  { id: spaceId('improvement'), label: { ko: '개선 실행', en: 'Improvement execution' }, description: { ko: '개선 과제의 현장 적용과 효과를 관리합니다.', en: 'Manage field application and effect of improvement tasks.' }, homeMenuId: 'imp-my-tasks' },
  { id: spaceId('operations'), label: { ko: '운영 콘솔', en: 'Operations console' }, description: { ko: 'VOC·Finding·Task·설문·연동 운영과 기능·플랫폼 관리를 합니다.', en: 'Operate VOC, Finding, Task, survey and integration work, and manage features and the platform.' }, homeMenuId: 'dashboard' },
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
  ...dashboard,
  ...voc,
  ...findings,
  ...tasks,
  ...integration,
  ...surveys,
  ...featureAdmin,
  ...rcc,
  ...mcc,
  ...wpt,
  ...configuration,
  // </gen:menu-spreads>
];

/** The global 내 활동 menus in sidebar order (#1099c): 알림 → 내 VOC → 내 Task → 응답 설문 → 권한 요청. 내 Task is owned by `@ap/menu-tasks`; the app, not a Consumer, decides where it sits. */
const MY_ACTIVITY_ORDER = ['notifications', 'voc', 'voc-detail', 'my-tasks', 'surveys', 'survey-respond', 'permission-requests'] as const;

/** Moves the declared 내 활동 menus into `MY_ACTIVITY_ORDER`, at the position of the group's first menu; every other menu keeps its place. A listed id that is not declared fails at startup. */
function placeMyActivity(menus: readonly MenuEntry[]): MenuEntry[] {
  const mine = MY_ACTIVITY_ORDER.map(id => menus.find(menu => menu.id === id) ?? fail(`placeMyActivity: menu "${id}" is not declared`));
  const first = menus.findIndex(menu => menu.id === MY_ACTIVITY_ORDER[0]);
  const rest = menus.filter(menu => !MY_ACTIVITY_ORDER.some(id => id === menu.id));
  return [...rest.slice(0, first), ...mine, ...rest.slice(first)];
}

function fail(message: string): never { throw new Error(message); }

/** Page keys that follow the user between member menus (ADR-0081 decision 4 as replaced by #1099b). `features`: the feature list scope `managedSystem` and the way back `returnTo`; each operator and feature-admin menu joins with `carrySet`. */
export const CARRY_SETS: readonly CarrySetDef[] = [{ id: carrySetId('features'), pageKeys: ['managedSystem', 'returnTo'] }];

/** Roots the app's own screens and feature serve outside the Registry; no space may take one (ADR-0093). The Kernel reserves only its own `board`, `api` and `auth`. */
export const APP_RESERVED_ROOTS = ['home', 'survey', 'voc', 'notifications', 'notices', 'permission-requests', 'my-tasks'];

/** External host modules (src/modules.ts) join at the registry call only; GROUPS and MENUS stay the platform's own. */
export const registry = createRegistry({ spaces: SPACES, groups: [...GROUPS, ...EQV_MODULE.groups], menus: placeMyActivity([...MENUS, ...EQV_MODULE.menus]), permissions: PERMISSIONS, carrySets: CARRY_SETS, platformHomeMenuId: 'home', reservedRoots: APP_RESERVED_ROOTS });
