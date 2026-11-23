import type { ComponentType, ReactNode } from 'react';
import { ChevronLeft, Clock3, Star } from 'lucide-react';
import { emptyGlobal, type NavView, type SpaceId } from '@ap/contracts';
import { badgeCountText } from '@ap/components';
import { type MenuEntry, PlatformLink, useI18n, useMessages, useRecentVisits } from '@ap/kernel';
import { isImplementedMenu, useHostPlatform } from '@ap/kernel/host';
import { navRowVariants, NavCurrentMarker, cn, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@ap/ui';
import { ScopeSelector } from '../context/ScopeSelector';
import { SHELL_MESSAGES } from '../messages';
import { ShellBoundary } from './ShellBoundary';
import { UndeclaredBoundary, withUndeclared } from './undeclared';
import { SidebarHierarchy, SIDEBAR_GROUP_TITLE } from './SidebarHierarchy';
import { useSystemSections } from './systemSections';

/** The business-system sidebar (240px). Collapsing removes it and leaves the rail (#2727); `onToggle` collapses it. */
export function AppSidebar({ onToggle }: { onToggle: () => void }) {
  const { visibleMenus, route, favorites, registry, sidebarSpace, slots, page, linkTo, canOpen } = useHostPlatform();
  const { t, tx } = useI18n();
  const m = useMessages(SHELL_MESSAGES);
  const activeId = route?.menu.navHidden && route.menu.parent ? route.menu.parent : route?.menu.id;
  const systems = useSystemSections();
  // In a real system only the current section is drawn (15 §3.2). Fallback screens (unmatched, entry denied) keep every group.
  const currentSection = systems?.sections.find(section => section.group.id === systems.currentGroupId) ?? null;
  const grouped = systems !== null
    ? (currentSection === null ? [] : [currentSection])
    : (sidebarSpace === null ? [] : registry.groups.filter(g => g.space === sidebarSpace.id))
      .map(group => ({ group, items: visibleMenus.filter(m => !m.navHidden && m.group === group.id) }));
  // A group with no visible menu is drawn only when the operator's list holds one of its menus (#2201); `systems` drops such sections itself, so this is the fallback sidebar only.
  // Operator-only rows (#1846): a menu no server declaration grants to anyone is not in `visibleMenus`; the slot's list draws it greyed in its own
  // group at its Registry position. Sidebar only: the palette, favorites, recents, resume and every access check read `visibleMenus`, which never holds it.
  const registryOrder = new Map(registry.menus.map((menu, index) => [menu.id, index]));
  const hasHierarchy = grouped.some(({ items }) => items.some(menu => menu.navTree && canOpen(menu.id)));
  const sectionName = currentSection === null ? null : tx(currentSection.group.label);
  const favoriteMenus = favorites.map(id => visibleMenus.find(m => m.id === id)).filter((m): m is MenuEntry => !!m);
  // A favorite is a menu id, not an address: it opens the menu's default view and never borrows the current carry-set page state (the global Context still follows).
  const favoriteHref = (menu: MenuEntry) => linkTo(menu.id, { page: Object.fromEntries((registry.carrySetOf(menu)?.pageKeys ?? []).map(key => [key, null])) });
  // The counts component is rendered once around the menu list; without a slot (or for a space without counts) the list gets `null` counts (06 §8 `navCounts`).
  // A matched menu the actor cannot open is refused by the outlet; its space-slot subtrees (and their sessions and queries) are never resolved or mounted either, even when another member keeps the space reachable.
  const slotMenu = route !== null && !canOpen(route.menu.id) ? undefined : route?.menu ?? null;
  // The slots' `For` selectors run inside their own boundary (a leaf component each), so a throwing selector costs only that region (#1876).
  const slotSpaceId = sidebarSpace === null || slotMenu === undefined ? null : sidebarSpace.id;

  return <TooltipProvider delayDuration={200}>
    <aside id={SIDEBAR_ID} className="flex h-full w-(--sidebar-width) shrink-0 flex-col border-r border-border-chrome bg-surface-sidebar">
      <div className="flex h-[50px] shrink-0 items-center justify-between border-b border-border-subtle px-3">
        {(systems === null || sidebarSpace === null
          ? <p className="min-w-0 truncate text-sm font-semibold">{t('platformName')}</p>
          : <div className="min-w-0"><p className="truncate text-sm font-semibold">{tx(sidebarSpace.label)}</p>
            {sectionName !== null && sectionName !== tx(sidebarSpace.label) && <p className="truncate text-caption text-text-muted">{sectionName}</p>}</div>)}
        <Tooltip><TooltipTrigger asChild>
          <button type="button" onClick={onToggle} aria-label={t('collapse')} aria-keyshortcuts="["
            className="ml-auto grid size-7 shrink-0 place-items-center rounded-md text-text-muted hover:bg-surface-row-hover hover:text-text-primary">
            <ChevronLeft className="size-4" aria-hidden />
          </button>
        </TooltipTrigger><TooltipContent side="right">{t('collapse')} ([)</TooltipContent></Tooltip>
      </div>
      <SidebarScope />
      <div data-sidebar-scroll className={hasHierarchy ? 'shell-scroll min-h-0 flex-1 overflow-hidden px-2 py-2' : 'shell-scroll min-h-0 flex-1 overflow-y-auto px-2 py-2'}>
        <UndeclaredBoundary>{undeclared => <CountsBoundary key={`counts:${slotSpaceId}`} spaceId={slotSpaceId} menu={slotMenu ?? null}>{counts => <nav id="platform-nav" aria-label={m('primaryNav')}>
          {grouped.map(g => ({ ...g, rows: withUndeclared(g.items, g.group.id, undeclared, registry.menus, registryOrder) })).filter(g => g.rows.length > 0).map(({ group, items, rows }, index) => <div key={group.id} role="group" aria-label={tx(group.label)}>
            {systems === null && !(group.hideLabelWhenSingle && rows.length === 1) && <p className={cn(SIDEBAR_GROUP_TITLE, index === 0 ? 'mt-1.5' : 'mt-3.5')}>{tx(group.label)}</p>}
            <ul className="space-y-0.5">{rows.map(entry => {
              if ('undeclaredPermission' in entry) return <li key={entry.menu.id}><UndeclaredNavRow menu={entry.menu} permission={entry.undeclaredPermission} /></li>;
              const menu = entry;
              const views = menu.navViews?.length ? menu.navViews : null;
              const currentView = views !== null && route?.menu.id === menu.id ? currentNavView(views, page) : null;
              return <li key={menu.id}>
                <NavItem menu={menu} active={menu.id === activeId && currentView === null} navCount={counts?.[menu.id]} />
                {views !== null && <ul className="mt-0.5 space-y-0.5">{views.map(view => <li key={view.id}><NavViewItem menu={menu} view={view} active={view === currentView} count={counts?.[`${menu.id}/${view.id}`]} /></li>)}</ul>}
              </li>;
            })}</ul>
            {items.filter(menu => menu.navTree && canOpen(menu.id)).map(menu => <SidebarHierarchy key={menu.id} menu={menu} />)}
          </div>)}
        </nav>}</CountsBoundary>}</UndeclaredBoundary>
        {slotSpaceId !== null && <ShellBoundary key={`section:${slotSpaceId}`}><SpaceNavSectionSlot spaceId={slotSpaceId} menu={slotMenu ?? null} /></ShellBoundary>}
        {/* An empty list keeps its guidance (07 §3 empty state). */}
        <section aria-label={t('favorites')}>
          <p className={cn(SIDEBAR_GROUP_TITLE, 'mt-3.5 flex items-center gap-1')}><Star className="size-3" aria-hidden />{t('favorites')}</p>
          {favoriteMenus.length > 0
            ? <ul className="space-y-0.5">{favoriteMenus.map(menu => <li key={menu.id}><NavItem menu={menu} active={false} href={favoriteHref(menu)} /></li>)}</ul>
            : <p className="px-3 py-1 text-xs leading-4 text-text-muted">{t('noFavorites')}</p>}
        </section>
        <SidebarRecent />
      </div>
      <ShellBoundary key={`features:${sidebarSpace?.id ?? ''}`} fallback={null}><FeatureBlock /></ShellBoundary>
      {slots.sidebarNotice != null && <div data-sidebar-notice className="shrink-0 border-t border-border-subtle px-4 py-2.5 text-caption text-text-muted"><ShellBoundary fallback={null}>{slots.sidebarNotice}</ShellBoundary></div>}
    </aside>
  </TooltipProvider>;
}

/**
 * A menu hidden by an undeclared permission, shown to the operator in place (06 §7, #1846): the same row frame as `NavItem`, not navigable
 * (`aria-disabled`, no href), reachable by keyboard so focus shows the reason and the permission key. No hover or selected surface.
 * The label stays `text-text-muted` (no opacity) with the note beside it.
 */
function UndeclaredNavRow({ menu, permission }: { menu: MenuEntry; permission: string }) {
  const { tx, t } = useI18n();
  const Icon = menu.icon;
  const label = tx(menu.label);
  const name = t('undeclaredMenuNamed', { label, permission });
  const row = <div role="link" aria-disabled="true" tabIndex={0} aria-label={name} data-undeclared-menu={menu.id} className={cn(navRowVariants({ inert: true }), 'cursor-default break-keep')}>
    <Icon className="size-4 shrink-0" aria-hidden />
    <span className="min-w-0 flex-1 truncate">{label}</span><span aria-hidden className="shrink-0 t-badge text-text-muted">{t('undeclaredMenu')}</span>
  </div>;
  return <Tooltip><TooltipTrigger asChild>{row}</TooltipTrigger><TooltipContent side="right">{name}</TooltipContent></Tooltip>;
}

const NoCounts = ({ children }: { children: (counts: null) => ReactNode }) => <>{children(null)}</>;
type CountsRender = (counts: Readonly<Record<string, number>> | null) => ReactNode;
/** Menu code (`navCounts`, its `For` selector included) wraps the menu list: when it throws, the same list renders without counts (#1876). */
function CountsBoundary({ spaceId, menu, children }: { spaceId: SpaceId | null; menu: MenuEntry | null; children: CountsRender }) {
  return <ShellBoundary fallback={<NoCounts>{children}</NoCounts>}><CountsHostSlot spaceId={spaceId} menu={menu}>{children}</CountsHostSlot></ShellBoundary>;
}
function CountsHostSlot({ spaceId, menu, children }: { spaceId: SpaceId | null; menu: MenuEntry | null; children: CountsRender }) {
  const { slots } = useHostPlatform();
  const Host: ComponentType<{ children: CountsRender }> = (spaceId === null ? null : slots.navCounts?.For(spaceId, menu)) ?? NoCounts;
  return <Host>{children}</Host>;
}

/** The space's own nav section (`spaceNavSection`): the `For` selector and the body both run under the caller's boundary. */
function SpaceNavSectionSlot({ spaceId, menu }: { spaceId: SpaceId; menu: MenuEntry | null }) {
  const { slots } = useHostPlatform();
  const { tx } = useI18n();
  const section = slots.spaceNavSection?.For(spaceId, menu) ?? null;
  if (section === null) return null;
  return <section aria-label={tx(section.label)}>
    <p className={cn(SIDEBAR_GROUP_TITLE, 'mt-3.5')}>{tx(section.label)}</p>
    <ShellBoundary><section.Body /></ShellBoundary>
  </section>;
}

/** The recent-visit list, a leaf of its own: a visit wakes only this list, never the menu tree around it (#824). */
function SidebarRecent() {
  const { visibleMenus, registry } = useHostPlatform();
  const recent = useRecentVisits();
  const { t } = useI18n();
  const recentItems = recent.filter(r => visibleMenus.some(m => m.id === r.menuId)).slice(0, 5);
  return <section aria-label={t('recent')}>
    <p className={cn(SIDEBAR_GROUP_TITLE, 'mt-3.5 flex items-center gap-1')}><Clock3 className="size-3" aria-hidden />{t('recent')}</p>
    {recentItems.length > 0
      ? <ul className="space-y-0.5">{recentItems.map(r => <li key={r.menuId}><NavItem menu={registry.menuById(r.menuId)} active={false} href={r.url} labelPrefix={t('recent')} /></li>)}</ul>
      : <p className="px-3 py-1 text-xs leading-4 text-text-muted">{t('noRecent')}</p>}
  </section>;
}

/** The view whose preset keys all equal the URL's page values; with several matches the one with the most keys wins, then declaration order. The registry guarantees a non-empty preset. */
function currentNavView(views: readonly NavView[], page: readonly (readonly [string, string])[]): NavView | null {
  let best: NavView | null = null;
  for (const view of views) {
    const keys = Object.keys(view.page);
    if (keys.length === 0 || !keys.every(key => page.some(([pk, pv]) => pk === key && pv === view.page[key]))) continue;
    if (best === null || keys.length > Object.keys(best.page).length) best = view;
  }
  return best;
}

/** The open sidebar's element id: the rail's category buttons control it (#2727). */
export const SIDEBAR_ID = 'platform-sidebar';

// A space may supply its own list-scope control (06 §8 `scopeControl`): it stays at the top of the space's sidebar. Every other space keeps
// the analytics Scope selector, which is the title-row chip (`PageScopeChip`, #2727), not a sidebar row.
function SidebarScope() {
  const { slots, sidebarSpace, route, canOpen } = useHostPlatform();
  const denied = route !== null && !canOpen(route.menu.id);
  if (sidebarSpace === null || denied || !slots.scopeControl) return null;
  return <ShellBoundary key={`scope:${sidebarSpace.id}`}><ScopeControlSlot spaceId={sidebarSpace.id} menu={route?.menu ?? null}>{Control => Control && <Control collapsed={false} />}</ScopeControlSlot></ShellBoundary>;
}

/** Leaf of its own so the `scopeControl.For` selector runs under the caller's boundary. The sidebar is never collapsed while it is drawn. */
function ScopeControlSlot({ spaceId, menu, children }: { spaceId: SpaceId; menu: MenuEntry | null; children: (control: ComponentType<{ collapsed: boolean }> | null) => ReactNode }) {
  const { slots } = useHostPlatform();
  return children(slots.scopeControl?.For(spaceId, menu) ?? null);
}

/**
 * The analytics Scope selector at the start of the page title row (#2727), the same place with the sidebar open or collapsed. Global screens
 * (no space) have none; nor has a space with `scopePresentation: 'hidden'` or one whose own `scopeControl` sits in its sidebar (#1251).
 */
export function PageScopeChip() {
  const { slots, sidebarSpace, route, registry, canOpen } = useHostPlatform();
  if (route === null || registry.spaceOf(route.menu) === null || sidebarSpace === null || sidebarSpace.scopePresentation === 'hidden') return null;
  const chip = <div data-page-scope-chip className="flex min-w-0"><ScopeSelector /></div>;
  if (!canOpen(route.menu.id) || !slots.scopeControl) return chip;
  return <ShellBoundary key={`chip:${sidebarSpace.id}`} fallback={null}><ScopeControlSlot spaceId={sidebarSpace.id} menu={route.menu}>{Control => Control === null && chip}</ScopeControlSlot></ShellBoundary>;
}

function FeatureBlock() {
  const { slots, route, currentSpace, sidebarSpace, accessibleSpaces, can, resolveLink, linkTo } = useHostPlatform();
  const { tx } = useI18n();
  const m = useMessages(SHELL_MESSAGES);
  const slot = slots.features;
  // Only the space this sidebar is drawing, and only when the route is that space's menu.
  // A denied-space URL and an unmatched path keep a fallback sidebar but must not query another space.
  if (!slot || sidebarSpace === null || !accessibleSpaces.some(space => space.id === sidebarSpace.id)) return null;
  if (route === null || currentSpace?.id !== sidebarSpace.id) return null;
  // No access to features → no block at all (ADR-0081 decision 8); the shell names no app permission, the slot does.
  if (slot.permission !== undefined && !can(slot.permission)) return null;
  // An entry opens in this tab with only its own page keys and the way back; no global Context is carried (ADR-0045, UX-9).
  const entries = slot.entriesFor(sidebarSpace.id)
    ?.filter(entry => resolveLink(entry.menuId, { global: emptyGlobal, page: entry.page, returnTo: true }).allowed);
  if (!entries || entries.length === 0) return null;
  const spaceName = tx(sidebarSpace.label);
  const featureName = m('featuresLabel');
  const heading = `${featureName} · ${spaceName}`;
  return <nav aria-label={heading} className="shrink-0 border-t border-border-subtle px-2 py-2">
    <p className={cn(SIDEBAR_GROUP_TITLE)}>{heading}</p>
    <ul className="space-y-0.5">{entries.map(entry => {
      const Icon = entry.icon;
      const label = tx(entry.label);
      const inShellName = `${label} · ${spaceName}, ${featureName}`;
      const inShell = <PlatformLink via="sidebar" href={linkTo(entry.menuId, { global: emptyGlobal, page: entry.page, returnTo: true })} aria-label={inShellName}
        className={navRowVariants({ feature: true })}>
        <Icon className="size-4 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1 truncate">{label}</span>
      </PlatformLink>;
      return <li key={entry.key}><Tooltip><TooltipTrigger asChild>{inShell}</TooltipTrigger><TooltipContent side="right">{inShellName}</TooltipContent></Tooltip></li>;
    })}</ul>
  </nav>;
}

export function NavItem({ menu, active, href, labelPrefix, label: labelOverride, unread, navCount }: { menu: MenuEntry; active: boolean; href?: string; labelPrefix?: string; label?: string; unread?: number | null; navCount?: number }) {
  const { linkTo } = useHostPlatform();
  const { tx, t } = useI18n();
  const Icon = menu.icon;
  const label = labelOverride ?? tx(menu.label);
  const count = unread !== undefined && unread !== null && unread > 0 ? unread : 0;
  const name = labelPrefix ? `${labelPrefix}: ${label}` : label;
  const hasCount = navCount !== undefined && navCount >= 0;
  return <PlatformLink via="sidebar" href={href ?? linkTo(menu.id)} aria-label={count > 0 ? t('unreadNamed', { label: name, count }) : hasCount ? t('countNamed', { label: name, count: navCount }) : name} aria-current={active ? 'page' : undefined}
    className={navRowVariants({ active })}>
    {active && <NavCurrentMarker />}
    <Icon className="size-4 shrink-0" aria-hidden />
    <span className="min-w-0 flex-1 truncate">{label}</span>{!isImplementedMenu(menu) && <span className="rounded-pill bg-surface-row-selected px-1.5 py-0.5 t-badge text-text-secondary">{t('planned')}</span>}{count > 0 && <span aria-hidden className="rounded-pill bg-surface-row-selected px-1.5 py-0.5 t-badge text-text-secondary">{badgeCountText(count)}</span>}{count === 0 && hasCount && <span aria-hidden className="rounded-pill bg-surface-row-selected px-1.5 py-0.5 t-badge text-text-secondary">{badgeCountText(navCount)}</span>}
  </PlatformLink>;
}

/** A `navViews` sub-item under its menu row (expanded sidebar only). Only the current view carries `aria-current`; its parent row then does not. */
function NavViewItem({ menu, view, active, count }: { menu: MenuEntry; view: NavView; active: boolean; count?: number }) {
  const { linkTo } = useHostPlatform();
  const { tx, t } = useI18n();
  const label = tx(view.label);
  const hasCount = count !== undefined && count >= 0;
  return <PlatformLink via="sidebar" href={linkTo(menu.id, { page: view.page })} aria-label={hasCount ? t('countNamed', { label, count }) : label} aria-current={active ? 'page' : undefined}
    className={navRowVariants({ inset: true, active })}>
    {active && <NavCurrentMarker />}
    <span className="min-w-0 flex-1 truncate">{label}</span>
    {hasCount && <span aria-hidden className="rounded-pill bg-surface-row-selected px-1.5 py-0.5 t-badge text-text-secondary">{badgeCountText(count)}</span>}
  </PlatformLink>;
}
