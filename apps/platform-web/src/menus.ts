/**
 * The app's information architecture: sidebar groups and every menu manifest (docs/06 §5, §9).
 * Menus declare, the kernel's createRegistry validates and the shell consumes. Each group's manifests
 * live in their own menu package (docs/integration/platform-packages.md §5); the app concatenates them.
 */
import {
  BarChart3, Cpu, Database, Gauge, LayoutDashboard, Megaphone, ShieldCheck,
} from 'lucide-react';
import { createRegistry, type GroupDef, type MenuEntry } from '@ap/kernel';
// <gen:menu-imports>
import { manifests as home } from '@ap/menu-home';
import { manifests as equipment } from '@ap/menu-equipment';
import { manifests as masterData } from '@ap/menu-master-data';
import { manifests as analytics } from '@ap/menu-analytics';
import { manifests as metrics } from '@ap/menu-metrics';
import { manifests as noticeVoc } from '@ap/menu-notice-voc';
import { manifests as admin } from '@ap/menu-admin';
// </gen:menu-imports>

export const GROUPS: GroupDef[] = [
  { id: 'overview', label: { ko: '운영 개요', en: 'Overview' }, icon: LayoutDashboard },
  { id: 'equipment', label: { ko: '설비관리', en: 'Equipment' }, icon: Cpu },
  { id: 'masterData', label: { ko: '기준정보관리', en: 'Master Data' }, icon: Database },
  { id: 'analytics', label: { ko: '생산성 분석', en: 'Analytics' }, icon: BarChart3 },
  { id: 'metrics', label: { ko: '지표관리', en: 'Metrics' }, icon: Gauge },
  { id: 'noticeVoc', label: { ko: '공지·VOC', en: 'Notice & VOC' }, icon: Megaphone },
  { id: 'admin', label: { ko: '관리·감사', en: 'Administration' }, icon: ShieldCheck },
  // </gen:menu-groups>
];

export const MENUS: MenuEntry[] = [
  // <gen:menu-spreads>
  ...home,
  ...equipment,
  ...masterData,
  ...analytics,
  ...metrics,
  ...noticeVoc,
  ...admin,
  // </gen:menu-spreads>
];

export const registry = createRegistry({ groups: GROUPS, menus: MENUS });
