/**
 * The app's information architecture: sidebar groups and every menu manifest (docs/06 §5, §9).
 * Menus declare, the kernel's createRegistry validates and the shell consumes. Each group's manifests
 * live in their own menu package (docs/integration/platform-packages.md §5); the app concatenates them.
 */
import {
  BarChart3, Cpu, Database, Gauge, LayoutDashboard, Megaphone, ShieldCheck,
} from 'lucide-react';
import type { SpaceDef } from '@ap/contracts';
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
  { id: 'overview', label: { ko: '운영 개요', en: 'Overview' }, icon: LayoutDashboard, space: null, hideLabelWhenSingle: true },
  { id: 'noticeVoc', label: { ko: '공지·VOC', en: 'Notice & VOC' }, icon: Megaphone, space: null },
  { id: 'analytics', label: { ko: '생산성 분석', en: 'Analytics' }, icon: BarChart3, space: 'analytics' },
  { id: 'equipment', label: { ko: '설비관리', en: 'Equipment' }, icon: Cpu, space: 'analytics' },
  { id: 'masterData', label: { ko: '기준정보관리', en: 'Master Data' }, icon: Database, space: 'analytics' },
  { id: 'metrics', label: { ko: '지표관리', en: 'Metrics' }, icon: Gauge, space: 'metrics' },
  { id: 'admin', label: { ko: '관리·감사', en: 'Administration' }, icon: ShieldCheck, space: 'operations' },
  // </gen:menu-groups>
];

/** Below the groups end marker on purpose: the gen-menu wiring lock counts `id: '<group>'` lines above it. */
export const SPACES: SpaceDef[] = [
  { id: 'analytics', label: { ko: '생산성 분석', en: 'Productivity analysis' }, description: { ko: '설비·기간별 생산성과 사이클타임을 분석합니다.', en: 'Analyze productivity and cycle time by equipment and period.' }, homeMenuId: 'productivity-overview' },
  { id: 'metrics', label: { ko: '지표관리', en: 'Metrics' }, description: { ko: '지표 정의·버전·발행을 관리합니다.', en: 'Manage metric definitions, versions, and releases.' }, homeMenuId: 'metric-catalog' },
  { id: 'operations', label: { ko: '운영 콘솔', en: 'Operations console' }, description: { ko: '권한·감사·메뉴 활용률을 운영합니다.', en: 'Operate permissions, audit, and menu usage.' }, permission: 'console:access', homeMenuId: 'admin-roles' },
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

export const registry = createRegistry({ spaces: SPACES, groups: GROUPS, menus: MENUS });
