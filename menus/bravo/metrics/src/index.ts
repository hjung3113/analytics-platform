/**
 * @ap/menu-metrics — metrics group manifests (docs/06 §5, §9).
 * Menus declare, the kernel's createRegistry validates and the shell consumes.
 */
import { lazy } from 'react';
import { BookOpen, Gauge } from 'lucide-react';
import { NO_FEATURES, contextCapabilities, groupId } from '@ap/contracts';
import type { MenuEntry } from '@ap/kernel';
import { PERMISSION } from './permission';

const GROUP = groupId('metrics');

export const manifests: MenuEntry[] = [
  {
    id: 'metric-catalog', primary: true, group: GROUP, label: { ko: '지표 카탈로그', en: 'Metric catalog' },
    description: { ko: 'grain·분자/분모·버전·발행 상태로 지표 정의를 탐색합니다.', en: 'Browse metric definitions by grain, numerator/denominator, version and status.' },
    path: '/metrics', icon: BookOpen, permission: PERMISSION, requiresScope: false, pageType: 'catalog',
    context: contextCapabilities({ metric: 'apply', selection: 'reference' }), features: { ...NO_FEATURES, export: true, board: true }, pageKeys: ['q', 'status', 'domain', 'sort', 'page'], contextResetKeys: ['page'],
    component: lazy(() => import('./pages/MetricCatalog')),
  },
  {
    id: 'metric-detail', group: GROUP, parent: 'metric-catalog', navHidden: true, label: { ko: '지표 상세', en: 'Metric detail' },
    description: { ko: '정의·버전 이력·사용처', en: 'Definition, version history and usage' },
    path: '/metrics/:metricId', icon: Gauge, permission: PERMISSION, requiresScope: false, pageType: 'catalog',
    context: contextCapabilities({ metric: 'apply', selection: 'reference' }), features: NO_FEATURES, pageKeys: ['tab', 'version', 'returnTo'], initializesMetric: true,
    component: lazy(() => import('./pages/MetricDetail')),
  },
];
