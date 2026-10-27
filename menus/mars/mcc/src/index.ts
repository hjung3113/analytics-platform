/** @ap/menu-mcc — planned MARS menu. */
import { CircleGauge } from 'lucide-react';
import { NO_FEATURES, contextCapabilities, groupId } from '@ap/contracts';
import type { MenuEntry } from '@ap/kernel';

export const manifests: MenuEntry[] = [
  {
    id: 'mcc', primary: true, group: groupId('mcc'), label: { ko: 'MCC', en: 'MCC' },
    description: { ko: '설비 사이클 분석 (예정)', en: 'Equipment cycle (planned)' },
    path: '/mcc', icon: CircleGauge, permission: 'platform:view', requiresScope: false, pageType: 'analysis',
    context: contextCapabilities(), features: NO_FEATURES, pageKeys: [],
  },
];
