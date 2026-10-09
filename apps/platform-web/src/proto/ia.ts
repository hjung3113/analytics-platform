// THROWAWAY #250 — never merge.
import { MessagesSquare } from 'lucide-react';
import type { GroupId, SpaceDef, SpaceId } from '@ap/contracts';
import type { GroupDef, MenuEntry } from '@ap/kernel';
import { isProductionEnv } from '@ap/ui';
import { placeholderGroups, placeholderMenus } from './workspaces';

export type WorkspaceVariant = 'A' | 'B' | 'C';

export function readProtoVariant(): WorkspaceVariant {
  if (isProductionEnv(import.meta as { env?: { PROD?: boolean } }, globalThis)) return 'A';
  try {
    const params = new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search);
    const requested = params.get('variant');
    const question = params.get('protoQuestion');
    if ((question === null || question === 'workspaces') && (requested === 'A' || requested === 'B' || requested === 'C')) return requested;
    const stored = typeof localStorage === 'undefined' ? null : localStorage.getItem('platform:proto-250:v1');
    if (stored === 'A' || stored === 'B' || stored === 'C') return stored;
  } catch { /* storage blocked */ }
  return 'A';
}

export function spaceOf(id: GroupId, variant: WorkspaceVariant): SpaceId {
  if (id === 'metrics') return 'metrics';
  if (id === 'admin') return 'operations';
  if (id === 'logdevStatus' || id === 'logdevModels' || id === 'logdevValidation' || id === 'logdevPartner') return 'logdev';
  if (id === 'improveTasks' || id === 'improveField') return 'improvement';
  if (variant === 'C' && (id === 'overview' || id === 'equipment' || id === 'masterData' || id === 'noticeVoc')) return 'common';
  if (variant === 'B' && (id === 'equipment' || id === 'masterData' || id === 'noticeVoc')) return 'operations';
  return 'productivity';
}

export function prototypeGroups(variant: WorkspaceVariant): GroupDef[] {
  const groups = [...placeholderGroups()];
  if (variant === 'B') groups.push({ id: 'myVoc', label: { ko: '내 VOC', en: 'My VOC' }, icon: MessagesSquare, space: 'productivity' });
  return groups;
}

export function prototypeMenus(): MenuEntry[] {
  return placeholderMenus();
}

export function adjustMenus(variant: WorkspaceVariant, menus: MenuEntry[]): MenuEntry[] {
  return menus.map(menu => {
    if (menu.id !== 'voc') return menu;
    if (variant === 'B') return { ...menu, group: 'myVoc', primary: true };
    if (variant === 'C') return { ...menu, navHidden: true, protoSlot: 'my-voc', label: { ko: '내 VOC', en: 'My VOC' } };
    return { ...menu, navHidden: true };
  });
}

export function spacesFor(variant: WorkspaceVariant): SpaceDef[] {
  const spaces: SpaceDef[] = [
    { id: 'productivity', label: { ko: '생산성 분석', en: 'Productivity' }, permission: 'analytics:view', homeMenuId: 'productivity-overview' },
    { id: 'metrics', label: { ko: '지표관리', en: 'Metrics' }, permission: 'metrics:view', homeMenuId: 'metric-catalog' },
    { id: 'logdev', label: { ko: '표준 로그 개발', en: 'Standard log development' }, permission: 'logdev:view', homeMenuId: 'logdev-model-status' },
    { id: 'improvement', label: { ko: '개선 실행', en: 'Improvement' }, permission: 'improve:view', homeMenuId: 'improve-tasks' },
    { id: 'operations', label: { ko: '개발·운영 콘솔', en: 'Operations console' }, permission: 'console:access', homeMenuId: 'admin-roles' },
  ];
  if (variant === 'C') spaces.push({ id: 'common', label: { ko: '공통 기준정보', en: 'Shared master data' }, homeMenuId: 'notices' });
  return spaces;
}
