import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { FolderTree, X } from 'lucide-react';
import type { HierarchySource } from '@ap/contracts';
import { useHierarchyNavState } from '@ap/components';
import { useI18n, type MenuEntry, type PlatformMenuEntry } from '@ap/kernel';
import { useHostPlatform, useLeaveRequest } from '@ap/kernel/host';
import { Button, navRowVariants, Popover, PopoverContent, PopoverTrigger, Tooltip, TooltipContent, TooltipTrigger } from '@ap/ui';
import { ShellBoundary } from './ShellBoundary';

const HierarchyNav = lazy(() => import('./SidebarHierarchyNav'));

export const SIDEBAR_GROUP_TITLE = 'mx-2 mb-1 mt-3.5 text-caption font-semibold uppercase tracking-wide text-text-muted';

/** Called only with a visible declaring menu. Refuse access before mounting its Source component. */
export function SidebarHierarchy({ menu, collapsed }: { menu: MenuEntry; collapsed: boolean }) {
  const { canOpen, session, revision } = useHostPlatform();
  if (!menu.navTree || !canOpen(menu.id)) return null;
  const Source = menu.navTree.Source;
  // Menu code: a throwing Source hides only this menu's section (a retry line when expanded), never the sidebar or the screen (#1876).
  return <ShellBoundary fallback={collapsed ? null : undefined}><Source key={JSON.stringify([menu.id, session.user.id, revision])}>{source => <HierarchySection menu={menu} declaration={menu.navTree!} source={source} collapsed={collapsed} />}</Source></ShellBoundary>;
}

function HierarchySection({ menu, declaration, source, collapsed }: { menu: MenuEntry; declaration: NonNullable<PlatformMenuEntry['navTree']>; source: HierarchySource; collapsed: boolean }) {
  const { route, pageParam } = useHostPlatform();
  const { t, tx } = useI18n();
  const state = useHierarchyNavState(menu.id);
  const leaveRequest = useLeaveRequest();
  const [open, setOpen] = useState(false);
  const navigated = useRef(false);
  const ownsRoute = route?.menu.id === menu.id || (route?.menu.navHidden && route.menu.parent === menu.id);
  const currentNodeId = ownsRoute && route ? declaration.currentNodeId?.({ menuId: route.menu.id, params: route.params, page: pageParam }) ?? null : null;
  const label = tx(declaration.label);
  // A guarded move replays without the link callback; close once the route's node actually changes.
  const shownNode = useRef(currentNodeId);
  useEffect(() => {
    if (shownNode.current === currentNodeId) return;
    shownNode.current = currentNodeId;
    navigated.current = true; setOpen(false);
  }, [currentNodeId]);
  // A stale nav chunk shows a retry inside the section (or the popover), keeping its title and trigger (#1876).
  const content = <ShellBoundary><Suspense fallback={<div className="h-8" aria-busy="true" />}><HierarchyNav menuId={menu.id} label={label} source={source} state={state} mode={declaration.mode} levelIcon={declaration.levelIcon} currentNodeId={currentNodeId} onNavigate={() => { navigated.current = true; setOpen(false); }} /></Suspense></ShellBoundary>;
  if (!collapsed) return <div role="group" aria-label={label}><p className={SIDEBAR_GROUP_TITLE}>{label}</p>{content}</div>;
  return <Popover open={open} onOpenChange={value => { navigated.current = false; setOpen(value); }}>
    <Tooltip><TooltipTrigger asChild><PopoverTrigger asChild><button type="button" aria-label={label} className={navRowVariants({ collapsed: true })}><FolderTree className="size-4 shrink-0" aria-hidden /></button></PopoverTrigger></TooltipTrigger><TooltipContent side="right">{label}</TooltipContent></Tooltip>
    <PopoverContent side="right" align="start" sideOffset={4} padding="none" aria-label={label} onEscapeKeyDown={event => { if (state.read().query !== '') { event.preventDefault(); state.update({ query: '', readyQuery: '' }); } }} onInteractOutside={event => { if (leaveRequest) event.preventDefault(); }} onCloseAutoFocus={event => { if (navigated.current) event.preventDefault(); }}>
      <div className="flex h-[50px] items-center justify-between border-b border-border-subtle px-3"><p className="min-w-0 truncate text-sm font-semibold break-keep">{label}</p><Button type="button" variant="navigation" size="icon-xs" aria-label={t('close')} onClick={() => setOpen(false)}><X className="size-4" aria-hidden /></Button></div>
      <div className="px-2 py-2">{content}</div>
    </PopoverContent>
  </Popover>;
}
