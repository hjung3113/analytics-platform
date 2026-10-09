// THROWAWAY #250 — never merge.
/**
 * The app's information architecture: sidebar groups and every menu manifest (docs/06 §5, §9).
 * Menus declare, the kernel's createRegistry validates and the shell consumes. Each group's manifests
 * live in their own menu package (docs/integration/platform-packages.md §5); the app concatenates them.
 *
 * #250 prototype: the variant is fixed at module load (`?variant=` or localStorage). Switching variants
 * reloads the document so this registry is rebuilt. Group `space` is the only change to shipped menus.
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
import { adjustMenus, prototypeGroups, prototypeMenus, readProtoVariant, spaceOf, spacesFor } from './proto/ia';

const variant = readProtoVariant();

export const GROUPS: GroupDef[] = [
  { id: 'overview', label: { ko: '운영 개요', en: 'Overview' }, icon: LayoutDashboard, space: spaceOf('overview', variant), hideLabelWhenSingle: true, ...(variant === 'A' ? { protoPlacement: 'hidden' as const } : {}) },
  { id: 'equipment', label: { ko: '설비관리', en: 'Equipment' }, icon: Cpu, space: spaceOf('equipment', variant) },
  { id: 'masterData', label: { ko: '기준정보관리', en: 'Master Data' }, icon: Database, space: spaceOf('masterData', variant) },
  { id: 'analytics', label: { ko: '생산성 분석', en: 'Analytics' }, icon: BarChart3, space: spaceOf('analytics', variant) },
  { id: 'metrics', label: { ko: '지표관리', en: 'Metrics' }, icon: Gauge, space: spaceOf('metrics', variant) },
  { id: 'noticeVoc', label: { ko: '공지·VOC', en: 'Notice & VOC' }, icon: Megaphone, space: spaceOf('noticeVoc', variant), ...(variant === 'A' ? { protoPlacement: 'hidden' as const } : {}) },
  { id: 'admin', label: { ko: '관리·감사', en: 'Administration' }, icon: ShieldCheck, space: spaceOf('admin', variant) },
  ...prototypeGroups(variant),
  // </gen:menu-groups>
];

/** Below the groups end marker on purpose: the gen-menu wiring lock counts `id: '<group>'` lines above it. */
export const SPACES = spacesFor(variant);

export const MENUS: MenuEntry[] = adjustMenus(variant, [
  // <gen:menu-spreads>
  ...home,
  ...equipment,
  ...masterData,
  ...analytics,
  ...metrics,
  ...noticeVoc,
  ...admin,
  // </gen:menu-spreads>
  ...prototypeMenus(variant),
]);

export const registry = createRegistry({ spaces: SPACES, groups: GROUPS, menus: MENUS });
