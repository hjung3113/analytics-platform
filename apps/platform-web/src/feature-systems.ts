import { useEffect, useSyncExternalStore } from 'react';
import { ClipboardList, ListTodo, MessagesSquare } from 'lucide-react';
import type { DefaultStatus } from '@ap/feature-bridge';
import type { FeatureEntry, FeatureSlot } from '@ap/kernel';
import { linkedSystemOf, platformSystemOf, spaceSystems } from './space-systems';

/**
 * The Managed System a screen's VOC belongs to by default (ADR-0045, ADR-0110 decision 5): inside a business-system space, that space's linked system, only while the link is
 * declared; with no space (home, 소통, 내 활동, the shell) the 「플랫폼」 system. Never inferred from Site or equipment ids (ADR-0153). It reads the app's link store
 * (`space-systems.ts`) synchronously and is `null` until the store is ready, for a space without a declared link, and when the server has no 「플랫폼」 system.
 * The one lookup for the sidebar entries and the VOC 등록 form's default.
 */
export function managedSystemFor(spaceId: string | null): string | null {
  const snapshot = spaceSystems.getSnapshot();
  return spaceId === null ? platformSystemOf(snapshot) : linkedSystemOf(snapshot, spaceId);
}

/**
 * Whether the lookup behind `managedSystemFor` has answered. The rail 「VOC 등록」 form blocks its submit until `ready` (a VOC must not silently lose its default) and a failed
 * load is retried when the form next opens (this hook mounts with the form). A module-level hook, so the compose slot keeps one stable `Compose`.
 */
export function useComposeDefaultStatus(): DefaultStatus {
  const status = useSyncExternalStore(spaceSystems.subscribe, () => spaceSystems.getSnapshot().status);
  useEffect(() => { spaceSystems.retryIfFailed(); }, []);
  return status === 'ready' ? 'ready' : status === 'failed' ? 'failed' : 'pending';
}

/** One bottom-block entry: an in-shell menu opened with the space's Managed System. */
type Row = Pick<FeatureEntry, 'key' | 'label' | 'icon' | 'menuId'>;
const ENTRIES: readonly Row[] = [
  { key: 'voc', icon: MessagesSquare, label: { ko: 'VOC', en: 'VOC' }, menuId: 'inbox' },
  { key: 'task', icon: ListTodo, label: { ko: 'Task', en: 'Tasks' }, menuId: 'task-list' },
  { key: 'survey', icon: ClipboardList, label: { ko: '설문', en: 'Surveys' }, menuId: 'survey-management' },
];

/** The feature slot for the app; every feature screen is a platform menu (ADR-0081 decision 6). Only a declared link draws a block: the 「플랫폼」 default belongs to the VOC form, not to a space. */
export function featureSlot(): FeatureSlot {
  return {
    entriesFor: (spaceId) => {
      const managedSystemId = linkedSystemOf(spaceSystems.getSnapshot(), spaceId);
      if (managedSystemId === null) return null;
      return ENTRIES.map((row): FeatureEntry => ({ key: row.key, label: row.label, icon: row.icon, menuId: row.menuId, page: { managedSystem: managedSystemId } }));
    },
    permission: 'features:access',
  };
}
