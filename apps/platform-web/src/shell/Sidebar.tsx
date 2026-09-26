import { ChevronDown, ChevronsLeft, ChevronsRight, Clock3, Hexagon, Search, Star, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '../kernel/i18n';
import { PlatformLink, usePlatform } from '../kernel/platform';
import type { GroupId } from '@ap/contracts';
import { GROUPS, MENUS, type MenuEntry } from '../kernel/registry';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/components/shadcn/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/components/shadcn/tooltip';
import { cn } from '../ui/utils/cn';

const OPEN_KEY = 'platform:nav-open';
function readOpen(): Record<string, boolean> {
  try { return JSON.parse(localStorage.getItem(OPEN_KEY) || '{}'); } catch { return {}; }
}

export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const { visibleMenus, route, linkTo, favorites, recent } = usePlatform();
  const { t, tx, lang } = useI18n();
  const [open, setOpen] = useState<Record<string, boolean>>(readOpen);
  const [filter, setFilter] = useState('');
  const activeId = route ? (route.menu.navHidden && route.menu.parent ? route.menu.parent : route.menu.id) : null;
  const activeGroup = route?.menu.group ?? null;

  // The group holding the current page opens automatically so the current location is always visible.
  useEffect(() => { if (activeGroup) setOpen(o => (o[activeGroup] === false ? { ...o, [activeGroup]: true } : o)); }, [activeGroup]);
  useEffect(() => { try { localStorage.setItem(OPEN_KEY, JSON.stringify(open)); } catch { /* ignore */ } }, [open]);

  const navMenus = visibleMenus.filter(m => !m.navHidden);
  const q = filter.trim().toLowerCase();
  const matches = (m: MenuEntry) => !q || m.label.ko.toLowerCase().includes(q) || m.label.en.toLowerCase().includes(q);
  const grouped = useMemo(() => GROUPS.map(g => ({ group: g, items: navMenus.filter(m => m.group === g.id && matches(m)) })).filter(x => x.items.length), [navMenus, q]);
  const isOpen = (id: GroupId) => (q ? true : open[id] ?? true);

  const favoriteMenus = favorites.map(id => MENUS.find(m => m.id === id)).filter((m): m is MenuEntry => !!m && visibleMenus.includes(m));
  const recentItems = recent.filter(r => visibleMenus.some(m => m.id === r.menuId)).slice(0, 5);

  if (collapsed) return <TooltipProvider delayDuration={200}>
    <nav aria-label={lang === 'ko' ? '주 메뉴' : 'Primary'} className="flex h-full w-16 flex-col items-center bg-nav text-nav-text">
      <div className="flex h-[54px] w-full items-center justify-center border-b border-nav-divider">
        <Hexagon className="size-7 fill-accent-primary/30 text-accent-primary" strokeWidth={1.75} aria-hidden />
      </div>
      <div className="nav-scroll flex w-full flex-1 flex-col items-center gap-1 overflow-y-auto py-3">
        {grouped.map(({ group, items }) => {
          const Icon = group.icon;
          const active = group.id === activeGroup;
          if (items.length === 1) return <Tooltip key={group.id}><TooltipTrigger asChild>
            <PlatformLink href={linkTo(items[0].id)} aria-current={items[0].id === activeId ? 'page' : undefined} aria-label={tx(items[0].label)}
              className={cn('grid size-10 place-items-center rounded-sm outline-offset-0 hover:bg-nav-hover focus-visible:outline-nav-focus', items[0].id === activeId && 'bg-accent-primary text-text-on-accent hover:bg-accent-primary')}>
              <Icon className="size-[18px]" aria-hidden /></PlatformLink>
          </TooltipTrigger><TooltipContent side="right">{tx(items[0].label)}</TooltipContent></Tooltip>;
          return <Popover key={group.id}>
            <PopoverTrigger asChild>
              <button type="button" aria-label={tx(group.label)} className={cn('relative grid size-10 place-items-center rounded-sm hover:bg-nav-hover focus-visible:outline-nav-focus', active && 'bg-nav-raised text-text-on-accent')}>
                <Icon className="size-[18px]" aria-hidden />
                {active && <span aria-hidden className="absolute left-0 top-2 h-6 w-0.5 rounded-pill bg-accent-primary" />}
              </button>
            </PopoverTrigger>
            <PopoverContent side="right" align="start" sideOffset={8} className="w-60 rounded-md border border-nav-divider bg-nav p-1.5 text-nav-text shadow-lg">
              <p className="t-nav-group px-2 pb-1 pt-1 text-nav-text-faint">{tx(group.label)}</p>
              {items.map(m => <NavItem key={m.id} menu={m} active={m.id === activeId} />)}
            </PopoverContent>
          </Popover>;
        })}
      </div>
      <button type="button" onClick={onToggle} aria-label={t('expand')} title={`${t('expand')} ([)`} className="mb-3 grid size-9 place-items-center rounded-sm text-nav-text hover:bg-nav-hover focus-visible:outline-nav-focus">
        <ChevronsRight className="size-4" aria-hidden />
      </button>
    </nav>
  </TooltipProvider>;

  return <nav aria-label={lang === 'ko' ? '주 메뉴' : 'Primary'} className="flex h-full w-[270px] flex-col bg-nav text-nav-text">
    <div className="flex h-[54px] shrink-0 items-center gap-2.5 border-b border-nav-divider pl-4 pr-2">
      <Hexagon className="size-8 shrink-0 fill-accent-primary/30 text-accent-primary" strokeWidth={1.75} aria-hidden />
      <div className="min-w-0 flex-1 leading-tight">
        <p className="truncate text-[15px] font-semibold text-text-on-accent">{t('appName')}</p>
        <p className="truncate text-[11px] text-nav-text-faint">{t('appTagline')}</p>
      </div>
      <button type="button" onClick={onToggle} aria-label={t('collapse')} title={`${t('collapse')} ([)`} className="grid size-8 place-items-center rounded-sm hover:bg-nav-hover focus-visible:outline-nav-focus">
        <ChevronsLeft className="size-4" aria-hidden />
      </button>
    </div>

    <div className="shrink-0 px-3 pb-2 pt-3">
      <label className="flex h-8 items-center gap-2 rounded-md bg-nav-subtle px-2.5 text-[12px] focus-within:outline focus-within:outline-2 focus-within:outline-nav-focus">
        <Search className="size-3.5 text-nav-text-faint" aria-hidden />
        <span className="sr-only">{t('menuSearch')}</span>
        <input value={filter} onChange={e => setFilter(e.target.value)} placeholder={t('menuSearch')} className="min-w-0 flex-1 bg-transparent text-nav-text outline-none placeholder:text-nav-text-faint"
          onKeyDown={e => { if (e.key === 'Escape') setFilter(''); }} />
        {filter && <button type="button" onClick={() => setFilter('')} aria-label={t('clear')} className="text-nav-text-faint hover:text-nav-text"><X className="size-3.5" aria-hidden /></button>}
      </label>
    </div>

    <div className="nav-scroll min-h-0 flex-1 overflow-y-auto px-2 pb-2" style={{ scrollPaddingBlock: 8 }}>
      {grouped.length === 0 && <p className="px-3 py-4 text-[12px] text-nav-text-faint">{t('paletteEmpty')}</p>}
      {grouped.map(({ group, items }, index) => {
        const Icon = group.icon;
        if (items.length === 1 && group.id === 'overview') {
          const m = items[0];
          return <div key={group.id} className={cn(index > 0 && 'mt-1 border-t border-nav-divider pt-1')}>
            <PlatformLink href={linkTo(m.id)} aria-current={m.id === activeId ? 'page' : undefined}
              className={cn('flex min-h-10 items-center gap-3 rounded-sm px-3 text-[13px] font-medium hover:bg-nav-hover focus-visible:outline-nav-focus', m.id === activeId && 'bg-accent-primary text-text-on-accent hover:bg-accent-primary')}>
              <Icon className="size-[18px] shrink-0" aria-hidden />{tx(group.label)}
            </PlatformLink>
          </div>;
        }
        const expanded = isOpen(group.id);
        const containsActive = items.some(m => m.id === activeId);
        return <div key={group.id} className={cn('py-1', index > 0 && 'border-t border-nav-divider')}>
          <button type="button" aria-expanded={expanded} aria-controls={`nav-${group.id}`} onClick={() => setOpen(o => ({ ...o, [group.id]: !expanded }))}
            className={cn('flex min-h-9 w-full items-center gap-3 rounded-sm px-3 text-left text-[13px] font-medium hover:bg-nav-hover focus-visible:outline-nav-focus',
              containsActive ? 'text-nav-focus' : 'text-nav-text')}>
            <Icon className="size-[18px] shrink-0" aria-hidden />
            <span className="flex-1 truncate">{tx(group.label)}</span>
            <ChevronDown className={cn('size-4 shrink-0 text-nav-text-faint transition-transform duration-[120ms]', !expanded && '-rotate-90')} aria-hidden />
          </button>
          <ul id={`nav-${group.id}`} hidden={!expanded} className="mt-0.5 space-y-px">
            {items.map(m => <li key={m.id}><NavItem menu={m} active={m.id === activeId} /></li>)}
          </ul>
        </div>;
      })}

      <NavSection id="favorites" icon={<Star className="size-[18px]" aria-hidden />} label={t('favorites')} open={open.favorites ?? true} onToggle={() => setOpen(o => ({ ...o, favorites: !(o.favorites ?? true) }))}>
        {favoriteMenus.length ? favoriteMenus.map(m => <li key={m.id}><NavItem menu={m} active={m.id === activeId} /></li>)
          : <li className="px-3 py-1.5 pl-[42px] text-[11px] leading-4 text-nav-text-faint">{t('noFavorites')}</li>}
      </NavSection>
      <NavSection id="recent" icon={<Clock3 className="size-[18px]" aria-hidden />} label={t('recent')} open={open.recent ?? false} onToggle={() => setOpen(o => ({ ...o, recent: !(o.recent ?? false) }))}>
        {recentItems.length ? recentItems.map(r => {
          const m = MENUS.find(x => x.id === r.menuId)!;
          const Icon = m.icon;
          return <li key={r.menuId}><PlatformLink href={r.url} className="flex min-h-7 items-center gap-2.5 rounded-sm py-1 pl-[42px] pr-3 text-[12px] hover:bg-nav-hover focus-visible:outline-nav-focus" title={r.url}>
            <Icon className="size-3.5 shrink-0 opacity-80" aria-hidden /><span className="truncate">{tx(m.label)}</span>
          </PlatformLink></li>;
        }) : <li className="px-3 py-1.5 pl-[42px] text-[11px] text-nav-text-faint">{t('noRecent')}</li>}
      </NavSection>
    </div>

    <div className="shrink-0 border-t border-nav-divider px-4 py-2.5 text-[11px] text-nav-text-faint">
      {lang === 'ko' ? '통합 프로토타입 · 합성 데이터' : 'Integrated prototype · synthetic data'}
    </div>
  </nav>;
}

