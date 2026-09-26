/**
 * @ap/menu-metrics — metrics group manifests (docs/06 §5, §9).
 * Menus declare, the kernel's createRegistry validates and the shell consumes.
 */
import { lazy } from 'react';
import { BookOpen, Gauge } from 'lucide-react';
import type { Capability, ContextKey } from '@ap/contracts';
import type { MenuEntry } from '@ap/kernel';

const none: Record<ContextKey, Capability> = { time: 'unsupported', roomNames: 'unsupported', condition: 'unsupported', selection: 'unsupported', lot: 'unsupported', ppid: 'unsupported', recipe: 'unsupported', metric: 'unsupported' };
const noFeatures = { export: false, savedView: false, annotate: false, compare: false };

export const manifests: MenuEntry[] = [
  {
    id: 'metric-catalog', primary: true, group: 'metrics', label: { ko: '지표 카탈로그', en: 'Metric catalog' },
    description: { ko: 'grain·분자/분모·버전·발행 상태로 지표 정의를 탐색합니다.', en: 'Browse metric definitions by grain, numerator/denominator, version and status.' },
    path: '/metrics', icon: BookOpen, permission: 'metrics:view', requiresScope: false, pageType: 'catalog',
    context: { ...none, metric: 'apply', selection: 'reference' }, features: { ...noFeatures, export: true }, pageKeys: ['q', 'status', 'domain'],
    component: lazy(() => import('./pages/MetricCatalog')),
  },
  {
    id: 'metric-detail', group: 'metrics', parent: 'metric-catalog', navHidden: true, label: { ko: '지표 상세', en: 'Metric detail' },
    description: { ko: '정의·버전 이력·사용처', en: 'Definition, version history and usage' },
    path: '/metrics/:metricId', icon: Gauge, permission: 'metrics:view', requiresScope: false, pageType: 'catalog',
    context: { ...none, metric: 'apply', selection: 'reference' }, features: noFeatures, pageKeys: ['tab', 'version'], initializesMetric: true,
    component: lazy(() => import('./pages/MetricDetail')),
  },
];
