import { lazy } from 'react';
import { ScrollText } from 'lucide-react';
import { NO_FEATURES, contextCapabilities, groupId } from '@ap/contracts';
import type { MenuEntry } from '@ap/kernel';

export const manifests: MenuEntry[] = [
  {
    id: 'log-explorer', primary: true, group: groupId('logAnalysis'), label: { ko: '로그 탐색', en: 'Log explorer' },
    description: { ko: '원본과 시퀀스를 조사하고 근거 위치를 모읍니다.', en: 'Inspect source records and sequences and collect evidence locations.' },
    path: '/log/explorer', icon: ScrollText, permission: 'platform:view', requiresScope: false, pageType: 'analysis',
    context: contextCapabilities(), features: NO_FEATURES, pageKeys: ['tab', 'focus', 'drawer'], hiddenPageKeys: ['focus'],
    component: lazy(() => import('./pages/LogExplorer')),
  },
  {
    id: 'log-explorer-view', parent: 'log-explorer', navHidden: true, group: groupId('logAnalysis'), label: { ko: '로그 조사', en: 'Log investigation' },
    description: { ko: '저장한 조사와 근거 위치를 엽니다.', en: 'Open a saved investigation and its evidence locations.' },
    path: '/log/explorer/:investigationId', icon: ScrollText, permission: 'platform:view', requiresScope: false, pageType: 'analysis',
    context: contextCapabilities(), features: NO_FEATURES, pageKeys: ['tab', 'focus', 'drawer'], hiddenPageKeys: ['focus'],
    component: lazy(() => import('./pages/LogExplorer')),
  },
];
