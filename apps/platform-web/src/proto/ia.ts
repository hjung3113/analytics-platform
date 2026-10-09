// THROWAWAY #250 — never merge.
import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import { FileSpreadsheet, MessagesSquare } from 'lucide-react';
import type { Capability, ContextKey, GroupId, SpaceDef, SpaceId } from '@ap/contracts';
import type { GroupDef, MenuEntry, PageProps } from '@ap/kernel';
import { isProductionEnv } from '@ap/ui';
import { placeholderGroups, placeholderMenus } from './workspaces';

export type WorkspaceVariant = 'A' | 'B' | 'C';

const none: Record<ContextKey, Capability> = {
  time: 'unsupported', roomNames: 'unsupported', condition: 'unsupported', selection: 'unsupported',
  lot: 'unsupported', ppid: 'unsupported', recipe: 'unsupported', metric: 'unsupported',
};
const noFeatures = { export: false, savedView: false, annotate: false, compare: false };
const CollabScreen: LazyExoticComponent<ComponentType<PageProps>> = lazy(() => import('./CollabPage'));

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
  if (id === 'metrics' || id === 'collabMetrics') return 'metrics';
  if (id === 'admin' || id === 'collabOperations') return 'operations';
  if (id === 'logdevStatus' || id === 'logdevModels' || id === 'logdevValidation' || id === 'logdevPartner' || id === 'collabLogdev') return 'logdev';
  if (id === 'improveTasks' || id === 'improveField' || id === 'collabImprovement') return 'improvement';
  if (id === 'collabHub') return 'collab-hub';
  if (id === 'collabCommon' || (variant === 'C' && (id === 'overview' || id === 'equipment' || id === 'masterData' || id === 'noticeVoc'))) return 'common';
  if (variant === 'B' && (id === 'equipment' || id === 'masterData' || id === 'noticeVoc')) return 'operations';
  return 'productivity';
}

const COLLAB_SPACES: { id: SpaceId; group: GroupId }[] = [
  { id: 'productivity', group: 'collabProductivity' },
  { id: 'metrics', group: 'collabMetrics' },
  { id: 'logdev', group: 'collabLogdev' },
  { id: 'improvement', group: 'collabImprovement' },
  { id: 'operations', group: 'collabOperations' },
  { id: 'common', group: 'collabCommon' },
];

const COLLAB_KINDS = [
  { kind: 'voc', ko: 'VOC', en: 'VOC' },
  { kind: 'task', ko: 'Task', en: 'Task' },
  { kind: 'survey', ko: '설문', en: 'Survey' },
] as const;

function collabMenus(spaces: { id: SpaceId; group: GroupId }[]): MenuEntry[] {
  return spaces.flatMap(({ id, group }) => COLLAB_KINDS.map((kind, index) => ({
    id: `collab-${id}-${kind.kind}`, group, primary: index === 0,
    label: { ko: kind.ko, en: kind.en },
    description: { ko: '이 시스템의 협업 자리', en: 'Collaboration placeholder for this system' },
    path: `/collab/${id}/${kind.kind}`, icon: MessagesSquare, permission: 'voc:view' as const,
    requiresScope: false, context: none, pageType: 'workflow' as const, features: noFeatures, pageKeys: [],
    component: CollabScreen,
  })));
}

export function prototypeGroups(variant: WorkspaceVariant): GroupDef[] {
  const collab = COLLAB_SPACES.filter(s => s.id !== 'common' || variant === 'C');
  const groups: GroupDef[] = [
    ...placeholderGroups(),
    ...collab.map(s => ({
      id: s.group,
      label: { ko: '이 시스템의 협업', en: 'Collaboration' },
      icon: MessagesSquare,
      space: s.id,
      protoPlacement: 'collab' as const,
    })),
    { id: 'collabHub', label: { ko: '전체 협업', en: 'All collaboration' }, icon: FileSpreadsheet, space: 'collab-hub' },
  ];
  if (variant === 'B') groups.push({ id: 'myVoc', label: { ko: '내 VOC', en: 'My VOC' }, icon: MessagesSquare, space: 'productivity' });
  return groups;
}

export function prototypeMenus(variant: WorkspaceVariant): MenuEntry[] {
  const collab = COLLAB_SPACES.filter(s => s.id !== 'common' || variant === 'C');
  return [
    ...placeholderMenus(),
    ...collabMenus(collab),
    {
      id: 'collab-hub', group: 'collabHub', primary: true, label: { ko: '전체 협업 허브', en: 'Collaboration hub' },
      description: { ko: '접근 가능한 시스템의 VOC, Task, 설문', en: 'VOC, tasks and surveys from systems you can enter' },
      path: '/collab/hub', icon: FileSpreadsheet, permission: 'collab:hub', requiresScope: false, context: none,
      pageType: 'workflow', features: noFeatures, pageKeys: [], component: CollabScreen,
    },
  ];
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
    { id: 'collab-hub', label: { ko: '전체 협업 허브', en: 'Collaboration hub' }, permission: 'collab:hub', homeMenuId: 'collab-hub', protoKind: 'hub' },
  ];
  if (variant === 'C') spaces.push({ id: 'common', label: { ko: '공통 기준정보', en: 'Shared master data' }, homeMenuId: 'notices' });
  return spaces;
}
