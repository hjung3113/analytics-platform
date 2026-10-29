import { ClipboardList, ListTodo, MessagesSquare } from 'lucide-react';
import type { SpaceId } from '@ap/contracts';
import { isUuid } from '@ap/feature-bridge';
import type { FeatureEntry, FeatureSlot } from '@ap/kernel';
import type { SPACES } from './menus';

/** The space ids `SPACES` declares, as plain literals, so a key that names no declared space fails typecheck. */
type AppSpaceId = (typeof SPACES)[number]['id'] extends infer Id ? Id extends infer Raw & SpaceId ? Raw : never : never;

/**
 * Space → feature Managed System (ADR-0045: one per space; never inferred from Site or equipment ids, ADR-0004).
 * The operations space has no row, so it draws no feature block.
 */
export const FEATURE_MANAGED_SYSTEMS: Readonly<Partial<Record<AppSpaceId, string>>> = {
  // mock 합성 값, 실제 배포는 조립 계층이 교체
  mars: '4f1b2c3d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
  bravo: '7a8b9c0d-1e2f-4a3b-9c4d-5e6f7a8b9c0d',
};

/** The Managed System id of a space (ADR-0045), or null when it has no row or the id is not a UUID. The one lookup for the sidebar entries and the VOC 등록 form's default. */
export function managedSystemFor(spaceId: string | null): string | null {
  if (spaceId === null) return null;
  const managedSystemId = (FEATURE_MANAGED_SYSTEMS as Readonly<Record<string, string | undefined>>)[spaceId];
  return managedSystemId !== undefined && isUuid(managedSystemId) ? managedSystemId : null;
}

/** One bottom-block entry: an in-shell menu opened with the space's Managed System. */
type Row = Pick<FeatureEntry, 'key' | 'label' | 'icon' | 'menuId'>;
const ENTRIES: readonly Row[] = [
  { key: 'voc', icon: MessagesSquare, label: { ko: 'VOC', en: 'VOC' }, menuId: 'inbox' },
  { key: 'task', icon: ListTodo, label: { ko: 'Task', en: 'Tasks' }, menuId: 'task-list' },
  { key: 'survey', icon: ClipboardList, label: { ko: '설문', en: 'Surveys' }, menuId: 'survey-management' },
];

/** The feature slot for the app; every feature screen is a platform menu (ADR-0081 decision 6). */
export function featureSlot(): FeatureSlot {
  return {
    entriesFor: (spaceId) => {
      const managedSystemId = managedSystemFor(spaceId);
      if (managedSystemId === null) return null;
      return ENTRIES.map((row): FeatureEntry => ({ key: row.key, label: row.label, icon: row.icon, menuId: row.menuId, page: { managedSystem: managedSystemId } }));
    },
    permission: 'features:access',
  };
}
