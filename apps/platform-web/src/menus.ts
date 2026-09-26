/**
 * The app's information architecture: sidebar groups and every menu manifest (docs/06 §5, §9).
 * Menus declare, the kernel's createRegistry validates and the shell consumes. Step 5 moves each group's
 * manifests into its own menu package (docs/integration/platform-packages.md §5).
 */
import { lazy } from 'react';
import {
  Activity, BarChart3, BookOpen, Boxes, ClipboardList, Cpu, Database, FileClock, FlaskConical, Gauge, LayoutDashboard,
  Megaphone, MessageSquareWarning, Route, ShieldCheck, Timer, Users,
} from 'lucide-react';
import type { Capability, ContextKey } from '@ap/contracts';
import { createRegistry, type GroupDef, type MenuEntry } from '@ap/kernel';

export const GROUPS: GroupDef[] = [
  { id: 'overview', label: { ko: '운영 개요', en: 'Overview' }, icon: LayoutDashboard },
  { id: 'equipment', label: { ko: '설비관리', en: 'Equipment' }, icon: Cpu },
  { id: 'masterData', label: { ko: '기준정보관리', en: 'Master Data' }, icon: Database },
  { id: 'analytics', label: { ko: '생산성 분석', en: 'Analytics' }, icon: BarChart3 },
  { id: 'metrics', label: { ko: '지표관리', en: 'Metrics' }, icon: Gauge },
  { id: 'noticeVoc', label: { ko: '공지·VOC', en: 'Notice & VOC' }, icon: Megaphone },
  { id: 'admin', label: { ko: '관리·감사', en: 'Administration' }, icon: ShieldCheck },
];

const none: Record<ContextKey, Capability> = { time: 'unsupported', roomNames: 'unsupported', condition: 'unsupported', selection: 'unsupported', lot: 'unsupported', ppid: 'unsupported', recipe: 'unsupported', metric: 'unsupported' };
const noFeatures = { export: false, savedView: false, annotate: false, compare: false };

