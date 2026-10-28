/**
 * Test harness for the FeedbackOps bridge menus (`@ap/feature-bridge/testing`, test files and `test-support` only; the root never re-exports it, so the production
 * bundle carries no `@testing-library/react`). Each menu's `test-support.tsx` calls `createFeatureMenuHarness` with its own manifests; this package never imports a menu.
 */
import { Suspense, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { render } from '@testing-library/react';
import { I18nProvider, PlatformProvider, createRegistry, usePlatform, type MenuEntry } from '@ap/kernel';
import { testAdapter, testSession } from '@ap/kernel/testing';
import { DetailPanelSlotProvider, useDetailPanelSlotHost } from '@ap/ui';
import { groupId, menuPermissions, spaceId, type Permission } from '@ap/contracts';

type Group = { id: string; label: { ko: string; en: string }; icon: LucideIcon };

/** The shell's detail aside: a `DetailDrawer` portals its content here. */
function SlotHost() {
  const slot = useDetailPanelSlotHost();
  return <aside ref={slot.ref} aria-label="상세 패널" />;
}

/** Renders the matched route's page like the shell does, and nothing for a menu the session lacks the permission for (the shell draws its permission state instead). */
function Routes() {
  const { route, can } = usePlatform();
  if (route === null || !menuPermissions(route.menu).every(can)) return null;
  const Page = route.menu.component;
  return Page ? <Suspense fallback={null}><Page key={route.menu.id} params={route.params} /></Suspense> : null;
}

/**
 * A `feedbackops` space with one group holding `manifests`, and `mountAt(url)` to render the matched page on a platform with an admin session.
 * `permissions` (default `platform:view` and `features:access`) are the session's. `detailSlot` (default on) adds the shell's detail slot a `DetailDrawer` portals into. `options.registry` mounts a different registry; `options.extra` renders beside the page.
 */
export function createFeatureMenuHarness({ manifests, homeMenuId, group, detailSlot = true, permissions = ['platform:view', 'features:access'] }: {
  manifests: readonly MenuEntry[]; homeMenuId: string; group: Group; detailSlot?: boolean; permissions?: readonly Permission[];
}) {
  const registry = createRegistry({
    spaces: [{ id: spaceId('feedbackops'), label: { ko: 'FeedbackOps', en: 'FeedbackOps' }, description: { ko: '목적', en: 'Purpose' }, permission: 'features:access', carriedPageKeys: ['managedSystem', 'returnTo'], homeMenuId }],
    groups: [{ id: groupId(group.id), label: group.label, icon: group.icon, space: spaceId('feedbackops') }],
    menus: manifests,
  });
  const session = testSession([...permissions], { user: { id: 'admin', name: 'admin', title: { ko: 'admin', en: 'admin' } } });
  const adapter = () => testAdapter({ session: () => session });

  function mountAt(url: string, options: { registry?: typeof registry; extra?: ReactNode } = {}) {
    window.history.replaceState(null, '', url);
    const page = detailSlot ? <DetailPanelSlotProvider><Routes /><SlotHost /></DetailPanelSlotProvider> : <Routes />;
    return render(<I18nProvider><PlatformProvider adapter={adapter()} registry={options.registry ?? registry}>{page}{options.extra}</PlatformProvider></I18nProvider>);
  }

  return { registry, mountAt };
}
