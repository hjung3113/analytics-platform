import { ChevronLeft, ChevronRight, Clock3, Star } from 'lucide-react';
import { type MenuEntry, PlatformLink, useI18n, usePlatform } from '@ap/kernel';
import { cn, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@ap/ui';
import { ScopeSelector } from './ScopeSelector';

export function AppSidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const { visibleMenus, route, favorites, recent, registry, sidebarSpace } = usePlatform();
  const { t, tx, lang } = useI18n();
  const activeId = route?.menu.navHidden && route.menu.parent ? route.menu.parent : route?.menu.id;
  const grouped = registry.groups.filter(g => g.space === sidebarSpace.id)
    .map(group => ({ group, items: visibleMenus.filter(m => !m.navHidden && m.group === group.id) })).filter(g => g.items.length);
  const favoriteMenus = favorites.map(id => visibleMenus.find(m => m.id === id)).filter((m): m is MenuEntry => !!m);
  const recentItems = recent.filter(r => visibleMenus.some(m => m.id === r.menuId)).slice(0, 5);

  return <TooltipProvider delayDuration={200}>
    <aside data-collapsed={collapsed} className={cn('flex h-full shrink-0 flex-col border-r border-border-subtle bg-surface-sidebar', collapsed ? 'w-(--sidebar-width-collapsed)' : 'w-(--sidebar-width)')}>
      <div className="flex h-[50px] shrink-0 items-center justify-between border-b border-border-subtle px-3">
        {!collapsed && <div className="min-w-0"><p className="truncate text-sm font-semibold">{tx(sidebarSpace.label)}</p><p className="truncate text-caption text-text-muted">{t('appName')}</p></div>}
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
            {!collapsed && !(group.hideLabelWhenSingle && items.length === 1) && <p className={cn('mx-2 mb-1 text-caption font-semibold uppercase tracking-wide text-text-muted', index === 0 ? 'mt-1.5' : 'mt-3.5')}>{tx(group.label)}</p>}
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
      {!collapsed && <div className="shrink-0 border-t border-border-subtle px-4 py-2.5 text-caption text-text-muted">{lang === 'ko' ? '통합 프로토타입 · 합성 데이터' : 'Integrated prototype · synthetic data'}</div>}
    </aside>
  </TooltipProvider>;
}

function NavItem({ menu, active, collapsed, href, labelPrefix }: { menu: MenuEntry; active: boolean; collapsed: boolean; href?: string; labelPrefix?: string }) {
  const { linkTo } = usePlatform();
  const { tx, t } = useI18n();
  const Icon = menu.icon;
  const link = <PlatformLink href={href ?? linkTo(menu.id)} aria-label={labelPrefix ? `${labelPrefix}: ${tx(menu.label)}` : tx(menu.label)} aria-current={active ? 'page' : undefined}
    className={cn('relative flex min-h-8 items-center gap-2 rounded-md px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-row-hover hover:text-text-primary', collapsed && 'justify-center px-0', active && 'bg-surface-row-selected font-semibold text-text-primary')}>
    {active && <span data-current-marker aria-hidden className="absolute inset-y-2 left-0 w-0.5 rounded-pill bg-accent-primary" />}
    <Icon className="size-4 shrink-0" aria-hidden />
    {!collapsed && <><span className="min-w-0 flex-1 truncate">{tx(menu.label)}</span>{!menu.component && <span className="rounded-pill bg-surface-row-selected px-1.5 py-0.5 text-caption font-semibold text-text-secondary">{t('planned')}</span>}</>}
  </PlatformLink>;
  return collapsed ? <Tooltip><TooltipTrigger asChild>{link}</TooltipTrigger><TooltipContent side="right">{tx(menu.label)}{!menu.component && ` · ${t('planned')}`}</TooltipContent></Tooltip> : link;
}
