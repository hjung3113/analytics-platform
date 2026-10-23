import { ChevronLeft, ChevronRight, Clock3, ExternalLink, Star } from 'lucide-react';
import { platformReturnFor } from '@ap/contracts';
import { type MenuEntry, PlatformLink, useI18n } from '@ap/kernel';
import { useHostPlatform } from '@ap/kernel/host';
import { cn, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@ap/ui';
import { ScopeSelector } from './ScopeSelector';
import { useSystemSections } from './systemSections';
import { formatUnread } from './unread';

export function AppSidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const { visibleMenus, route, favorites, recent, registry, sidebarSpace } = useHostPlatform();
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
  const recentItems = recent.filter(r => visibleMenus.some(m => m.id === r.menuId)).slice(0, 5);

  return <TooltipProvider delayDuration={200}>
    <aside data-collapsed={collapsed} className={cn('flex h-full shrink-0 flex-col border-r border-border-subtle bg-surface-sidebar', collapsed ? 'w-(--sidebar-width-collapsed)' : 'w-(--sidebar-width)')}>
      <div className="flex h-[50px] shrink-0 items-center justify-between border-b border-border-subtle px-3">
        {!collapsed && (sidebarSpace === null
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
      <ScopeSelector collapsed={collapsed} />
      <div className="shell-scroll min-h-0 flex-1 overflow-y-auto px-2 py-2">
        <nav aria-label={lang === 'ko' ? '주 메뉴' : 'Primary'}>
          {grouped.map(({ group, items }, index) => <div key={group.id} role="group" aria-label={tx(group.label)}>
            {!collapsed && systems === null && !(group.hideLabelWhenSingle && items.length === 1) && <p className={cn('mx-2 mb-1 text-caption font-semibold uppercase tracking-wide text-text-muted', index === 0 ? 'mt-1.5' : 'mt-3.5')}>{tx(group.label)}</p>}
            {collapsed && index > 0 && <div className="mx-3 my-1.5 border-t border-border-subtle" aria-hidden />}
            <ul className="space-y-0.5">{items.map(menu => <li key={menu.id}><NavItem menu={menu} active={menu.id === activeId} collapsed={collapsed} /></li>)}</ul>
          </div>)}
        </nav>
        {/* Expanded only (prototype C). An empty list keeps its guidance (07 §3 empty state). */}
        {!collapsed && <section aria-label={t('favorites')}>
          <p className="mx-2 mb-1 mt-3.5 flex items-center gap-1 text-caption font-semibold uppercase tracking-wide text-text-muted"><Star className="size-3" aria-hidden />{t('favorites')}</p>
          {favoriteMenus.length > 0
            ? <ul className="space-y-0.5">{favoriteMenus.map(menu => <li key={menu.id}><NavItem menu={menu} active={false} collapsed={collapsed} /></li>)}</ul>
            : <p className="px-3 py-1 text-xs leading-4 text-text-muted">{t('noFavorites')}</p>}
        </section>}
        {!collapsed && <section aria-label={t('recent')}>
          <p className="mx-2 mb-1 mt-3.5 flex items-center gap-1 text-caption font-semibold uppercase tracking-wide text-text-muted"><Clock3 className="size-3" aria-hidden />{t('recent')}</p>
          {recentItems.length > 0
            ? <ul className="space-y-0.5">{recentItems.map(r => <li key={r.menuId}><NavItem menu={registry.menuById(r.menuId)} active={false} collapsed={collapsed} href={r.url} labelPrefix={t('recent')} /></li>)}</ul>
            : <p className="px-3 py-1 text-xs leading-4 text-text-muted">{t('noRecent')}</p>}
        </section>}
      </div>
      <FeedbackOpsBlock collapsed={collapsed} />
      {!collapsed && <div className="shrink-0 border-t border-border-subtle px-4 py-2.5 text-caption text-text-muted">{lang === 'ko' ? '통합 프로토타입 · 합성 데이터' : 'Integrated prototype · synthetic data'}</div>}
    </aside>
  </TooltipProvider>;
}

function FeedbackOpsBlock({ collapsed }: { collapsed: boolean }) {
  const { slots, route, currentSpace, sidebarSpace, accessibleSpaces, url, pathname, absoluteUrl } = useHostPlatform();
  const { tx, lang } = useI18n();
  const slot = slots.feedbackOps;
  // Only the space this sidebar is drawing, and only when the route is that space's menu.
  // A denied-space URL and an unmatched path keep a fallback sidebar but must not query another space.
  if (!slot || sidebarSpace === null || !accessibleSpaces.some(space => space.id === sidebarSpace.id)) return null;
  if (route === null || currentSpace?.id !== sidebarSpace.id) return null;
  // The page this sidebar is drawing is where FeedbackOps links back to (FO ADR-0071); `url` re-renders the hrefs on every navigation.
  const entries = slot.entriesFor(sidebarSpace.id, platformReturnFor(absoluteUrl(url), absoluteUrl(pathname)));
  if (!entries || entries.length === 0) return null;
  const spaceName = tx(sidebarSpace.label);
  const heading = `FeedbackOps · ${spaceName}`;
  return <nav aria-label={heading} className="shrink-0 border-t border-border-subtle px-2 py-2">
    {!collapsed && <p className="mx-2 mb-1 text-caption font-semibold text-text-muted">{heading}</p>}
    <ul className="space-y-0.5">{entries.map(entry => {
      const Icon = entry.icon;
      const label = tx(entry.label);
      const name = lang === 'ko' ? `${label} — ${spaceName}, FeedbackOps, 새 탭` : `${label} — ${spaceName}, FeedbackOps, new tab`;
      if (entry.href === null) {
        const reason = lang === 'ko' ? 'FeedbackOps 주소가 설정되지 않아 열 수 없습니다' : 'FeedbackOps address is not configured';
        const disabledName = `${label} — ${spaceName}, FeedbackOps — ${reason}`;
        const disabled = <span role="link" aria-disabled="true" tabIndex={0} aria-label={disabledName}
          className={cn('flex min-h-8 items-center gap-2 rounded-md px-3 py-1.5 text-sm text-text-muted', collapsed && 'justify-center px-0')}>
          <Icon className="size-4 shrink-0" aria-hidden />
          {!collapsed && <span className="min-w-0 flex-1 truncate">{label}</span>}
        </span>;
        return <li key={entry.key}><Tooltip><TooltipTrigger asChild>{disabled}</TooltipTrigger><TooltipContent side="right">{disabledName}</TooltipContent></Tooltip></li>;
      }
      const link = <a href={entry.href} target="_blank" rel="noopener noreferrer" aria-label={name}
        className={cn('flex min-h-8 items-center gap-2 rounded-md px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-row-hover hover:text-text-primary', collapsed && 'justify-center px-0')}>
        <Icon className="size-4 shrink-0" aria-hidden />
        {!collapsed && <><span className="min-w-0 flex-1 truncate">{label}</span><ExternalLink className="size-3.5 shrink-0" aria-hidden /></>}
      </a>;
      return <li key={entry.key}><Tooltip><TooltipTrigger asChild>{link}</TooltipTrigger><TooltipContent side="right">{name}</TooltipContent></Tooltip></li>;
    })}</ul>
    {!collapsed && entries.some(entry => entry.href !== null) && <p className="px-3 pt-1 text-caption text-text-muted">{lang === 'ko' ? '새 탭에서 열립니다' : 'Opens in a new tab'}</p>}
  </nav>;
}

export function NavItem({ menu, active, collapsed, href, labelPrefix, label: labelOverride, unread }: { menu: MenuEntry; active: boolean; collapsed: boolean; href?: string; labelPrefix?: string; label?: string; unread?: number | null }) {
  const { linkTo } = useHostPlatform();
  const { tx, t } = useI18n();
  const Icon = menu.icon;
  const label = labelOverride ?? tx(menu.label);
  const count = unread !== undefined && unread !== null && unread > 0 ? unread : 0;
  const name = labelPrefix ? `${labelPrefix}: ${label}` : label;
  const link = <PlatformLink via="sidebar" href={href ?? linkTo(menu.id)} aria-label={count > 0 ? t('unreadNamed', { label: name, count }) : name} aria-current={active ? 'page' : undefined}
    className={cn('relative flex min-h-8 items-center gap-2 rounded-md px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-row-hover hover:text-text-primary', collapsed && 'justify-center px-0', active && 'bg-surface-row-selected font-semibold text-text-primary')}>
    {active && <span data-current-marker aria-hidden className="absolute inset-y-2 left-0 w-0.5 rounded-pill bg-accent-primary" />}
    <Icon className="size-4 shrink-0" aria-hidden />
    {collapsed && count > 0 && <span aria-hidden className="absolute right-2 top-1.5 size-1.5 rounded-pill bg-accent-danger" />}
    {!collapsed && <><span className="min-w-0 flex-1 truncate">{label}</span>{!menu.component && !menu.moduleScreen && <span className="rounded-pill bg-surface-row-selected px-1.5 py-0.5 text-caption font-semibold text-text-secondary">{t('planned')}</span>}{count > 0 && <span aria-hidden className="rounded-pill bg-surface-row-selected px-1.5 py-0.5 text-caption font-semibold text-text-secondary">{formatUnread(count)}</span>}</>}
  </PlatformLink>;
  return collapsed ? <Tooltip><TooltipTrigger asChild>{link}</TooltipTrigger><TooltipContent side="right">{label}{!menu.component && !menu.moduleScreen && ` · ${t('planned')}`}{count > 0 && ` · ${t('unreadCount', { count })}`}</TooltipContent></Tooltip> : link;
}
