/**
 * The app's information architecture: sidebar groups and every menu manifest (docs/06 §5, §9).
 * Menus declare, the kernel's createRegistry validates and the shell consumes. Each group's manifests
 * live in their own menu package (docs/integration/platform-packages.md §5); the app concatenates them.
 */
import {
  BarChart3, BookOpen, Boxes, ClipboardCheck, ClipboardList, Cpu, Database, FileSearch, ScrollText, Gauge, Inbox, KeyRound, Server, LayoutDashboard, LineChart, ListChecks, ListTodo, Megaphone, Ruler, Settings, ShieldCheck, SlidersHorizontal, Timer, UserRound, Waves, Workflow, CircleGauge,
  PenTool, Map as MapIcon,
} from 'lucide-react';
import type { CreateRegistryInput } from '@ap/app-host';
import { carrySetId, groupId, menuPermission, spaceId, type CarrySetDef, type SpaceDef } from '@ap/contracts';
import { createRegistry, type GroupDef, type MenuEntry } from '@ap/kernel';
import { createHomeComponent, type HomeLauncherGroup, type HomeLauncherSpaceNames } from '@ap/menu-home/launcher';
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
import { manifests as logKnowledge } from '@ap/menu-log-knowledge';
import { manifests as access } from '@ap/menu-access';
import { manifests as systems } from '@ap/menu-systems';
import { manifests as improvementItems } from '@ap/menu-improvement-items';
import { manifests as logAnalysis } from '@ap/menu-log-analysis';
import { manifests as topviewStudio } from '@ap/menu-topview-studio';
import { manifests as topview } from '@ap/menu-topview';
// </gen:menu-imports>

/** The menu permissions this app's menus use, on top of the kernel's (ADR-0072). Each menu package spells its own with `menuPermission`; `createRegistry` fails on one missing here. */
export const PERMISSIONS = [menuPermission('equipment:view'), menuPermission('master:view'), menuPermission('analytics:view'), menuPermission('metrics:view'), menuPermission('knowledge:catalog-manage'), menuPermission('knowledge:item-publish'), menuPermission('knowledge:spec-publish'), menuPermission('improvement:manage'), menuPermission('explorer:investigate'), menuPermission('explorer:handoff'), menuPermission('lifecycle:project-manage'), menuPermission('lifecycle:round-manage'), menuPermission('lifecycle:gate-decide'), menuPermission('lifecycle:issue-contribute'), menuPermission('lifecycle:issue-link'), menuPermission('dataset:manage'), menuPermission('dataset:baseline-approve'), menuPermission('dataset:suite-run'), menuPermission('eqv:view'), menuPermission('eqv-studio:view'), menuPermission('eqv-studio:layout-edit'), menuPermission('eqv-studio:layout-publish'), menuPermission('eqv-studio:rules-edit'), menuPermission('eqv-studio:dictionary-global-edit'), menuPermission('eqv-studio:mapping-publish'), menuPermission('eqv-studio:window-import')];

