import { lazy, Suspense } from 'react';
import type { HierarchySource } from '@ap/contracts';
import { useHierarchyNavState } from '@ap/components';
import { useI18n, type MenuEntry, type PlatformMenuEntry } from '@ap/kernel';
import { useHostPlatform } from '@ap/kernel/host';
import { cn } from '@ap/ui';
import { ShellBoundary } from './ShellBoundary';

const HierarchyNav = lazy(() => import('./SidebarHierarchyNav'));

export const SIDEBAR_GROUP_TITLE = 'mx-2 mb-1 t-nav-group text-text-muted';

/** Called only with a visible declaring menu. Refuse access before mounting its Source component. */
export function SidebarHierarchy({ menu }: { menu: MenuEntry }) {
  const { canOpen, session, revision } = useHostPlatform();
  if (!menu.navTree || !canOpen(menu.id)) return null;
  const Source = menu.navTree.Source;
  // Menu code: a throwing Source shows a retry line in this menu's section only, never breaking the sidebar or the screen (#1876).
  return <ShellBoundary><Source key={JSON.stringify([menu.id, session.user.id, revision])}>{source => <HierarchySection menu={menu} declaration={menu.navTree!} source={source} />}</Source></ShellBoundary>;
}

function HierarchySection({ menu, declaration, source }: { menu: MenuEntry; declaration: NonNullable<PlatformMenuEntry['navTree']>; source: HierarchySource }) {
  const { route, pageParam } = useHostPlatform();
  const { tx } = useI18n();
  const state = useHierarchyNavState(menu.id);
  const ownsRoute = route?.menu.id === menu.id || (route?.menu.navHidden && route.menu.parent === menu.id);
  const currentNodeId = ownsRoute && route ? declaration.currentNodeId?.({ menuId: route.menu.id, params: route.params, page: pageParam }) ?? null : null;
  const label = tx(declaration.label);
  // A stale nav chunk shows a retry inside the section, keeping its title (#1876).
  return <div role="group" aria-label={label}><p className={cn(SIDEBAR_GROUP_TITLE, 'mt-3.5')}>{label}</p>
    <ShellBoundary><Suspense fallback={<div className="h-8" aria-busy="true" />}><HierarchyNav menuId={menu.id} label={label} source={source} state={state} mode={declaration.mode} levelIcon={declaration.levelIcon} currentNodeId={currentNodeId} /></Suspense></ShellBoundary>
  </div>;
}