function NavSection({ id, icon, label, open, onToggle, children }: { id: string; icon: React.ReactNode; label: string; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  return <div className="border-t border-nav-divider py-1">
    <button type="button" aria-expanded={open} aria-controls={`nav-${id}`} onClick={onToggle}
      className="flex min-h-9 w-full items-center gap-3 rounded-sm px-3 text-left text-[13px] font-medium text-nav-text hover:bg-nav-hover focus-visible:outline-nav-focus">
      {icon}<span className="flex-1">{label}</span>
      <ChevronDown className={cn('size-4 text-nav-text-faint transition-transform duration-[120ms]', !open && '-rotate-90')} aria-hidden />
    </button>
    <ul id={`nav-${id}`} hidden={!open} className="mt-0.5 space-y-px">{children}</ul>
  </div>;
}

function NavItem({ menu, active }: { menu: MenuEntry; active: boolean }) {
  const { linkTo } = usePlatform();
  const { tx, t } = useI18n();
  const Icon = menu.icon;
  const planned = !menu.component;
  return <PlatformLink href={linkTo(menu.id)} aria-current={active ? 'page' : undefined}
    className={cn('group flex min-h-[30px] items-center gap-2.5 rounded-sm py-1 pl-[42px] pr-3 text-[13px] hover:bg-nav-hover focus-visible:outline-nav-focus',
      active ? 'bg-accent-primary font-medium text-text-on-accent hover:bg-accent-primary' : 'text-nav-text')}>
    <Icon className="size-4 shrink-0 opacity-90" strokeWidth={1.75} aria-hidden />
    <span className="flex-1 truncate">{tx(menu.label)}</span>
    {planned && <span className={cn('rounded-xs px-1 text-[10px] font-medium', active ? 'bg-white/20' : 'bg-nav-raised text-nav-text-faint')}>{t('planned')}</span>}
  </PlatformLink>;
}
