import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Clock3, Star } from 'lucide-react';
import { emptyGlobal, type NavView } from '@ap/contracts';
import { badgeCountText } from '@ap/components';
import { type MenuEntry, PlatformLink, useI18n, useRecentVisits } from '@ap/kernel';
import { useHostPlatform } from '@ap/kernel/host';
import { cn, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@ap/ui';
import { ScopeSelector } from '../context/ScopeSelector';
import { useSystemSections } from './systemSections';
import { PROTO_1189 } from './proto1189';
import { SystemSwitcher } from './SystemSwitcher';

export function AppSidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const { visibleMenus, route, favorites, registry, sidebarSpace, slots, page, linkTo, canOpen } = useHostPlatform();
  const { t, tx, lang } = useI18n();
  const activeId = route?.menu.navHidden && route.menu.parent ? route.menu.parent : route?.menu.id;
  const systems = useSystemSections();
  // In a real system only the current section is drawn (15 §3.2). Fallback screens (unmatched, entry denied) keep every group.
  const currentSection = systems?.sections.find(section => section.group.id === systems.currentGroupId) ?? null;
  const grouped = systems !== null
    ? (currentSection === null ? [] : [currentSection])
    : (sidebarSpace === null ? [] : registry.groups.filter(g => g.space === sidebarSpace.id))
      .map(group => ({ group, items: visibleMenus.filter(m => !m.navHidden && m.group === group.id) })).filter(g => g.items.length);
  const sectionName = currentSection === null ? null : tx(currentSection.group.label);
  const favoriteMenus = favorites.map(id => visibleMenus.find(m => m.id === id)).filter((m): m is MenuEntry => !!m);
  // A favorite is a menu id, not an address: it opens the menu's default view and never borrows the current carry-set page state (the global Context still follows).
  const favoriteHref = (menu: MenuEntry) => linkTo(menu.id, { page: Object.fromEntries((registry.carrySetOf(menu)?.pageKeys ?? []).map(key => [key, null])) });
  // The counts component is rendered once around the menu list; without a slot (or for a space without counts) the list gets `null` counts (06 §8 `navCounts`).
  // A matched menu the actor cannot open is refused by the outlet; its space-slot subtrees (and their sessions and queries) are never resolved or mounted either, even when another member keeps the space reachable.
  const slotMenu = route !== null && !canOpen(route.menu.id) ? undefined : route?.menu ?? null;
  const CountsHost = (sidebarSpace === null || slotMenu === undefined ? null : slots.navCounts?.For(sidebarSpace.id, slotMenu)) ?? NoCounts;
  const sectionSlot = sidebarSpace === null || slotMenu === undefined ? null : slots.spaceNavSection?.For(sidebarSpace.id, slotMenu) ?? null;

  return <TooltipProvider delayDuration={200}>
    <aside data-collapsed={collapsed} className={cn('flex h-full shrink-0 flex-col border-r border-border-subtle bg-surface-sidebar', collapsed ? 'w-(--sidebar-width-collapsed)' : 'w-(--sidebar-width)')}>
      <div className="flex h-[50px] shrink-0 items-center justify-between border-b border-border-subtle px-3">
        {!collapsed && PROTO_1189 === 'C' ? <SystemSwitcher placement="head" subline={sectionName !== null && sidebarSpace !== null && sectionName !== tx(sidebarSpace.label) ? sectionName : null} /> : !collapsed && (sidebarSpace === null
          ? <p className="min-w-0 truncate text-sm font-semibold">{t('appName')}</p>
          : <div className="min-w-0"><p className="truncate text-sm font-semibold">{tx(sidebarSpace.label)}</p>
            {systems === null ? <p className="truncate text-caption text-text-muted">{t('appName')}</p>
              : sectionName !== null && sectionName !== tx(sidebarSpace.label) && <p className="truncate text-caption text-text-muted">{sectionName}</p>}</div>)}
        <Tooltip><TooltipTrigger asChild>
          <button type="button" onClick={onToggle} aria-label={collapsed ? t('expand') : t('collapse')} aria-keyshortcuts="["
            className="ml-auto grid size-7 shrink-0 place-items-center rounded-md text-text-muted hover:bg-surface-row-hover hover:text-text-primary">
            {collapsed ? <ChevronRight className="size-4" aria-hidden /> : <ChevronLeft className="size-4" aria-hidden />}
          </button>
        </TooltipTrigger><TooltipContent side="right">{collapsed ? t('expand') : t('collapse')} ([)</TooltipContent></Tooltip>
      </div>
      <SidebarScope collapsed={collapsed} />
      <div className="shell-scroll min-h-0 flex-1 overflow-y-auto px-2 py-2">
        <CountsHost>{counts => <nav aria-label={lang === 'ko' ? '주 메뉴' : 'Primary'}>
          {grouped.map(({ group, items }, index) => <div key={group.id} role="group" aria-label={tx(group.label)}>
            {!collapsed && systems === null && !(group.hideLabelWhenSingle && items.length === 1) && <p className={cn('mx-2 mb-1 text-caption font-semibold uppercase tracking-wide text-text-muted', index === 0 ? 'mt-1.5' : 'mt-3.5')}>{tx(group.label)}</p>}
            {collapsed && index > 0 && <div className="mx-3 my-1.5 border-t border-border-subtle" aria-hidden />}
            <ul className="space-y-0.5">{items.map(menu => {
              const views = !collapsed && menu.navViews?.length ? menu.navViews : null;
              const currentView = views !== null && route?.menu.id === menu.id ? currentNavView(views, page) : null;
              return <li key={menu.id}>
                <NavItem menu={menu} active={menu.id === activeId && currentView === null} collapsed={collapsed} navCount={counts?.[menu.id]} />
                {views !== null && <ul className="mt-0.5 space-y-0.5">{views.map(view => <li key={view.id}><NavViewItem menu={menu} view={view} active={view === currentView} count={counts?.[`${menu.id}/${view.id}`]} /></li>)}</ul>}
              </li>;
            })}</ul>
          </div>)}
        </nav>}</CountsHost>
        {!collapsed && sectionSlot !== null && <section aria-label={tx(sectionSlot.label)}>
          <p className="mx-2 mb-1 mt-3.5 text-caption font-semibold uppercase tracking-wide text-text-muted">{tx(sectionSlot.label)}</p>
          <sectionSlot.Body />
        </section>}
        {/* Expanded only (prototype C). An empty list keeps its guidance (07 §3 empty state). */}
        {!collapsed && <section aria-label={t('favorites')}>
          <p className="mx-2 mb-1 mt-3.5 flex items-center gap-1 text-caption font-semibold uppercase tracking-wide text-text-muted"><Star className="size-3" aria-hidden />{t('favorites')}</p>
          {favoriteMenus.length > 0
            ? <ul className="space-y-0.5">{favoriteMenus.map(menu => <li key={menu.id}><NavItem menu={menu} active={false} collapsed={collapsed} href={favoriteHref(menu)} /></li>)}</ul>
            : <p className="px-3 py-1 text-xs leading-4 text-text-muted">{t('noFavorites')}</p>}
        </section>}
        {!collapsed && <SidebarRecent />}
      </div>
      <FeatureBlock collapsed={collapsed} />
      {!collapsed && <div className="shrink-0 border-t border-border-subtle px-4 py-2.5 text-caption text-text-muted">{lang === 'ko' ? '통합 프로토타입 · 합성 데이터' : 'Integrated prototype · synthetic data'}</div>}
    </aside>
  </TooltipProvider>;
}

const NoCounts = ({ children }: { children: (counts: null) => ReactNode }) => <>{children(null)}</>;

/** The recent-visit list, a leaf of its own: a visit wakes only this list, never the menu tree around it (#824). */
function SidebarRecent() {
  const { visibleMenus, registry } = useHostPlatform();
  const recent = useRecentVisits();
  const { t } = useI18n();
  const recentItems = recent.filter(r => visibleMenus.some(m => m.id === r.menuId)).slice(0, 5);
  return <section aria-label={t('recent')}>
    <p className="mx-2 mb-1 mt-3.5 flex items-center gap-1 text-caption font-semibold uppercase tracking-wide text-text-muted"><Clock3 className="size-3" aria-hidden />{t('recent')}</p>
    {recentItems.length > 0
      ? <ul className="space-y-0.5">{recentItems.map(r => <li key={r.menuId}><NavItem menu={registry.menuById(r.menuId)} active={false} collapsed={false} href={r.url} labelPrefix={t('recent')} /></li>)}</ul>
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

// A space may supply its own list-scope control (06 §8 `scopeControl`); every other space and space-less page keeps the analytics Scope selector.
function SidebarScope({ collapsed }: { collapsed: boolean }) {
  const { slots, sidebarSpace, route, canOpen } = useHostPlatform();
  const denied = route !== null && !canOpen(route.menu.id);
  const Control = sidebarSpace === null || denied ? null : slots.scopeControl?.For(sidebarSpace.id, route?.menu ?? null) ?? null;
  return Control === null ? <ScopeSelector collapsed={collapsed} /> : <Control collapsed={collapsed} />;
}

function FeatureBlock({ collapsed }: { collapsed: boolean }) {
  const { slots, route, currentSpace, sidebarSpace, accessibleSpaces, can, resolveLink } = useHostPlatform();
  const { tx, lang } = useI18n();
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
  const featureName = lang === 'ko' ? '기능' : 'Features';
  const heading = `${featureName} · ${spaceName}`;
  return <nav aria-label={heading} className="shrink-0 border-t border-border-subtle px-2 py-2">
    {!collapsed && <p className="mx-2 mb-1 text-caption font-semibold text-text-muted">{heading}</p>}
    <ul className="space-y-0.5">{entries.map(entry => {
      const Icon = entry.icon;
      const label = tx(entry.label);
      const inShellName = `${label} — ${spaceName}, ${featureName}`;
      const inShell = <PlatformLink via="sidebar" href={resolveLink(entry.menuId, { global: emptyGlobal, page: entry.page, returnTo: true }).href} aria-label={inShellName}
        className={cn('flex min-h-8 items-center gap-2 rounded-md px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-row-hover hover:text-text-primary', collapsed && 'justify-center px-0')}>
        <Icon className="size-4 shrink-0" aria-hidden />
        {!collapsed && <span className="min-w-0 flex-1 truncate">{label}</span>}
      </PlatformLink>;
      return <li key={entry.key}><Tooltip><TooltipTrigger asChild>{inShell}</TooltipTrigger><TooltipContent side="right">{inShellName}</TooltipContent></Tooltip></li>;
    })}</ul>
    {!collapsed && <p className="px-3 pt-1 text-caption text-text-muted">{lang === 'ko' ? '기능 화면으로 이동합니다' : 'Opens feature screens'}</p>}
  </nav>;
}

export function NavItem({ menu, active, collapsed, href, labelPrefix, label: labelOverride, unread, navCount }: { menu: MenuEntry; active: boolean; collapsed: boolean; href?: string; labelPrefix?: string; label?: string; unread?: number | null; navCount?: number }) {
  const { linkTo } = useHostPlatform();
  const { tx, t } = useI18n();
  const Icon = menu.icon;
  const label = labelOverride ?? tx(menu.label);
  const count = unread !== undefined && unread !== null && unread > 0 ? unread : 0;
  const name = labelPrefix ? `${labelPrefix}: ${label}` : label;
  const hasCount = navCount !== undefined && navCount >= 0;
  const link = <PlatformLink via="sidebar" href={href ?? linkTo(menu.id)} aria-label={count > 0 ? t('unreadNamed', { label: name, count }) : hasCount ? t('countNamed', { label: name, count: navCount }) : name} aria-current={active ? 'page' : undefined}
    className={cn('relative flex min-h-8 items-center gap-2 rounded-md px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-row-hover hover:text-text-primary', collapsed && 'justify-center px-0', active && 'bg-surface-row-selected font-semibold text-text-primary')}>
    {active && <span data-current-marker aria-hidden className="absolute inset-y-2 left-0 w-0.5 rounded-pill bg-accent-primary" />}
    <Icon className="size-4 shrink-0" aria-hidden />
    {collapsed && count > 0 && <span aria-hidden className="absolute right-2 top-1.5 size-1.5 rounded-pill bg-accent-danger" />}
    {!collapsed && <><span className="min-w-0 flex-1 truncate">{label}</span>{!menu.component && !menu.moduleScreen && <span className="rounded-pill bg-surface-row-selected px-1.5 py-0.5 text-caption font-semibold text-text-secondary">{t('planned')}</span>}{count > 0 && <span aria-hidden className="rounded-pill bg-surface-row-selected px-1.5 py-0.5 text-caption font-semibold text-text-secondary">{badgeCountText(count)}</span>}{count === 0 && hasCount && <span aria-hidden className="rounded-pill bg-surface-row-selected px-1.5 py-0.5 text-caption font-semibold text-text-secondary">{badgeCountText(navCount)}</span>}</>}
  </PlatformLink>;
  return collapsed ? <Tooltip><TooltipTrigger asChild>{link}</TooltipTrigger><TooltipContent side="right">{label}{!menu.component && !menu.moduleScreen && ` · ${t('planned')}`}{count > 0 && ` · ${t('unreadCount', { count })}`}</TooltipContent></Tooltip> : link;
}

/** A `navViews` sub-item under its menu row (expanded sidebar only). Only the current view carries `aria-current`; its parent row then does not. */
function NavViewItem({ menu, view, active, count }: { menu: MenuEntry; view: NavView; active: boolean; count?: number }) {
  const { linkTo } = useHostPlatform();
  const { tx, t } = useI18n();
  const label = tx(view.label);
  const hasCount = count !== undefined && count >= 0;
  return <PlatformLink via="sidebar" href={linkTo(menu.id, { page: view.page })} aria-label={hasCount ? t('countNamed', { label, count }) : label} aria-current={active ? 'page' : undefined}
    className={cn('relative flex min-h-8 items-center gap-2 rounded-md py-1.5 pl-9 pr-3 text-sm text-text-secondary hover:bg-surface-row-hover hover:text-text-primary', active && 'bg-surface-row-selected font-semibold text-text-primary')}>
    {active && <span data-current-marker aria-hidden className="absolute inset-y-2 left-0 w-0.5 rounded-pill bg-accent-primary" />}
    <span className="min-w-0 flex-1 truncate">{label}</span>
    {hasCount && <span aria-hidden className="rounded-pill bg-surface-row-selected px-1.5 py-0.5 text-caption font-semibold text-text-secondary">{badgeCountText(count)}</span>}
  </PlatformLink>;
}
