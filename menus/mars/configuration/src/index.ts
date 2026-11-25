/** @ap/menu-configuration — synthetic equipment comparison consumer. */
import { lazy } from 'react';
import { Settings } from 'lucide-react';
import { NO_FEATURES, contextCapabilities, groupId, menuPermission } from '@ap/contracts';
import type { MenuEntry } from '@ap/kernel';
import { HW_DAYS_KEY, PAGE_KEYS, SAVED_VIEW_SUPPORT } from './endpoints';
import { MESSAGES } from './messages';
import { HW_TIME_TREND } from './lentTrendMapping';
import { configurationPanels } from './panels';

export const manifests: MenuEntry[] = [
  {
    id: 'configuration', primary: true, group: groupId('configuration'), label: { ko: 'Configuration', en: 'Configuration' },
    description: { ko: '설비별 설정값과 차이·규격·수집 상태 비교', en: 'Compare equipment settings, differences, specifications and collection status' },
    path: '/configuration', icon: Settings, permission: menuPermission('analytics:view'), requiresScope: true, pageType: 'analysis',
    context: contextCapabilities({ time: 'apply' }), query: { mode: 'apply', autoApplyDefault: true },
    features: { ...NO_FEATURES, export: true },
    savedViewSupport: SAVED_VIEW_SUPPORT,
    pageKeys: PAGE_KEYS, repeatedPageKeys: ['filter'], hiddenPageKeys: ['filter'],
    // The lent HW Time trend writes its picked days here; the trend panel highlights the changes on those days (#2763).
    analysisSelectionInbound: [{ key: HW_DAYS_KEY, dimension: 'date', shape: 'range', label: MESSAGES.hwDays }], contextResetKeys: [HW_DAYS_KEY],
    panels: Object.values(configurationPanels),
    linkTargets: { optional: ['hw-time'] },
    lentPanels: [{
      source: HW_TIME_TREND,
      context: {
        scopeId: { kind: 'context', key: 'scopeId' }, time: { kind: 'context', key: 'time' },
        roomNames: { kind: 'context', key: 'roomNames' }, condition: { kind: 'context', key: 'condition' },
        prcGroup: { kind: 'context', key: 'prcGroup' },
        selection: { kind: 'value', key: 'equipmentIds' },
      },
      page: {
        moduleType: { kind: 'value', key: 'moduleType' },
        drillModule: { kind: 'value', key: 'module' },
        drillMotion: { kind: 'value', key: 'motion' },
      },
      display: { equipmentLabels: { kind: 'value', key: 'equipmentLabels' } },
      // HW Time `trend` declares `trendRange` (date range); only this receiving key is written.
      outputs: { trendRange: { kind: 'page', key: HW_DAYS_KEY } },
    }],
    component: lazy(() => import('./pages/Configuration')),
  },
];
