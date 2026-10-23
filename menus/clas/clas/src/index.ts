/**
 * @ap/menu-clas — CLAS group manifests (docs/06 §5, §9). CLAS is a productivity-analysis system like MARS
 * with its own menus (GLOSSARY), so it reuses `analytics:view` instead of a new permission (#590).
 */
import { lazy } from 'react';
import { Timer } from 'lucide-react';
import { NO_FEATURES, contextCapabilities, groupId } from '@ap/contracts';
import type { PlatformMenuEntry } from '@ap/kernel';
import { PERMISSION } from './permission';

const GROUP = groupId('clas');

export const manifests: PlatformMenuEntry[] = [
  {
    id: 'operation-time', primary: true, group: GROUP,
    label: { ko: '설비 동작시간', en: 'Equipment operation time' },
    description: { ko: '설비별 동작시간 순위와 모듈별 동작 흐름을 봅니다.', en: 'Rank equipment by operation time and follow each module’s operation flow.' },
    path: '/clas/operation-time', icon: Timer, permission: PERMISSION,
    requiresScope: true, context: contextCapabilities({ time: 'apply', roomNames: 'apply' }), pageType: 'analysis',
    features: { ...NO_FEATURES, board: true }, pageKeys: ['eqp'], contextResetKeys: ['eqp'],
    component: lazy(() => import('./pages/OperationTime')),
  },
];
