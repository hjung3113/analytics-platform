/**
 * @ap/menu-analytics — analytics group manifests (docs/06 §5, §9).
 * Menus declare, the kernel's createRegistry validates and the shell consumes.
 */
import { lazy } from 'react';
import { Activity, Route, Timer } from 'lucide-react';
import { NO_FEATURES, contextCapabilities, groupId } from '@ap/contracts';
import type { MenuEntry } from '@ap/kernel';
import { PERMISSION } from './permission';

const GROUP = groupId('analytics');

export const manifests: MenuEntry[] = [
  {
    id: 'chart-catalog', group: GROUP, label: { ko: '차트 카탈로그', en: 'Chart catalog' },
    description: { ko: '차트 종류별 동작과 지원 조건을 확인합니다.', en: 'Explore chart interactions and support conditions.' },
    path: '/analytics/chart-catalog', icon: Activity, permission: PERMISSION, requiresScope: true, pageType: 'analysis',
    context: contextCapabilities({ time: 'apply' }), features: { export: true, savedView: false, annotate: true, compare: true }, pageKeys: ['kind', 'node'], contextResetKeys: ['node'],
    component: lazy(() => import('./pages/chart-catalog/ChartCatalog')),
  },
  {
    id: 'productivity-overview', primary: true, group: GROUP, label: { ko: '생산성 개요', en: 'Productivity overview' },
    description: { ko: '물리 점유율, 비Process 체류, 사이클타임 P50·P95, Job 처리량을 요약합니다.', en: 'Occupancy, non-process dwell, cycle time P50/P95 and job throughput.' },
    path: '/analytics/productivity', icon: Activity, permission: PERMISSION, requiresScope: true, pageType: 'overview',
    context: contextCapabilities({ time: 'apply', roomNames: 'apply', condition: 'apply', selection: 'apply', ppid: 'apply', recipe: 'apply', metric: 'reference', lot: 'unsupported' }),
    features: { ...NO_FEATURES, export: true, board: true },
    pageKeys: ['granularity', 'kpi', 'axis', 'sort', 'drillRoom', 'drillStgroup', 'drillEquipment'],
    contextResetKeys: ['drillRoom', 'drillStgroup', 'drillEquipment'],
    drill: { levels: [
      { key: 'drillRoom', label: { ko: '공정', en: 'Process' } },
      { key: 'drillStgroup', label: { ko: 'StGroup', en: 'StGroup' } },
      { key: 'drillEquipment', label: { ko: '설비', en: 'Equipment' } },
    ] },
    component: lazy(() => import('./pages/ProductivityOverview')),
  },
  {
    id: 'cycle-time', group: GROUP, label: { ko: '사이클타임 상세', en: 'Cycle time detail' },
    description: { ko: '사이클타임 분포에서 느린 실행을 찾아 실행 상세로 드릴다운합니다.', en: 'Find slow executions in the cycle-time distribution and drill into them.' },
    path: '/analytics/cycle-time', icon: Timer, permission: PERMISSION, requiresScope: true, pageType: 'analysis',
    context: contextCapabilities({ time: 'apply', roomNames: 'apply', line: 'apply', prcGroup: 'apply', condition: 'apply', selection: 'apply', lot: 'apply', ppid: 'apply', recipe: 'apply', metric: 'apply' }),
    features: { export: true, savedView: false, annotate: true, compare: true, board: true }, pageKeys: ['granularity', 'percentile', 'sort', 'page', 'bucket', 'bin', 'conditionSet'], contextResetKeys: ['page', 'bucket', 'bin'], initializesMetric: true,
    conditionPresets: [
      { id: 'equipment', label: { ko: '설비 기준', en: 'By equipment' }, axes: ['maker', 'model'] },
      { id: 'organization', label: { ko: '조직 기준', en: 'By organization' }, axes: ['stgroup', 'team'] },
    ],
    conditionPreset: { key: 'conditionSet', default: 'equipment' },
    query: { mode: 'apply', required: { context: ['time', 'roomNames'] } },
    component: lazy(() => import('./pages/CycleTimeDrilldown')),
  },
  {
    id: 'execution-detail', group: GROUP, parent: 'cycle-time', navHidden: true, label: { ko: '실행 상세', en: 'Execution detail' },
    description: { ko: 'occurrence 식별키 (equipmentId, entityType, anchor)로 식별되는 실행의 공정 타임라인.', en: 'Process timeline of one occurrence keyed by (equipmentId, entityType, anchor).' },
    path: '/analytics/executions/:equipmentId', icon: Timer, permission: PERMISSION, requiresScope: true, pageType: 'analysis',
    context: contextCapabilities({ time: 'reference', roomNames: 'reference', condition: 'reference', selection: 'reference', lot: 'reference', ppid: 'reference', recipe: 'reference', metric: 'reference' }),
    features: NO_FEATURES, pageKeys: ['entityType', 'anchor', 'returnTo'],
    component: lazy(() => import('./pages/ExecutionDetail')),
  },
  {
    id: 'wafer-journey', group: GROUP, label: { ko: 'Wafer Journey', en: 'Wafer journey' },
    description: { ko: '이송 분포', en: 'Transfer distribution' },
    path: '/analytics/wafer-journey', icon: Route, permission: PERMISSION, requiresScope: true, pageType: 'analysis',
    context: contextCapabilities({ time: 'apply', roomNames: 'apply', selection: 'apply', lot: 'apply', metric: 'reference' }), features: NO_FEATURES, pageKeys: [],
  },
];
