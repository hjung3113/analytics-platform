/**
 * @ap/menu-log-cross — logCross group manifests (표준 로그 개발 — 전체 모아 보기, #252, ADR-0065).
 * Planned menus only: the screens are built in-house later (docs/15 §2).
 */
import { AlertTriangle, FileSpreadsheet } from 'lucide-react';
import { NO_FEATURES, contextCapabilities } from '@ap/contracts';
import type { MenuEntry } from '@ap/kernel';

export const manifests: MenuEntry[] = [
  {
    id: 'log-defects', primary: true, group: 'logCross', label: { ko: '결함 큐', en: 'Defect queue' },
    description: { ko: '모든 모델의 로그 검증 결함과 재검증 (예정)', en: 'Log validation defects and re-checks across models (planned)' },
    path: '/log/defects', icon: AlertTriangle, permission: 'platform:view', requiresScope: false, pageType: 'management',
    context: contextCapabilities(), features: NO_FEATURES, pageKeys: [],
  },
  {
    id: 'log-partner-reviews', group: 'logCross', label: { ko: '협력사 검토 현황', en: 'Partner reviews' },
    description: { ko: '모델별 협력사 검토 진행 (예정)', en: 'Partner review progress per model (planned)' },
    path: '/log/partner-reviews', icon: FileSpreadsheet, permission: 'platform:view', requiresScope: false, pageType: 'management',
    context: contextCapabilities(), features: NO_FEATURES, pageKeys: [],
  },
];
