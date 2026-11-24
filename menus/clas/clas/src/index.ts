/**
 * @ap/menu-clas — CLAS group manifests (docs/06 §5, §9). CLAS is a productivity-analysis system like MARS
 * with its own menus (GLOSSARY), so it reuses `analytics:view` instead of a new permission (#590).
 */
import { lazy } from 'react';
import { Timer } from 'lucide-react';
import { NO_FEATURES, contextCapabilities, groupId, type SavedViewSupport } from '@ap/contracts';
import type { PlatformMenuEntry } from '@ap/kernel';
import { PERMISSION } from './permission';
import { operationTimePanel } from './panels';

const GROUP = groupId('clas');
const SAVED_VIEW_SUPPORT: SavedViewSupport = {
  menuId: 'operation-time', menuSchemaVersion: 1, contextKeys: ['time', 'roomNames'], pageKeys: ['eqp'],
};

export const manifests: PlatformMenuEntry[] = [
  {
    id: 'operation-time', primary: true, group: GROUP,
    label: { ko: 'CLAS', en: 'CLAS' },
    searchAliases: ['동작시간', '동작 시간', 'operation time'],
    paletteDescription: { ko: '설비별 동작시간 순위와 모듈 흐름을 봅니다.', en: 'View equipment rankings and activity by module.' },
    description: { ko: '설비별 동작시간 순위와 모듈별 동작 흐름을 봅니다.', en: 'Rank equipment and follow each module’s activity flow.' },
    opensObject: { equipment: { pageKey: 'eqp' } },
    subjectLinks: { equipment: true },
    path: '/clas/operation-time', icon: Timer, permission: PERMISSION,
    requiresScope: true, context: contextCapabilities({ time: 'apply', roomNames: 'apply' }), pageType: 'analysis',
    query: { mode: 'apply', autoApplyDefault: true, applyPeriodOnLegacyEntry: true },
    savedViewSupport: SAVED_VIEW_SUPPORT,
    panels: [operationTimePanel],
    analysisSelectionInbound: [{ key: 'days', dimension: 'date', shape: 'range', label: { ko: '날짜', en: 'Date' } }],
    features: { ...NO_FEATURES, board: true }, pageKeys: ['eqp', 'returnTo', 'days'], contextResetKeys: ['eqp', 'days'], subjectPageKeys: { equipment: 'eqp' },
    component: lazy(() => import('./pages/OperationTime')),
  },
];
