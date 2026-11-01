/**
 * @ap/menu-equipment — equipment group manifests (docs/06 §5, §9).
 * Menus declare, the kernel's createRegistry validates and the shell consumes.
 */
import { lazy } from 'react';
import { Boxes, Cpu } from 'lucide-react';
import { NO_FEATURES, contextCapabilities, groupId } from '@ap/contracts';
import type { MenuEntry } from '@ap/kernel';
import { PERMISSION } from './permission';

const GROUP = groupId('equipment');

export const manifests: MenuEntry[] = [
  {
    id: 'equipment-master', primary: true, group: GROUP, label: { ko: '설비 마스터', en: 'Equipment master' },
    description: { ko: '설비 속성과 유효구간 이력을 조회하고 상세·감사 이력을 확인합니다.', en: 'Browse equipment attributes with validity history, details and audit.' },
    path: '/equipment', icon: Boxes, permission: PERMISSION, requiresScope: true, pageType: 'management',
    context: contextCapabilities({ time: 'reference', roomNames: 'apply', condition: 'apply', selection: 'apply' }),
    features: { ...NO_FEATURES, export: true, board: true }, // ADR-0105: every filter condition is the hidden repeated key `filter`; `status`/`maker` stay in `pageKeys` for one release as legacy aliases (read, converted, rewritten away).
    pageKeys: ['q', 'filter', 'status', 'maker', 'focus', 'sort', 'page', 'tab'], repeatedPageKeys: ['filter'], hiddenPageKeys: ['filter'], contextResetKeys: ['page'],
    component: lazy(() => import('./pages/EquipmentMaster')),
  },
  {
    id: 'equipment-detail', group: GROUP, parent: 'equipment-master', navHidden: true, label: { ko: '설비 상세', en: 'Equipment detail' },
    description: { ko: '열어 본 설비는 설비 선택과 별개입니다.', en: 'The equipment you open is separate from the equipment selection.' },
    path: '/equipment/:equipmentId', icon: Cpu, permission: PERMISSION, requiresScope: true, pageType: 'management',
    context: contextCapabilities({ time: 'reference', roomNames: 'reference', condition: 'reference', selection: 'reference' }),
    features: NO_FEATURES, pageKeys: ['tab', 'returnTo'],
    component: lazy(() => import('./pages/EquipmentDetail')),
  },
];