export const GROUPS: GroupDef[] = [
  { id: groupId('overview'), label: { ko: '운영 개요', en: 'Overview' }, icon: LayoutDashboard, space: null, hideLabelWhenSingle: true },
  { id: groupId('improvementItems'), label: { ko: '개선 아이템', en: 'Improvement items' }, icon: ClipboardCheck, space: null, hideLabelWhenSingle: true },
  { id: groupId('noticeVoc'), label: { ko: '소통', en: 'Communication' }, icon: Megaphone, space: null },
  { id: groupId('myActivity'), label: { ko: '내 활동', en: 'My activity' }, icon: UserRound, space: null },
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
  { id: groupId('logAnalysis'), label: { ko: '로그 분석', en: 'Log analysis' }, icon: ScrollText, space: spaceId('log-dev') },
  { id: groupId('logCross'), label: { ko: '전체 모아 보기', en: 'Across models' }, icon: FileSearch, space: spaceId('log-dev') },
  { id: groupId('logRules'), label: { ko: '기준', en: 'Rules' }, icon: Ruler, space: spaceId('log-dev') },
  { id: groupId('logKnowledge'), label: { ko: '로그 지식 허브', en: 'Log Knowledge' }, icon: BookOpen, space: spaceId('log-dev') },
  { id: groupId('dashboard'), label: { ko: '대시보드', en: 'Dashboard' }, icon: ListTodo, space: spaceId('flow'), hideLabelWhenSingle: true },
  { id: groupId('voc'), label: { ko: 'VOC 처리', en: 'VOC handling' }, icon: Inbox, space: spaceId('flow') },
  { id: groupId('findings'), label: { ko: 'Finding', en: 'Finding' }, icon: ListChecks, space: spaceId('flow') },
  { id: groupId('tasks'), label: { ko: 'Task', en: 'Task' }, icon: ClipboardList, space: spaceId('flow') },
  { id: groupId('surveys'), label: { ko: '설문 운영', en: 'Survey operations' }, icon: ClipboardCheck, space: spaceId('flow') },
  { id: groupId('integration'), label: { ko: '연동', en: 'Integration' }, icon: Boxes, space: spaceId('flow') },
  { id: groupId('flowSettings'), label: { ko: '설정', en: 'Settings' }, icon: SlidersHorizontal, space: spaceId('flow') },
  { id: groupId('admin'), label: { ko: '플랫폼 관리', en: 'Platform management' }, icon: ShieldCheck, space: spaceId('operations') },
  { id: groupId('access'), label: { ko: '권한', en: 'Access' }, icon: KeyRound, space: spaceId('operations') },
  { id: groupId('systems'), label: { ko: '시스템', en: 'Systems' }, icon: Server, space: spaceId('operations') },
  { id: groupId('topview'), label: { ko: '설비', en: 'Equipment' }, icon: MapIcon, space: spaceId('tools') },
  { id: groupId('topviewStudio'), label: { ko: 'Top View 작성', en: 'Top View authoring' }, icon: PenTool, space: spaceId('tools') },
  // </gen:menu-groups>
];

/** Former space id → current id (ADR-0090 D3, 713m). The kernel moves a tab's per-space resume entry once; usage records already stored keep the former id. */
export const SPACE_ID_MIGRATIONS: Readonly<Record<string, string>> = { analytics: 'mars', metrics: 'bravo' };

/** SPACES stays separate from GROUPS so the folder-space invariant reads each declaration independently. */
export const SPACES = [
  { id: spaceId('mars'), label: { ko: 'MARS', en: 'MARS' }, subtitle: { ko: '생산성 분석', en: 'Productivity analysis' }, description: { ko: '설비·기간별 생산성 · 사이클타임', en: 'Productivity by equipment and period · Cycle time' }, homeMenuId: 'productivity-overview', feedbackTracking: true },
  { id: spaceId('bravo'), label: { ko: 'BRAVO', en: 'BRAVO' }, subtitle: { ko: '지표관리', en: 'Metrics' }, description: { ko: '지표 정의 · 버전 · 발행', en: 'Metric definitions · Versions · Releases' }, homeMenuId: 'metric-catalog', feedbackTracking: true },
  { id: spaceId('clas'), label: { ko: 'CLAS', en: 'CLAS' }, subtitle: { ko: '생산성 분석', en: 'Productivity analysis' }, description: { ko: '설비별 동작시간 · 동작 흐름', en: 'Operation time and flow by equipment' }, homeMenuId: 'operation-time', feedbackTracking: true },
  { id: spaceId('tools'), label: { ko: '도구', en: 'Tools' }, subtitle: { ko: '설비 Top View', en: 'Equipment Top View' }, description: { ko: '설비 레이아웃 Top View · 로그 재생', en: 'Equipment layout Top View · Log replay' }, homeMenuId: 'eqv:topview' },
  { id: spaceId('log-dev'), label: { ko: '표준 로그 개발', en: 'Standard log development' }, description: { ko: '설비 모델별 로그 개발 단계 · 검증', en: 'Log development stages by equipment model · Validation' }, homeMenuId: 'log-my-queue', scopePresentation: 'hidden', feedbackTracking: true },
  { id: spaceId('flow'), label: { ko: '업무 흐름', en: 'Workflow' }, description: { ko: 'VOC 판단 → Task 실행 → 설문으로 효과 확인', en: 'VOC assessment → Task execution → Effect checks with surveys' }, homeMenuId: 'dashboard' },
  { id: spaceId('operations'), label: { ko: '운영 콘솔', en: 'Operations console' }, description: { ko: '플랫폼 관리 · 권한', en: 'Platform administration · Access' }, homeMenuId: 'admin-roles' },
] satisfies readonly SpaceDef[];

