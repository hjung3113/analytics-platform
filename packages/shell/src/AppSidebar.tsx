// THROWAWAY #250 — never merge.
import { ChevronDown, ChevronLeft, ChevronRight, Clock3, Star } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { SpaceDef, SpaceId } from '@ap/contracts';
import { type MenuEntry, PlatformLink, useI18n, usePlatform } from '@ap/kernel';
import { cn, Popover, PopoverContent, PopoverTrigger, Tabs, TabsList, TabsTrigger, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger, usePrototype } from '@ap/ui';
import { hubOf, isProtoRegistry, useOpenSpace, useShownSpace, workSpacesOf } from './protoChrome';
import { ScopeSelector } from './ScopeSelector';

export function AppSidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const { route, favorites, recent, registry, menusInSpace, accessibleSpaces, can, linkTo, currentSpace } = usePlatform();
  const { t, tx, lang } = useI18n();
  const variant = usePrototype();
  const proto = isProtoRegistry(registry);
  const shown = useShownSpace();
  const openSpace = useOpenSpace();
  const [switchOpen, setSwitchOpen] = useState(false);
  const collabRoute = !!route && (route.menu.protoSlot === 'my-voc' || registry.groupById(route.menu.group).protoPlacement === 'collab' || currentSpace?.protoKind === 'hub');
  const [tab, setTab] = useState<'work' | 'collab'>(collabRoute ? 'collab' : 'work');
  useEffect(() => { if (proto && variant === 'C') setTab(collabRoute ? 'collab' : 'work'); }, [proto, variant, collabRoute, route?.menu.id]);
  const visibleMenus = menusInSpace(shown.id);
  const activeId = route?.menu.navHidden && route.menu.parent ? route.menu.parent : route?.menu.id;
  const inScroll = (placement: 'collab' | 'hidden' | undefined) => placement !== 'hidden' && !(placement === 'collab' && proto && (variant === 'A' || variant === 'C'));
  const grouped = registry.groups.filter(g => g.space === shown.id && inScroll(g.protoPlacement))
    .map(group => ({ group, items: visibleMenus.filter(m => !m.navHidden && m.group === group.id) })).filter(g => g.items.length);
  const collabMenus = registry.groups.filter(g => g.space === shown.id && g.protoPlacement === 'collab')
    .flatMap(group => visibleMenus.filter(m => !m.navHidden && m.group === group.id));
  const mine = registry.menus.filter(m => m.protoSlot === 'my-voc' && can(m.permission));
  const hub = hubOf(accessibleSpaces);
  const works = workSpacesOf(accessibleSpaces);
  const favoriteMenus = favorites.map(id => visibleMenus.find(m => m.id === id)).filter((m): m is MenuEntry => !!m);
  const recentItems = recent.filter(r => visibleMenus.some(m => m.id === r.menuId)).slice(0, 5);
  const showCollabTab = proto && variant === 'C' && tab === 'collab';

  return <TooltipProvider delayDuration={200}>
    <aside data-collapsed={collapsed} className={cn('flex h-full shrink-0 flex-col border-r border-border-subtle bg-surface-sidebar', collapsed ? 'w-(--sidebar-width-collapsed)' : 'w-(--sidebar-width)')}>
      <div className="flex h-[50px] shrink-0 items-center justify-between gap-1 border-b border-border-subtle px-3">
        {proto && variant === 'B' && !collapsed && <button type="button" aria-expanded={switchOpen} aria-label={tx(shown.label)} onClick={() => setSwitchOpen(v => !v)} className="flex min-w-0 flex-1 items-center gap-1 rounded-md px-1 py-1 text-left hover:bg-surface-row-hover">
          <span className="min-w-0"><span className="block truncate text-sm font-semibold">{tx(shown.label)}</span><span className="block truncate text-caption text-text-muted">{t('appName')}</span></span>
          <ChevronDown className="size-3.5 shrink-0 text-text-muted" aria-hidden />
        </button>}
        {proto && variant === 'B' && collapsed && <Popover>
          <PopoverTrigger asChild><button type="button" aria-label={tx(shown.label)} className="grid size-7 place-items-center rounded-md text-text-muted hover:bg-surface-row-hover">{(() => { const Icon = registry.groupById(registry.menuById(shown.homeMenuId).group).icon; return <Icon className="size-4" aria-hidden />; })()}</button></PopoverTrigger>
          <PopoverContent side="right" align="start" className="w-56">
            <div className="p-1">
              <SpaceChoices works={works} currentId={shown.id} onPick={id => openSpace(id)} />
            </div>
          </PopoverContent>
        </Popover>}
        {!(proto && variant === 'B') && !collapsed && <div className="min-w-0"><p className="truncate text-sm font-semibold">{tx(shown.label)}</p><p className="truncate text-caption text-text-muted">{t('appName')}</p></div>}
        <Tooltip><TooltipTrigger asChild>
          <button type="button" onClick={onToggle} aria-label={collapsed ? t('expand') : t('collapse')} aria-keyshortcuts="["
            className="ml-auto grid size-7 shrink-0 place-items-center rounded-md text-text-muted hover:bg-surface-row-hover hover:text-text-primary">
            {collapsed ? <ChevronRight className="size-4" aria-hidden /> : <ChevronLeft className="size-4" aria-hidden />}
          </button>
        </TooltipTrigger><TooltipContent side="right">{collapsed ? t('expand') : t('collapse')} ([)</TooltipContent></Tooltip>
      </div>
      {proto && variant === 'B' && switchOpen && !collapsed && <div className="shrink-0 border-b border-border-subtle px-2 py-1">
        <SpaceChoices works={works} currentId={shown.id} onPick={id => { setSwitchOpen(false); openSpace(id); }} />
      </div>}
      {proto && variant === 'C' && <Tabs value={tab} onValueChange={value => setTab(value === 'collab' ? 'collab' : 'work')}>
        <TabsList aria-label={lang === 'ko' ? '사이드바 구역' : 'Sidebar section'} className="grid w-full grid-cols-2">
          <TabsTrigger value="work">{lang === 'ko' ? '업무' : 'Work'}</TabsTrigger>
          <TabsTrigger value="collab">{lang === 'ko' ? '협업' : 'Collaboration'}</TabsTrigger>
        </TabsList>
      </Tabs>}
      <ScopeSelector collapsed={collapsed} />
      {showCollabTab ? <nav aria-label={lang === 'ko' ? '이 시스템의 협업' : 'Collaboration in this system'} className="shell-scroll min-h-0 flex-1 overflow-y-auto px-2 py-2">
        <ul className="space-y-0.5">
          {mine.map(menu => <li key={menu.id}><NavItem menu={menu} active={menu.id === activeId} collapsed={collapsed} /></li>)}
          {collabMenus.map(menu => <li key={menu.id}><NavItem menu={menu} active={menu.id === activeId} collapsed={collapsed} /></li>)}
        </ul>
        {hub && <PlatformLink href={linkTo(hub.homeMenuId)} className="mt-3 block rounded-md px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-row-hover">{lang === 'ko' ? '전체 허브로' : 'All-systems hub'}</PlatformLink>}
      </nav> : <div className="shell-scroll min-h-0 flex-1 overflow-y-auto px-2 py-2">
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
      </div>}
      {proto && variant === 'A' && collabMenus.length > 0 && <nav aria-label={lang === 'ko' ? '이 시스템의 협업' : 'Collaboration in this system'} className="shrink-0 border-t border-border-subtle px-2 py-2">
        {!collapsed && <p className="mx-2 mb-1 text-caption font-semibold text-text-secondary">{lang === 'ko' ? '이 시스템의 협업' : 'Collaboration'}</p>}
        <ul className="space-y-0.5">{collabMenus.map(menu => <li key={menu.id}><NavItem menu={menu} active={menu.id === activeId} collapsed={collapsed} /></li>)}</ul>
      </nav>}
      {!collapsed && <div className="shrink-0 border-t border-border-subtle px-4 py-2.5 text-caption text-text-muted">{lang === 'ko' ? '통합 프로토타입 · 합성 데이터' : 'Integrated prototype · synthetic data'}</div>}
    </aside>
  </TooltipProvider>;
}

function SpaceChoices({ works, currentId, onPick }: { works: readonly SpaceDef[]; currentId: string; onPick: (id: SpaceId) => void }) {
  const { registry } = usePlatform();
  const { tx } = useI18n();
  return <ul>{works.map(space => {
    const Icon = registry.groupById(registry.menuById(space.homeMenuId).group).icon;
    const active = space.id === currentId;
    return <li key={space.id}><button type="button" aria-current={active ? 'page' : undefined} onClick={() => onPick(space.id)} className={cn('flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-text-primary hover:bg-surface-row-hover', active && 'bg-surface-row-selected font-semibold')}>
      <Icon className="size-4 shrink-0" aria-hidden />{tx(space.label)}
    </button></li>;
  })}</ul>;
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
