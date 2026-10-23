/**
 * @ap/menu-log-models — logModels group manifests (표준 로그 개발 — 모델, #252, ADR-0065).
 * Planned menus only: the screens are built in-house later (docs/15 §2).
 */
import { Cpu } from 'lucide-react';
import { NO_FEATURES, contextCapabilities, groupId } from '@ap/contracts';
import type { MenuEntry } from '@ap/kernel';

export const manifests: MenuEntry[] = [
  {
    id: 'log-models', primary: true, group: groupId('logModels'), label: { ko: '모델 목록', en: 'Models' },
    description: { ko: '설비 모델별 개발 단계·검증 Round·협력사 검토 (예정)', en: 'Development stage, validation rounds and partner review per equipment model (planned)' },
    path: '/log/models', icon: Cpu, permission: 'platform:view', requiresScope: false, pageType: 'management',
    context: contextCapabilities(), features: NO_FEATURES, pageKeys: [],
  },
];