/** Home-only display order; registry access and per-space ordering remain authoritative. */
export const HOME_LAUNCHER_GROUPS = [
  { id: 'analysis', label: { ko: '분석', en: 'Analysis' }, spaces: [spaceId('mars'), spaceId('bravo'), spaceId('clas')] },
  { id: 'work', label: { ko: '업무 운영', en: 'Work operations' }, spaces: [spaceId('log-dev'), spaceId('flow')] },
  { id: 'tools', label: { ko: '도구', en: 'Tools' }, spaces: [spaceId('tools')] },
  { id: 'platform', label: { ko: '플랫폼 관리', en: 'Platform administration' }, spaces: [spaceId('operations')] },
] satisfies readonly HomeLauncherGroup[];
// #1998: Home names the tools entry after its primary capability so it does not repeat the "도구" group heading.
export const HOME_LAUNCHER_SPACE_NAMES = {
  [spaceId('tools')]: { ko: '설비 Top View', en: 'Equipment Top View' },
} satisfies HomeLauncherSpaceNames;
const ConfiguredHome = createHomeComponent(HOME_LAUNCHER_GROUPS, { spaceNames: HOME_LAUNCHER_SPACE_NAMES });

function configureHome(menus: readonly MenuEntry[]): MenuEntry[] {
  if (menus.filter(menu => menu.id === 'home').length !== 1) fail('configureHome: expected exactly one home menu');
  return menus.map(menu => {
    if (menu.id !== 'home') return menu;
    if (menu.module !== undefined) fail('configureHome: expected a platform home menu');
    return { ...menu, component: ConfiguredHome };
  });
}

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
  ...logKnowledge,
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
  ...access,
  ...systems,
  ...improvementItems,
  ...logAnalysis,
  ...topviewStudio,
  ...topview,
  // </gen:menu-spreads>
];

/** The global menus in sidebar order, per group. 내 활동 (#1099c): 알림 → 내 Task → 권한 요청 → API 토큰; 내 Task is owned by `@ap/menu-tasks`. 소통 (ADR-0110): 공지 → FAQ → VOC → 설문; VOC and 설문 are `@ap/menu-my-activity` screens in the `noticeVoc` group. The app, not a Consumer, decides where they sit. */
const GLOBAL_GROUP_ORDER = [
  ['notifications', 'my-tasks', 'permission-requests', 'api-tokens'],
  ['notices', 'faq', 'voc', 'voc-detail', 'surveys', 'survey-respond'],
] as const;

/** Moves each group's listed menus into `GLOBAL_GROUP_ORDER`, at the position of the group's first listed menu; every other menu keeps its place. A listed id that is not declared fails at startup. */
function placeGlobalGroups(menus: readonly MenuEntry[]): MenuEntry[] {
  return GLOBAL_GROUP_ORDER.reduce<MenuEntry[]>((all, order) => {
    const placed = order.map(id => all.find(menu => menu.id === id) ?? fail(`placeGlobalGroups: menu "${id}" is not declared`));
    const first = all.findIndex(menu => menu.id === order[0]);
    const rest = all.filter(menu => !order.some(id => id === menu.id));
    return [...rest.slice(0, first), ...placed, ...rest.slice(first)];
  }, [...menus]);
}

function fail(message: string): never { throw new Error(message); }

/** Page keys that follow the user between member menus (ADR-0081 decision 4 as replaced by #1099b). `features`: the feature list scope `managedSystem` and the way back `returnTo`; each operator and feature-admin menu joins with `carrySet`. */
const CARRY_SETS: readonly CarrySetDef[] = [{ id: carrySetId('features'), pageKeys: ['managedSystem', 'returnTo'] }];

/** Roots the app's own screens and feature serve outside the Registry; no space may take one (ADR-0093). The Kernel reserves only its own `board`, `api` and `auth`. */
const APP_RESERVED_ROOTS = ['home', 'survey', 'voc', 'notifications', 'notices', 'permission-requests', 'my-tasks', 'faq', 'tokens'];

/** The whole `createRegistry` input (spaces, groups, menus, permissions, carrySets, platformHomeMenuId, reservedRoots): the Host (`startAppHost` in `main.tsx`) builds the mounted app's Registry from it. */
export const declarations: CreateRegistryInput = { spaces: SPACES, groups: GROUPS, menus: placeGlobalGroups(configureHome(MENUS)), permissions: PERMISSIONS, carrySets: CARRY_SETS, platformHomeMenuId: 'home', reservedRoots: APP_RESERVED_ROOTS };

/** Built once here for tests and any direct reader; the running app mounts the Registry the Host builds from the same `declarations` (one extra build, unchanged behaviour). */
export const registry = createRegistry(declarations);