export const MENUS: MenuEntry[] = [
  {
    id: 'home', primary: true, group: 'overview', label: { ko: '플랫폼 현황', en: 'Platform home' },
    description: { ko: '접근 가능한 메뉴, 즐겨찾기와 최근 방문으로 작업에 복귀합니다.', en: 'Return to work through accessible menus, favorites and recent pages.' },
    path: '/', icon: LayoutDashboard, permission: 'platform:view', requiresScope: false, context: none, pageType: 'overview', features: noFeatures, pageKeys: [],
    component: lazy(() => import('./pages/home/OperationsHome')),
  },
  {
    id: 'equipment-master', primary: true, group: 'equipment', label: { ko: '설비 마스터', en: 'Equipment master' },
    description: { ko: '설비 속성과 유효구간 이력을 조회하고 상세·감사 이력을 확인합니다.', en: 'Browse equipment attributes with validity history, details and audit.' },
    path: '/equipment', icon: Boxes, permission: 'equipment:view', requiresScope: true, pageType: 'management',
    context: { ...none, time: 'reference', roomNames: 'apply', condition: 'apply', selection: 'apply' },
    features: { ...noFeatures, export: true }, pageKeys: ['q', 'status', 'maker', 'focus'],
    component: lazy(() => import('./pages/equipment/EquipmentMaster')),
  },
  {
    id: 'equipment-detail', group: 'equipment', parent: 'equipment-master', navHidden: true, label: { ko: '설비 상세', en: 'Equipment detail' },
    description: { ko: '목적지 설비 ID는 분석 Selection과 분리해 전달됩니다.', en: 'The destination ID is carried separately from the analysis Selection.' },
    path: '/equipment/:equipmentId', icon: Cpu, permission: 'equipment:view', requiresScope: true, pageType: 'management',
    context: { ...none, time: 'reference', roomNames: 'reference', condition: 'reference', selection: 'reference' },
    features: noFeatures, pageKeys: ['tab', 'returnTo'],
    component: lazy(() => import('./pages/equipment/EquipmentDetail')),
  },
  {
    id: 'master-process', primary: true, group: 'masterData', label: { ko: '공정 마스터', en: 'Process master' },
    description: { ko: '공정 기준정보 목록/상세 (10 wireframe)', en: 'Process reference data (wireframe 10)' },
    path: '/master/process', icon: Route, permission: 'master:view', requiresScope: true, pageType: 'management',
    context: { ...none, roomNames: 'apply' }, features: noFeatures, pageKeys: [],
  },
  {
    id: 'master-recipe', group: 'masterData', label: { ko: '레시피 마스터', en: 'Recipe master' },
    description: { ko: '레시피 기준정보 목록/상세 (10 wireframe)', en: 'Recipe reference data (wireframe 10)' },
    path: '/master/recipe', icon: FlaskConical, permission: 'master:view', requiresScope: true, pageType: 'management',
    context: { ...none, roomNames: 'apply', recipe: 'apply', ppid: 'reference' }, features: noFeatures, pageKeys: [],
  },
  {
    id: 'productivity-overview', primary: true, group: 'analytics', label: { ko: '생산성 개요', en: 'Productivity overview' },
    description: { ko: '물리 점유율, 비Process 체류, 사이클타임 P50·P95, Job 처리량을 요약합니다.', en: 'Occupancy, non-process dwell, cycle time P50/P95 and job throughput.' },
    path: '/analytics/productivity', icon: Activity, permission: 'analytics:view', requiresScope: true, pageType: 'overview',
    context: { ...none, time: 'apply', roomNames: 'apply', condition: 'apply', selection: 'apply', ppid: 'apply', recipe: 'apply', metric: 'reference', lot: 'unsupported' },
    features: { ...noFeatures, export: true }, pageKeys: ['granularity', 'kpi', 'axis', 'sort'],
    component: lazy(() => import('./pages/analytics/ProductivityOverview')),
  },
  {
    id: 'cycle-time', group: 'analytics', label: { ko: '사이클타임 상세', en: 'Cycle time detail' },
    description: { ko: '사이클타임 분포에서 느린 실행을 찾아 실행 상세로 드릴다운합니다.', en: 'Find slow executions in the cycle-time distribution and drill into them.' },
    path: '/analytics/cycle-time', icon: Timer, permission: 'analytics:view', requiresScope: true, pageType: 'analysis',
    context: { ...none, time: 'apply', roomNames: 'apply', condition: 'apply', selection: 'apply', lot: 'apply', ppid: 'apply', recipe: 'apply', metric: 'apply' },
    features: { export: true, savedView: false, annotate: true, compare: true }, pageKeys: ['granularity', 'percentile', 'sort'], initializesMetric: true,
    component: lazy(() => import('./pages/analytics/CycleTimeDrilldown')),
  },
  {
    id: 'execution-detail', group: 'analytics', parent: 'cycle-time', navHidden: true, label: { ko: '실행 상세', en: 'Execution detail' },
    description: { ko: 'occurrence 식별키 (equipmentId, entityType, anchor)로 식별되는 실행의 공정 타임라인.', en: 'Process timeline of one occurrence keyed by (equipmentId, entityType, anchor).' },
    path: '/analytics/executions/:equipmentId', icon: Timer, permission: 'analytics:view', requiresScope: true, pageType: 'analysis',
    context: { ...none, time: 'reference', roomNames: 'reference', condition: 'reference', selection: 'reference', lot: 'reference', ppid: 'reference', recipe: 'reference', metric: 'reference' },
    features: noFeatures, pageKeys: ['entityType', 'anchor', 'returnTo'],
    component: lazy(() => import('./pages/analytics/ExecutionDetail')),
  },
  {
    id: 'wafer-journey', group: 'analytics', label: { ko: 'Wafer Journey', en: 'Wafer journey' },
    description: { ko: '이송 분포 (07 IA Candidate)', en: 'Transfer distribution (07 IA candidate)' },
    path: '/analytics/wafer-journey', icon: Route, permission: 'analytics:view', requiresScope: true, pageType: 'analysis',
    context: { ...none, time: 'apply', roomNames: 'apply', selection: 'apply', lot: 'apply', metric: 'reference' }, features: noFeatures, pageKeys: [],
  },
  {
    id: 'metric-catalog', primary: true, group: 'metrics', label: { ko: '지표 카탈로그', en: 'Metric catalog' },
    description: { ko: 'grain·분자/분모·버전·발행 상태로 지표 정의를 탐색합니다.', en: 'Browse metric definitions by grain, numerator/denominator, version and status.' },
    path: '/metrics', icon: BookOpen, permission: 'metrics:view', requiresScope: false, pageType: 'catalog',
    context: { ...none, metric: 'apply', selection: 'reference' }, features: { ...noFeatures, export: true }, pageKeys: ['q', 'status', 'domain'],
    component: lazy(() => import('./pages/metrics/MetricCatalog')),
  },
  {
    id: 'metric-detail', group: 'metrics', parent: 'metric-catalog', navHidden: true, label: { ko: '지표 상세', en: 'Metric detail' },
    description: { ko: '정의·버전 이력·사용처', en: 'Definition, version history and usage' },
    path: '/metrics/:metricId', icon: Gauge, permission: 'metrics:view', requiresScope: false, pageType: 'catalog',
    context: { ...none, metric: 'apply', selection: 'reference' }, features: noFeatures, pageKeys: ['tab', 'version'], initializesMetric: true,
    component: lazy(() => import('./pages/metrics/MetricDetail')),
  },
  {
    id: 'notices', primary: true, group: 'noticeVoc', label: { ko: '공지', en: 'Notices' },
    description: { ko: '공지 목록/상세', en: 'Notice list/detail' },
    path: '/notices', icon: Megaphone, permission: 'notice:view', requiresScope: false, pageType: 'management', context: none, features: noFeatures, pageKeys: [],
  },
  {
    id: 'voc', group: 'noticeVoc', label: { ko: 'VOC', en: 'VOC' },
    description: { ko: '접수→처리중→완료 Workflow (wireframe 미작성)', en: 'Received → in progress → done workflow (no wireframe yet)' },
    path: '/voc', icon: MessageSquareWarning, permission: 'voc:view', requiresScope: true, pageType: 'workflow',
    context: { time: 'reference', roomNames: 'reference', condition: 'reference', selection: 'reference', lot: 'reference', ppid: 'reference', recipe: 'reference', metric: 'reference' },
    features: noFeatures, pageKeys: [],
  },
  {
    id: 'admin-roles', primary: true, group: 'admin', label: { ko: '권한/역할 관리', en: 'Roles & access' },
    description: { ko: '메뉴 × 데이터 Scope 권한', en: 'Menu × data-scope permissions' },
    path: '/admin/roles', icon: Users, permission: 'admin:manage', requiresScope: false, pageType: 'management', context: none, features: noFeatures, pageKeys: [],
  },
  {
    id: 'admin-audit', group: 'admin', label: { ko: '변경 감사', en: 'Audit trail' },
    description: { ko: '전역 Audit Trail (각 상세에도 탭으로 노출)', en: 'Global audit trail (also a tab on each detail)' },
    path: '/admin/audit', icon: FileClock, permission: 'admin:manage', requiresScope: false, pageType: 'management', context: none, features: noFeatures, pageKeys: [],
  },
  {
    id: 'admin-usage', group: 'admin', label: { ko: '메뉴 활용률', en: 'Menu usage' },
    description: { ko: 'Menu Registry 활용 계측 (Kernel 관측 기능)', en: 'Menu registry usage instrumentation (kernel observability)' },
    path: '/admin/usage', icon: ClipboardList, permission: 'admin:manage', requiresScope: false, pageType: 'overview', context: none, features: noFeatures, pageKeys: [],
  },
];

export const registry = createRegistry({ groups: GROUPS, menus: MENUS });
