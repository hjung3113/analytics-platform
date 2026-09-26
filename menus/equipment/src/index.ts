/**
 * @ap/menu-equipment — equipment group manifests (docs/06 §5, §9).
 * Menus declare, the kernel's createRegistry validates and the shell consumes.
 */
import { lazy } from 'react';
import { Boxes, Cpu } from 'lucide-react';
import type { Capability, ContextKey } from '@ap/contracts';
import type { MenuEntry } from '@ap/kernel';

const none: Record<ContextKey, Capability> = { time: 'unsupported', roomNames: 'unsupported', condition: 'unsupported', selection: 'unsupported', lot: 'unsupported', ppid: 'unsupported', recipe: 'unsupported', metric: 'unsupported' };
const noFeatures = { export: false, savedView: false, annotate: false, compare: false };

export const manifests: MenuEntry[] = [
  {
    id: 'equipment-master', primary: true, group: 'equipment', label: { ko: '설비 마스터', en: 'Equipment master' },
    description: { ko: '설비 속성과 유효구간 이력을 조회하고 상세·감사 이력을 확인합니다.', en: 'Browse equipment attributes with validity history, details and audit.' },
    path: '/equipment', icon: Boxes, permission: 'equipment:view', requiresScope: true, pageType: 'management',
    context: { ...none, time: 'reference', roomNames: 'apply', condition: 'apply', selection: 'apply' },
    features: { ...noFeatures, export: true }, pageKeys: ['q', 'status', 'maker', 'focus'],
    component: lazy(() => import('./pages/EquipmentMaster')),
  },
  {
    id: 'equipment-detail', group: 'equipment', parent: 'equipment-master', navHidden: true, label: { ko: '설비 상세', en: 'Equipment detail' },
    description: { ko: '목적지 설비 ID는 분석 Selection과 분리해 전달됩니다.', en: 'The destination ID is carried separately from the analysis Selection.' },
    path: '/equipment/:equipmentId', icon: Cpu, permission: 'equipment:view', requiresScope: true, pageType: 'management',
    context: { ...none, time: 'reference', roomNames: 'reference', condition: 'reference', selection: 'reference' },
    features: noFeatures, pageKeys: ['tab', 'returnTo'],
    component: lazy(() => import('./pages/EquipmentDetail')),
  },
];
