/**
 * @ap/menu-clas — CLAS group manifests (docs/06 §5, §9). CLAS is a productivity-analysis system like MARS
 * with its own menus (GLOSSARY), so it reuses `analytics:view` instead of a new permission (#590).
 */
import { lazy } from 'react';
import { Timer } from 'lucide-react';
import type { Capability, ContextKey } from '@ap/contracts';
import type { PlatformMenuEntry } from '@ap/kernel';

const none: Record<ContextKey, Capability> = {
  time: 'unsupported', roomNames: 'unsupported', line: 'unsupported', prcGroup: 'unsupported', condition: 'unsupported', selection: 'unsupported',
  lot: 'unsupported', ppid: 'unsupported', recipe: 'unsupported', metric: 'unsupported',
};

export const manifests: PlatformMenuEntry[] = [
  {
    id: 'operation-time', primary: true, group: 'clas',
    label: { ko: '설비 동작시간', en: 'Equipment operation time' },
    description: { ko: '설비별 동작시간 순위와 모듈별 동작 흐름을 봅니다.', en: 'Rank equipment by operation time and follow each module’s operation flow.' },
    path: '/clas/operation-time', icon: Timer, permission: 'analytics:view',
    requiresScope: true, context: { ...none, time: 'apply', roomNames: 'apply' }, pageType: 'analysis',
    features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: ['eqp'], contextResetKeys: ['eqp'],
    component: lazy(() => import('./pages/OperationTime')),
  },
];
