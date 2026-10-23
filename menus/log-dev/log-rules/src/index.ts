/**
 * @ap/menu-log-rules — logRules group manifests (표준 로그 개발 — 기준, #252, ADR-0065).
 * Planned menus only: the screens are built in-house later (docs/15 §2).
 */
import { Ruler } from 'lucide-react';
import { NO_FEATURES, contextCapabilities, groupId } from '@ap/contracts';
import type { MenuEntry } from '@ap/kernel';

export const manifests: MenuEntry[] = [
  {
    id: 'log-rules', primary: true, group: groupId('logRules'), label: { ko: '검증 규칙', en: 'Validation rules' },
    description: { ko: '로그 검증 규칙 (예정)', en: 'Log validation rules (planned)' },
    path: '/log/rules', icon: Ruler, permission: 'platform:view', requiresScope: false, pageType: 'catalog',
    context: contextCapabilities(), features: NO_FEATURES, pageKeys: [],
  },
];
