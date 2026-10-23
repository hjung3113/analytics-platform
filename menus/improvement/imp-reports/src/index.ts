/**
 * @ap/menu-imp-reports — impReports group manifests (개선 실행 — 보고, #252, ADR-0065).
 * Planned menus only: the screens are built in-house later (docs/15 §2).
 */
import { BarChart3, History } from 'lucide-react';
import { NO_FEATURES, contextCapabilities, groupId } from '@ap/contracts';
import type { MenuEntry } from '@ap/kernel';

const GROUP = groupId('impReports');

export const manifests: MenuEntry[] = [
  {
    id: 'imp-effect-report', primary: true, group: GROUP, label: { ko: '효과 보고서', en: 'Effect report' },
    description: { ko: '개선 효과 모아 보기 (예정)', en: 'Improvement effect roll-up (planned)' },
    path: '/improvement/effect-report', icon: BarChart3, permission: 'platform:view', requiresScope: false, pageType: 'overview',
    context: contextCapabilities(), features: NO_FEATURES, pageKeys: [],
  },
  {
    id: 'imp-equipment-history', group: GROUP, label: { ko: '설비별 적용 이력', en: 'Equipment history' },
    description: { ko: '설비별 개선 적용 이력 (예정)', en: 'Improvement history per equipment (planned)' },
    path: '/improvement/equipment-history', icon: History, permission: 'platform:view', requiresScope: false, pageType: 'management',
    context: contextCapabilities(), features: NO_FEATURES, pageKeys: [],
  },
];
