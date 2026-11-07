// Shared mount harness of the log-knowledge screen tests (#1410 Q7): the registry, the detail-panel slot and the provider tree every
// screen test used to copy. Only the mount moved here; adapters, sessions and fixtures stay in their tests.
import { render } from '@testing-library/react';
import { BookOpen } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { groupId, menuPermission, spaceId, type Permission, type Text } from '@ap/contracts';
import { createRegistry, I18nProvider, PlatformProvider } from '@ap/kernel';
import type { testAdapter } from '@ap/kernel/testing';
import { DetailPanelSlotProvider, useDetailPanelSlotHost } from '@ap/ui';
import { manifests } from '../index';

type SpaceOptions = { description: Text; homeMenuId: string; permission?: Permission };

/** The `logDev` space with the `logKnowledge` group over this menu's manifests. */
export function knowledgeRegistry(permissions: string[], space: SpaceOptions) {
  return createRegistry({
    permissions: permissions.map(menuPermission),
    spaces: [{ id: spaceId('logDev'), label: { ko: '로그', en: 'Log' }, ...space }],
    groups: [{ id: groupId('logKnowledge'), label: { ko: '지식', en: 'Knowledge' }, icon: BookOpen, space: spaceId('logDev') }],
    menus: manifests,
  });
}

export function Slot({ label }: { label?: string }) {
  const slot = useDetailPanelSlotHost();
  return <aside ref={slot.ref} {...(label ? { 'aria-label': label } : {})} />;
}

export type MountWith = {
  registry: ReturnType<typeof knowledgeRegistry>;
  adapter: ReturnType<typeof testAdapter>;
  ui: ReactNode;
  /** Renders the detail-panel slot beside `ui` (default: no slot). */
  slot?: boolean;
  /** Accessible name of the slot (`aria-label`). */
  slotLabel?: string;
  location?: ComponentProps<typeof PlatformProvider>['location'];
  /** Rendered inside the I18nProvider, before the platform tree. */
  head?: ReactNode;
};

/** The provider tree of a screen test; `rerender` calls and `renderHook` wrappers reuse it. */
export const treeWith = ({ registry, adapter, ui, slot = false, slotLabel, location, head }: MountWith) => (
  <I18nProvider>{head}<PlatformProvider registry={registry} adapter={adapter} {...(location ? { location } : {})}><DetailPanelSlotProvider>{ui}{slot && <Slot {...(slotLabel ? { label: slotLabel } : {})} />}</DetailPanelSlotProvider></PlatformProvider></I18nProvider>
);

export const mountWith = (options: MountWith) => render(treeWith(options));
