/**
 * #52 prototype — shell A (Linear / Vercel, throwaway). No top bar: a light 220px sidebar is the whole navigation,
 * and the global Context is a thin chip row under the page title. `[` toggles the 220 ↔ 48 sidebar.
 */
import { Check, ChevronsUpDown, Loader2, LogOut, PanelLeftClose, PanelLeftOpen, Search, ShieldAlert, X } from 'lucide-react';
import { Suspense, useEffect, useState, type ReactNode } from 'react';
import { type MenuEntry, PlatformLink, useI18n, usePlatform } from '@ap/kernel';
import { RouteOutlet } from '@ap/shell';
import { cn, Popover, PopoverContent, PopoverTrigger } from '@ap/ui';
import {
  CapTag, ConditionBody, conditionSummary, PeriodBody, popStyle, RoomBody, ScopeBody, SelectionBody, setSummary,
  useContextActions, useContextModel, usePeriodSummary,
} from './context-editors';
import { EquipmentA } from './equipment-a';

const COLLAPSE_KEY = 'dp:a:collapsed';
const typing = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable);
};

export function ShellA() {
  const { pathname, route, can, contractError } = usePlatform();
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem(COLLAPSE_KEY) === '1'; } catch { return false; } });
  const toggle = () => setCollapsed(c => { try { localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1'); } catch { /* ignore */ } return !c; });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === '[' && !e.metaKey && !e.ctrlKey && !e.altKey && !typing(e.target)) toggle(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const equipment = pathname === '/equipment' && route?.menu.id === 'equipment-master' && can('equipment:view') && !contractError;

  return <div className="dp-root flex h-full overflow-hidden">
    <a href="#platform-main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2">Skip to content</a>
    <SidebarA collapsed={collapsed} onToggle={toggle} />
    <main id="platform-main" tabIndex={-1} className="dp-scroll min-w-0 flex-1 overflow-y-auto bg-(--dp-surface) outline-none">
      {equipment ? <EquipmentA contextRow={<ContextRowA />} />
        : <div className="pb-16">
          {route && !contractError && <div className="px-5 pt-3"><ContextRowA /></div>}
          <Suspense fallback={<p className="px-5 py-6 text-[13px] text-(--dp-muted)">…</p>}><RouteOutlet /></Suspense>
        </div>}
    </main>
  </div>;
}

/* ---------- sidebar ---------- */

function SidebarA({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const { visibleMenus, route, favorites, recent, registry, setPaletteOpen, slots } = usePlatform();
  const { t, tx, lang } = useI18n();
  const [filter, setFilter] = useState('');
  const activeId = route ? (route.menu.navHidden && route.menu.parent ? route.menu.parent : route.menu.id) : null;
  const q = filter.trim().toLowerCase();
  const nav = visibleMenus.filter(m => !m.navHidden);
  const matches = (m: MenuEntry) => !q || m.label.ko.toLowerCase().includes(q) || m.label.en.toLowerCase().includes(q);
  const groups = registry.groups.map(g => ({ group: g, items: nav.filter(m => m.group === g.id && matches(m)) })).filter(x => x.items.length);
  const favoriteMenus = favorites.map(id => nav.find(m => m.id === id)).filter((m): m is MenuEntry => !!m);
  const recentItems = recent.filter(r => visibleMenus.some(m => m.id === r.menuId)).slice(0, 5);
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

  if (collapsed) return <nav aria-label={lang === 'ko' ? '주 메뉴' : 'Primary'} className="flex h-full w-12 shrink-0 flex-col items-center border-r border-(--dp-border) bg-(--dp-nav-bg)">
    <div className="flex h-10 items-center"><BrandMark /></div>
    <IconBtn label={`${t('expand')} ([)`} onClick={onToggle}><PanelLeftOpen className="size-4" aria-hidden /></IconBtn>
    <IconBtn label={`${t('menuSearch')} (⌘K)`} onClick={() => setPaletteOpen(true)}><Search className="size-4" aria-hidden /></IconBtn>
    <div className="dp-scroll mt-2 flex w-full flex-1 flex-col items-center gap-0.5 overflow-y-auto border-t border-(--dp-border) pt-2">
      {groups.map(({ group, items }) => {
        const Icon = group.icon;
        const active = items.some(m => m.id === activeId);
        return <Popover key={group.id}>
          <PopoverTrigger asChild>
            <button type="button" aria-label={tx(group.label)} title={tx(group.label)}
              className={cn('grid size-8 place-items-center rounded-(--dp-radius) hover:bg-(--dp-nav-hover)', active ? 'bg-(--dp-nav-active) text-(--dp-text)' : 'text-(--dp-muted)')}>
              <Icon className="size-4" strokeWidth={1.75} aria-hidden />
            </button>
          </PopoverTrigger>
          <PopoverContent side="right" align="start" sideOffset={6} className="dp-pop" style={popStyle(220)}>
            <p className="px-4 pb-1 pt-2.5 text-[11px] font-medium text-(--dp-muted)">{tx(group.label)}</p>
            <ul className="pb-2">{items.map(m => <li key={m.id}><NavItem menu={m} active={m.id === activeId} /></li>)}</ul>
          </PopoverContent>
        </Popover>;
      })}
    </div>
    <div className="flex flex-col items-center gap-1.5 border-t border-(--dp-border) py-2">
      <ToolsA vertical />
      <ProfileA compact />
    </div>
  </nav>;

  return <nav aria-label={lang === 'ko' ? '주 메뉴' : 'Primary'} className="flex h-full w-[220px] shrink-0 flex-col border-r border-(--dp-border) bg-(--dp-nav-bg)">
    <div className="flex h-10 shrink-0 items-center gap-2 pl-4 pr-2">
      <BrandMark />
      <span className="flex-1 truncate text-[13px] font-semibold text-(--dp-text)">{lang === 'ko' ? '분석' : 'Analytics'}</span>
      <IconBtn label={`${t('collapse')} ([)`} onClick={onToggle}><PanelLeftClose className="size-4" aria-hidden /></IconBtn>
    </div>
    <div className="px-2 pb-1">
      <label className="flex h-8 items-center gap-2 rounded-(--dp-radius) border border-(--dp-border) bg-(--dp-surface) pl-2 pr-1 focus-within:border-(--dp-border-strong) focus-within:shadow-[0_0_0_3px_var(--dp-focus)]">
        <Search className="size-3.5 shrink-0 text-(--dp-muted)" aria-hidden />
        <input value={filter} onChange={e => setFilter(e.target.value)} onKeyDown={e => { if (e.key === 'Escape') setFilter(''); }}
          placeholder={t('menuSearch')} aria-label={t('menuSearch')} className="min-w-0 flex-1 bg-transparent text-[12px] text-(--dp-text) outline-none placeholder:text-(--dp-faint)" />
        {filter ? <button type="button" onClick={() => setFilter('')} aria-label={t('clear')} className="grid size-5 place-items-center text-(--dp-muted) hover:text-(--dp-text)"><X className="size-3" aria-hidden /></button>
          : <button type="button" onClick={() => setPaletteOpen(true)} title={lang === 'ko' ? '명령 팔레트' : 'Command palette'}
            className="h-5 rounded-[4px] border border-(--dp-border) px-1 text-[10px] font-medium text-(--dp-muted) hover:text-(--dp-text)">{isMac ? '⌘K' : 'Ctrl K'}</button>}
      </label>
    </div>

    <div className="dp-scroll min-h-0 flex-1 overflow-y-auto pb-3">
      {groups.length === 0 && <p className="px-4 py-3 text-[12px] text-(--dp-muted)">{t('paletteEmpty')}</p>}
      {groups.map(({ group, items }) => <Section key={group.id} label={tx(group.label)}>
        {items.map(m => <li key={m.id}><NavItem menu={m} active={m.id === activeId} /></li>)}
      </Section>)}
      {!q && <Section label={t('favorites')}>
        {favoriteMenus.length ? favoriteMenus.map(m => <li key={m.id}><NavItem menu={m} active={m.id === activeId} /></li>)
          : <li className="px-4 py-1 text-[11px] leading-4 text-(--dp-faint)">{lang === 'ko' ? '제목 옆 ☆로 추가합니다.' : 'Add with ☆ next to a title.'}</li>}
      </Section>}
      {!q && <Section label={t('recent')}>
        {recentItems.length ? recentItems.map(r => {
          const m = registry.menuById(r.menuId);
          const Icon = m.icon;
          return <li key={r.menuId}><PlatformLink href={r.url} title={r.url} className="mx-2 flex h-7 items-center gap-2 rounded-(--dp-radius) px-2 text-[13px] font-[450] text-(--dp-secondary) hover:bg-(--dp-nav-hover)">
            <Icon className="size-4 shrink-0 text-(--dp-muted)" strokeWidth={1.75} aria-hidden /><span className="truncate">{tx(m.label)}</span>
          </PlatformLink></li>;
        }) : <li className="px-4 py-1 text-[11px] text-(--dp-faint)">{t('noRecent')}</li>}
      </Section>}
    </div>

    <div className="shrink-0 space-y-1 border-t border-(--dp-border) p-2">
      {slots.topBarTools && <ToolsA />}
      <ProfileA />
    </div>
  </nav>;
}

function BrandMark() {
  return <span aria-hidden className="grid size-[18px] shrink-0 place-items-center rounded-[5px] bg-(--dp-text)">
    <span className="size-[7px] rotate-45 rounded-[1.5px] bg-white" />
  </span>;
}

function IconBtn({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return <button type="button" onClick={onClick} aria-label={label} title={label}
    className="grid size-7 shrink-0 place-items-center rounded-(--dp-radius) text-(--dp-muted) hover:bg-(--dp-nav-hover) hover:text-(--dp-text)">{children}</button>;
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return <div className="mt-3">
    <p className="flex h-6 items-center px-4 text-[11px] font-medium text-(--dp-muted)">{label}</p>
    <ul className="space-y-px">{children}</ul>
  </div>;
}

function NavItem({ menu, active }: { menu: MenuEntry; active: boolean }) {
  const { linkTo } = usePlatform();
  const { tx, lang } = useI18n();
  const Icon = menu.icon;
  return <PlatformLink href={linkTo(menu.id)} aria-current={active ? 'page' : undefined}
    className={cn('mx-2 flex h-7 items-center gap-2 rounded-(--dp-radius) px-2 text-[13px]',
      active ? 'bg-(--dp-nav-active) font-[560] text-(--dp-text)' : 'font-[450] text-(--dp-secondary) hover:bg-(--dp-nav-hover)')}>
    <Icon className={cn('size-4 shrink-0', active ? 'text-(--dp-text)' : 'text-(--dp-muted)')} strokeWidth={1.75} aria-hidden />
    <span className="flex-1 truncate">{tx(menu.label)}</span>
    {!menu.component && <span className="text-[10px] text-(--dp-faint)">{lang === 'ko' ? '예정' : 'Planned'}</span>}
  </PlatformLink>;
}

/** slots.topBarTools (DevTools) in a dashed 28px holder: it is a dev affordance, not product chrome. */
function ToolsA({ vertical }: { vertical?: boolean }) {
  const { slots } = usePlatform();
  const { lang } = useI18n();
  return <div className={cn('flex items-center gap-0.5 rounded-(--dp-radius) border border-dashed border-(--dp-dashed) p-px text-(--dp-muted) [&_button]:!size-[26px] [&_button]:!rounded-[5px] [&_button:hover]:!bg-(--dp-nav-hover)',
    vertical ? 'flex-col' : 'h-[30px]')}>
    {slots.topBarTools}
    {!vertical && <span className="ml-auto pr-2 text-[10px] text-(--dp-faint)">{lang === 'ko' ? '개발 도구' : 'Dev tools'}</span>}
  </div>;
}

function ProfileA({ compact }: { compact?: boolean }) {
  const { user } = usePlatform();
  const { t, tx, lang, setLang } = useI18n();
  const initials = user.name.split(' ').map(w => w[0]).join('');
  return <Popover>
    <PopoverTrigger asChild>
      <button type="button" aria-label={t('profile')} className={cn('flex items-center gap-2 rounded-(--dp-radius) hover:bg-(--dp-nav-hover) data-[state=open]:bg-(--dp-nav-hover)', compact ? 'size-8 justify-center' : 'h-8 w-full px-1.5')}>
        <span aria-hidden className="grid size-6 shrink-0 place-items-center rounded-full bg-(--dp-border-strong) text-[10px] font-semibold text-(--dp-secondary)">{initials}</span>
        {!compact && <><span className="min-w-0 flex-1 truncate text-left text-[12px] font-[560] text-(--dp-text)">{user.name}</span><ChevronsUpDown className="size-3.5 text-(--dp-faint)" aria-hidden /></>}
      </button>
    </PopoverTrigger>
    <PopoverContent side={compact ? 'right' : 'top'} align="start" sideOffset={6} className="dp-pop" style={popStyle(236)}>
      <div className="border-b border-(--dp-border) px-3 py-2.5">
        <p className="text-[12px] font-[560]">{user.name}</p>
        <p className="text-[11px] text-(--dp-muted)">{tx(user.title)}</p>
      </div>
      <div role="menu" aria-label={t('language')} className="p-1">
        <p className="px-2 pb-0.5 pt-1.5 text-[11px] font-medium text-(--dp-muted)">{t('language')}</p>
        {(['ko', 'en'] as const).map(l => <button key={l} type="button" role="menuitemradio" aria-checked={lang === l} onClick={() => setLang(l)}
          className="flex h-8 w-full items-center gap-2 rounded-(--dp-radius-sm) px-2 text-left text-[12px] hover:bg-(--dp-chip-soft)">
          <span className="flex-1">{l === 'ko' ? '한국어' : 'English'}</span>
          {lang === l && <Check className="size-3.5 text-(--dp-primary)" strokeWidth={2.5} aria-hidden />}
        </button>)}
      </div>
      <div className="border-t border-(--dp-border) p-1">
        <button type="button" disabled className="flex h-8 w-full items-center gap-2 rounded-(--dp-radius-sm) px-2 text-left text-[12px] text-(--dp-faint)">
          <LogOut className="size-3.5" aria-hidden /><span className="flex-1">{t('signOut')}</span><span className="text-[10px]">SSO Open</span>
        </button>
      </div>
    </PopoverContent>
  </Popover>;
}

/* ---------- Context chip row ---------- */

function ContextRowA() {
  const { global, scope, session, route } = usePlatform();
  const { t, lang } = useI18n();
  const { cap, editable, carried } = useContextModel();
  const actions = useContextActions();
  const period = usePeriodSummary();
  if (!route || !cap) return null;
  const scopeLabel = session.scopes.find(s => s.id === global.scopeId)?.label ?? global.scopeId ?? t('scopeNone');
  const scopeDot = scope.status === 'valid' ? <span aria-hidden className="size-1.5 rounded-full bg-(--dp-success)" />
    : scope.status === 'validating' ? <Loader2 className="size-3 animate-spin text-(--dp-muted)" aria-hidden />
      : scope.status === 'none' ? <span aria-hidden className="size-1.5 rounded-full border border-(--dp-faint)" />
        : <ShieldAlert className="size-3 text-(--dp-warning)" aria-hidden />;
  const selectionAbsent = global.condition ? (lang === 'ko' ? '조건 결과 전체' : 'All in condition') : undefined;

  return <div role="region" aria-label={t('globalContext')} className="flex min-h-9 flex-wrap items-center gap-x-1.5 gap-y-1 py-1">
    <span className="w-[60px] shrink-0 text-[11px] font-medium text-(--dp-muted)">{lang === 'ko' ? '모든 화면' : 'All pages'}</span>
    <ChipPop label="Scope" value={<>{scopeDot}<span>{scopeLabel}</span></>} width={320}
      title={scope.status === 'forbidden' ? t('scopeForbidden') : scope.status === 'unknown_scope' ? t('scopeUnknown') : undefined}>
      {close => <ScopeBody onDone={close} />}
    </ChipPop>
    {editable('time') && <ChipPop label={t('period')} value={period} cap={cap.time} muted={!global.from} width={320}>{close => <PeriodBody cap={cap.time} onDone={close} />}</ChipPop>}
    {editable('roomNames') && <ChipPop label="room" value={setSummary(global.roomNames, lang)} cap={cap.roomNames} muted={global.roomNames === null} width={320}>{close => <RoomBody onDone={close} />}</ChipPop>}
    {editable('condition') && <ChipPop label={lang === 'ko' ? '그룹' : 'Group'} value={conditionSummary(global.condition, lang)} cap={cap.condition} muted={!global.condition} width={320}>{close => <ConditionBody onDone={close} />}</ChipPop>}
    {editable('selection') && <ChipPop label={lang === 'ko' ? '설비' : 'Equipment'} value={setSummary(global.selection, lang, selectionAbsent)} cap={cap.selection} muted={global.selection === null} width={320}>{close => <SelectionBody onDone={close} />}</ChipPop>}
    {carried.map(c => <span key={c.key} title={lang === 'ko' ? 'URL에 보존되며 지원 메뉴로 이동하면 재검증 후 적용됩니다.' : 'Kept in the URL; re-validated and applied on a supporting page.'}
      className="inline-flex h-[26px] items-center gap-1.5 rounded-(--dp-radius) border border-dashed border-(--dp-dashed) pl-2 pr-0.5 text-[12px]">
      <span className="text-(--dp-muted)">{c.label}</span>
      <span className="dp-num max-w-40 truncate font-[560] text-(--dp-secondary)">{c.value}</span>
      <CapTag cap="unsupported" />
      <button type="button" onClick={c.remove} aria-label={`${t('clear')} ${c.label}`} className="grid size-5 place-items-center rounded-[4px] text-(--dp-muted) hover:bg-(--dp-chip-soft) hover:text-(--dp-text)"><X className="size-3" aria-hidden /></button>
    </span>)}
    <span className="ml-auto flex items-center gap-0.5">
      <button type="button" onClick={actions.copyLink} className="h-7 rounded-(--dp-radius) px-2 text-[12px] text-(--dp-muted) hover:bg-(--dp-chip-soft) hover:text-(--dp-text)">{actions.copyLabel}</button>
      <button type="button" onClick={actions.reset} className="h-7 rounded-(--dp-radius) px-2 text-[12px] text-(--dp-muted) hover:bg-(--dp-chip-soft) hover:text-(--dp-text)">{actions.resetLabel}</button>
    </span>
  </div>;
}

function ChipPop({ label, value, cap, muted, width, title, children }: {
  label: string; value: ReactNode; cap?: 'apply' | 'reference' | 'unsupported'; muted?: boolean; width: number; title?: string; children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild>
      <button type="button" title={title} className="inline-flex h-[26px] max-w-[300px] items-center gap-1.5 rounded-(--dp-radius) border border-(--dp-border) bg-(--dp-surface) px-2 text-[12px] hover:border-(--dp-border-strong) hover:bg-(--dp-row-hover) data-[state=open]:border-(--dp-border-strong) data-[state=open]:bg-(--dp-chip-soft)">
        <span className="shrink-0 text-(--dp-muted)">{label}</span>
        <span className={cn('dp-num inline-flex min-w-0 items-center gap-1.5 truncate font-[560]', muted ? 'text-(--dp-secondary)' : 'text-(--dp-text)')}>{value}</span>
        {cap && <CapTag cap={cap} />}
      </button>
    </PopoverTrigger>
    <PopoverContent align="start" sideOffset={6} className="dp-pop" style={popStyle(width)}>{children(() => setOpen(false))}</PopoverContent>
  </Popover>;
}
