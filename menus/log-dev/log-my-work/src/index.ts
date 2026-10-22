/**
 * @ap/menu-log-my-work — logMyWork group manifests (표준 로그 개발 — 내 작업, #252, ADR-0065).
 * Planned menus only: the screens are built in-house later (docs/15 §2).
 */
import { History, Inbox } from 'lucide-react';
import { NO_FEATURES, contextCapabilities } from '@ap/contracts';
import type { MenuEntry } from '@ap/kernel';

export const manifests: MenuEntry[] = [
  {
    id: 'log-my-queue', primary: true, group: 'logMyWork', label: { ko: '내 검증 대기', en: 'My validation queue' },
    description: { ko: '나에게 배정된 검증 Round와 재검증 (예정)', en: 'Validation rounds and re-checks assigned to me (planned)' },
    path: '/log/my-queue', icon: Inbox, permission: 'platform:view', requiresScope: false, pageType: 'overview',
    context: contextCapabilities(), features: NO_FEATURES, pageKeys: [],
  },
  {
    id: 'log-recent-models', group: 'logMyWork', label: { ko: '최근 모델', en: 'Recent models' },
    description: { ko: '최근에 연 설비 모델 (예정)', en: 'Equipment models opened recently (planned)' },
    path: '/log/recent-models', icon: History, permission: 'platform:view', requiresScope: false, pageType: 'catalog',
    context: contextCapabilities(), features: NO_FEATURES, pageKeys: [],
  },
];
