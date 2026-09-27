/**
 * #52 prototype — shell B (Datadog / Grafana, throwaway). No sidebar: a 48px dark icon rail with a 232px flyout,
 * and a 44px top bar whose right side IS the global Context toolbar. Pages carry no Context row of their own.
 * `[` toggles the flyout between overlay (default) and pinned (content pushed by 232px).
 */
import { Check, Clock, Command, LogOut, Pin, PinOff, Star } from 'lucide-react';
import { Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { type MenuEntry, PlatformLink, useI18n, usePlatform } from '@ap/kernel';
import { RouteOutlet } from '@ap/shell';
import { cn, Popover, PopoverContent, PopoverTrigger } from '@ap/ui';
import {
  CapTag, ConditionBody, PeriodBody, popStyle, RoomBody, ScopeBody, SelectionBody, UnsupportedBody,
  useContextActions, useContextModel, usePeriodSummary, AXIS_LABEL,
} from './context-editors';
import { conditionLabel, type GroupId } from '@ap/contracts';
import { EquipmentB } from './equipment-b';

const PIN_KEY = 'dp:b:pinned';
const typing = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable);
};
type Panel = { kind: 'group'; id: GroupId } | { kind: 'favorites' } | { kind: 'recent' };

export function ShellB() {
  const { pathname, route, can, contractError, registry, visibleMenus } = usePlatform();
  const [pinned, setPinned] = useState(() => { try { return localStorage.getItem(PIN_KEY) === '1'; } catch { return false; } });
  const [open, setOpen] = useState<Panel | null>(null);
  const activeGroup = route?.menu.group ?? registry.groups.find(g => visibleMenus.some(m => m.group === g.id))?.id ?? null;
  const togglePin = () => setPinned(p => { try { localStorage.setItem(PIN_KEY, p ? '0' : '1'); } catch { /* ignore */ } return !p; });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '[' && !e.metaKey && !e.ctrlKey && !e.altKey && !typing(e.target)) togglePin();
      if (e.key === 'Escape') setOpen(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => { if (!pinned) setOpen(null); }, [pathname, pinned]);
  const shown: Panel | null = open ?? (pinned && activeGroup ? { kind: 'group', id: activeGroup } : null);
  const equipment = pathname === '/equipment' && route?.menu.id === 'equipment-master' && can('equipment:view') && !contractError;

  return <div className="dp-root relative flex h-full overflow-hidden">
    <a href="#platform-main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2">Skip to content</a>
    <Rail shown={shown} activeGroup={activeGroup} onPick={p => setOpen(o => (o && JSON.stringify(o) === JSON.stringify(p) && !pinned ? null : p))} />
    {shown && <Flyout panel={shown} pinned={pinned} onTogglePin={togglePin} onClose={() => setOpen(null)} />}
    <div className="flex min-w-0 flex-1 flex-col" style={{ marginLeft: pinned && shown ? 232 : 0 }}>
      <TopBarB />
      <main id="platform-main" tabIndex={-1} className="dp-scroll min-h-0 flex-1 overflow-y-auto bg-(--dp-canvas) outline-none">
        {equipment ? <EquipmentB />
          : <div className="bg-(--dp-surface) pb-16"><Suspense fallback={<p className="px-3 py-6 text-[12px] text-(--dp-muted)">…</p>}><RouteOutlet /></Suspense></div>}
      </main>
    </div>
  </div>;
}

/* ---------- rail + flyout ---------- */

function Rail({ shown, activeGroup, onPick }: { shown: Panel | null; activeGroup: string | null; onPick: (p: Panel) => void }) {
  const { visibleMenus, registry, setPaletteOpen } = usePlatform();
  const { t, tx, lang } = useI18n();
  const groups = registry.groups.filter(g => visibleMenus.some(m => m.group === g.id && !m.navHidden));
  const isOpen = (p: Panel) => !!shown && JSON.stringify(shown) === JSON.stringify(p);
  const brand = lang === 'ko' ? '분석' : 'Analytics';
  return <nav aria-label={lang === 'ko' ? '주 메뉴' : 'Primary'} className="z-30 flex h-full w-12 shrink-0 flex-col items-center bg-(--dp-rail) py-1.5">
    <span title={brand} className="mb-2 grid h-9 w-10 place-items-center">
      <span aria-hidden className="grid size-6 place-items-center rounded-[5px] bg-[linear-gradient(135deg,#7c3aed,#632ca6)]">
        <span className="h-2.5 w-[3px] rounded-[1px] bg-white" /><span className="sr-only">{brand}</span>
      </span>
    </span>
    <RailBtn label={`${t('menuSearch')} (⌘K)`} onClick={() => setPaletteOpen(true)}><Command className="size-[17px]" aria-hidden /></RailBtn>
    <span aria-hidden className="my-1.5 h-px w-6 bg-[#1f2937]" />
    <div className="dp-scroll flex flex-1 flex-col items-center gap-1 overflow-y-auto">
      {groups.map(g => {
        const Icon = g.icon;
        return <RailBtn key={g.id} label={tx(g.label)} active={g.id === activeGroup} open={isOpen({ kind: 'group', id: g.id })} onClick={() => onPick({ kind: 'group', id: g.id })}>
          <Icon className="size-[18px]" strokeWidth={1.75} aria-hidden />
        </RailBtn>;
      })}
    </div>
    <div className="flex flex-col items-center gap-1 border-t border-[#1f2937] pt-1.5">
      <RailBtn label={t('favorites')} open={isOpen({ kind: 'favorites' })} onClick={() => onPick({ kind: 'favorites' })}><Star className="size-[17px]" strokeWidth={1.75} aria-hidden /></RailBtn>
      <RailBtn label={t('recent')} open={isOpen({ kind: 'recent' })} onClick={() => onPick({ kind: 'recent' })}><Clock className="size-[17px]" strokeWidth={1.75} aria-hidden /></RailBtn>
    </div>
  </nav>;
}

function RailBtn({ label, active, open, onClick, children }: { label: string; active?: boolean; open?: boolean; onClick: () => void; children: ReactNode }) {
  return <button type="button" aria-label={label} title={label} aria-expanded={open} onClick={onClick}
    className={cn('relative grid h-8 w-10 shrink-0 place-items-center rounded-(--dp-radius) transition-colors hover:bg-(--dp-nav-hover) hover:text-white',
      active || open ? 'text-white' : 'text-(--dp-faint)', open && 'bg-(--dp-nav-hover)')}>
    {active && <span aria-hidden className="absolute -left-1 top-1 bottom-1 w-0.5 rounded-r bg-white" />}
    {children}
  </button>;
}

function Flyout({ panel, pinned, onTogglePin, onClose }: { panel: Panel; pinned: boolean; onTogglePin: () => void; onClose: () => void }) {
  const { visibleMenus, registry, route, favorites, recent } = usePlatform();
  const { t, tx, lang } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (pinned) return;
    const onDown = (e: MouseEvent) => { const el = e.target as HTMLElement; if (!ref.current?.contains(el) && !el.closest('nav[aria-label]')) onClose(); };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [pinned, onClose]);
  const nav = visibleMenus.filter(m => !m.navHidden);
  const activeId = route ? (route.menu.navHidden && route.menu.parent ? route.menu.parent : route.menu.id) : null;
  let title: string; let body: ReactNode;
  if (panel.kind === 'group') {
    const g = registry.groupById(panel.id);
    title = tx(g.label);
    body = nav.filter(m => m.group === panel.id).map(m => <FlyItem key={m.id} menu={m} active={m.id === activeId} />);
  } else if (panel.kind === 'favorites') {
    title = t('favorites');
    const favs = favorites.map(id => nav.find(m => m.id === id)).filter((m): m is MenuEntry => !!m);
    body = favs.length ? favs.map(m => <FlyItem key={m.id} menu={m} active={m.id === activeId} />)
      : <p className="px-3 py-2 text-[12px] text-[#9ca3af]">{lang === 'ko' ? '제목 옆 ☆로 추가합니다.' : 'Add with ☆ next to a title.'}</p>;
  } else {
    title = t('recent');
    const items = recent.filter(r => visibleMenus.some(m => m.id === r.menuId)).slice(0, 5);
    body = items.length ? items.map(r => {
      const m = registry.menuById(r.menuId);
      return <PlatformLink key={r.menuId} href={r.url} title={r.url} className="mx-1.5 flex h-8 items-center gap-2 rounded-(--dp-radius) px-2 text-[13px] text-[#e5e7eb] hover:bg-[#2b3544]">
        <Clock className="size-3.5 shrink-0 text-[#9ca3af]" aria-hidden /><span className="truncate">{tx(m.label)}</span>
      </PlatformLink>;
    }) : <p className="px-3 py-2 text-[12px] text-[#9ca3af]">{t('noRecent')}</p>;
  }
  return <div ref={ref} className="absolute bottom-0 left-12 top-0 z-30 flex w-[232px] flex-col border-r border-black/30 bg-(--dp-flyout) text-[#e5e7eb]"
    style={{ boxShadow: pinned ? 'none' : '8px 0 24px rgba(17,24,39,.18)' }}>
    <div className="flex h-11 shrink-0 items-center gap-2 border-b border-white/5 pl-3 pr-1.5">
      <span className="flex-1 truncate text-[13px] font-semibold text-white">{title}</span>
      <button type="button" onClick={onTogglePin} aria-pressed={pinned} title={`${pinned ? (lang === 'ko' ? '고정 해제' : 'Unpin') : (lang === 'ko' ? '고정' : 'Pin')} ([)`}
        className="grid size-7 place-items-center rounded-(--dp-radius) text-[#9ca3af] hover:bg-[#2b3544] hover:text-white">
        {pinned ? <PinOff className="size-3.5" aria-hidden /> : <Pin className="size-3.5" aria-hidden />}
      </button>
    </div>
    <div className="dp-scroll flex-1 space-y-px overflow-y-auto py-1.5">{body}</div>
  </div>;
}

function FlyItem({ menu, active }: { menu: MenuEntry; active: boolean }) {
  const { linkTo } = usePlatform();
  const { tx, lang } = useI18n();
  const Icon = menu.icon;
  return <PlatformLink href={linkTo(menu.id)} aria-current={active ? 'page' : undefined}
    className={cn('mx-1.5 flex h-8 items-center gap-2 rounded-(--dp-radius) px-2 text-[13px]', active ? 'bg-(--dp-nav-active) font-[560] text-white' : 'text-[#e5e7eb] hover:bg-[#2b3544]')}>
    <Icon className={cn('size-4 shrink-0', active ? 'text-white' : 'text-[#9ca3af]')} strokeWidth={1.75} aria-hidden />
    <span className="flex-1 truncate">{tx(menu.label)}</span>
    {!menu.component && <span className="text-[10px] text-[#6b7280]">{lang === 'ko' ? '예정' : 'Planned'}</span>}
  </PlatformLink>;
}

/* ---------- top bar = global Context toolbar ---------- */

function TopBarB() {
  const { global, scope, session, route, registry, setPaletteOpen, slots } = usePlatform();
  const { t, tx, lang } = useI18n();
  const ko = lang === 'ko';
  const { cap, editable, carried } = useContextModel();
  const actions = useContextActions();
  const period = usePeriodSummary();
  const scopeLabel = session.scopes.find(s => s.id === global.scopeId)?.label ?? global.scopeId ?? t('scopeNone');
  const dot = scope.status === 'valid' ? '#0e7c3a' : scope.status === 'validating' ? '#9ca3af' : scope.status === 'none' ? 'transparent' : '#b45309';
  const count = (ids: string[] | null, noun: string) => (ids === null ? `${noun} ${ko ? '전체' : 'all'}` : `${noun} ${ids.length}`);

  return <header className="flex min-h-11 shrink-0 flex-wrap items-center gap-x-3 border-b border-(--dp-border) bg-(--dp-surface) px-3">
    <nav aria-label="Breadcrumb" className="flex h-11 min-w-[120px] flex-1 basis-[160px] items-center gap-1.5 overflow-hidden whitespace-nowrap text-[12px] text-(--dp-muted)">
      <span className="shrink-0">{ko ? '분석' : 'Analytics'}</span>
      {route && <><span aria-hidden className="text-(--dp-faint)">/</span><span className="truncate">{tx(registry.groupById(route.menu.group).label)}</span>
        <span aria-hidden className="text-(--dp-faint)">/</span><span aria-current="page" className="truncate font-[560] text-(--dp-text)">{tx(route.menu.label)}</span></>}
    </nav>
    <div role="region" aria-label={t('globalContext')} className="ml-auto flex h-11 shrink-0 items-center gap-1">
      <Tool label="Scope" min={72} width={288} title={scope.status === 'forbidden' ? t('scopeForbidden') : scope.status === 'unknown_scope' ? t('scopeUnknown') : undefined}
        value={<><span aria-hidden className="size-1.5 rounded-full" style={{ background: dot, boxShadow: scope.status === 'none' ? 'inset 0 0 0 1px #9ca3af' : undefined }} />{scopeLabel}</>}>
        {close => <ScopeBody onDone={close} />}
      </Tool>
      {route && cap && <>
        {editable('time') && <Tool label={t('period')} min={168} width={300} value={<>{period}<CapTag cap={cap.time} /></>}>{close => <PeriodBody cap={cap.time} presetLayout="column" onDone={close} />}</Tool>}
        {editable('roomNames') && <Tool label="room" min={72} width={300} value={count(global.roomNames, 'room')}>{close => <RoomBody onDone={close} />}</Tool>}
        {editable('condition') && <Tool label={ko ? '그룹' : 'Group'} min={72} width={320}
          value={global.condition ? `${AXIS_LABEL(lang)[global.condition.axis]} ${conditionLabel(global.condition)}` : (ko ? '그룹 전체' : 'Group all')}>{close => <ConditionBody onDone={close} />}</Tool>}
        {editable('selection') && <Tool label={ko ? '설비' : 'Equipment'} min={72} width={320} value={count(global.selection, ko ? '설비' : 'Equip.')}>{close => <SelectionBody onDone={close} />}</Tool>}
        {carried.length > 0 && <Tool label={ko ? '미적용' : 'Not applied'} dashed width={300} value={`${ko ? '미적용' : 'Not applied'} ${carried.length}`}>{() => <UnsupportedBody carried={carried} />}</Tool>}
      </>}
      <span aria-hidden className="mx-1 h-4 w-px bg-(--dp-border)" />
      <button type="button" onClick={actions.copyLink} className="h-7 rounded-(--dp-radius) px-1.5 text-[12px] text-(--dp-muted) hover:bg-(--dp-chip-soft) hover:text-(--dp-text)">{ko ? '복사' : 'Copy'}</button>
      <button type="button" onClick={actions.reset} className="h-7 rounded-(--dp-radius) px-1.5 text-[12px] text-(--dp-muted) hover:bg-(--dp-chip-soft) hover:text-(--dp-text)">{actions.resetLabel}</button>
      <button type="button" onClick={() => setPaletteOpen(true)} aria-label={`${t('menuSearch')} (⌘K)`} title="⌘K"
        className="grid h-7 min-w-7 place-items-center rounded-(--dp-radius) bg-(--dp-chip-soft) px-1.5 text-[11px] font-medium text-(--dp-secondary) hover:bg-[#e5e7eb]">⌘K</button>
      {slots.topBarTools && <span className="flex items-center text-(--dp-muted) [&_button]:!size-7 [&_button]:!rounded-(--dp-radius) [&_button:hover]:!bg-(--dp-chip-soft)">{slots.topBarTools}</span>}
      <ProfileB />
    </div>
  </header>;
}

function Tool({ label, value, min, width, dashed, title, children }: {
  label: string; value: ReactNode; min?: number; width: number; dashed?: boolean; title?: string; children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild>
      <button type="button" aria-label={`${label}: ${typeof value === 'string' ? value : ''}`} title={title ?? label} style={{ minWidth: min }}
        className={cn('dp-num inline-flex h-7 max-w-[220px] items-center justify-center gap-1.5 whitespace-nowrap rounded-(--dp-radius) px-2 text-[12px] font-medium text-(--dp-secondary) hover:bg-[#e5e7eb] data-[state=open]:bg-[#e5e7eb] data-[state=open]:text-(--dp-text)',
          dashed ? 'border border-dashed border-(--dp-dashed) bg-transparent' : 'bg-(--dp-chip-soft)')}>
        <span className="inline-flex min-w-0 items-center gap-1.5 truncate">{value}</span>
      </button>
    </PopoverTrigger>
    <PopoverContent align="end" sideOffset={6} className="dp-pop" style={popStyle(width)}>{children(() => setOpen(false))}</PopoverContent>
  </Popover>;
}

/** Profile menu with the ko/en radio (never a segmented toggle); language never touches the URL. */
export function ProfileMenuBody() {
  const { user } = usePlatform();
  const { t, tx, lang, setLang } = useI18n();
  return <>
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
  </>;
}

export const initialsOf = (name: string) => name.split(' ').map(w => w[0]).join('');

function ProfileB() {
  const { user } = usePlatform();
  const { t } = useI18n();
  return <Popover>
    <PopoverTrigger asChild>
      <button type="button" aria-label={t('profile')} className="ml-1 grid size-7 place-items-center rounded-full hover:ring-2 hover:ring-(--dp-border) data-[state=open]:ring-2 data-[state=open]:ring-(--dp-border)">
        <span aria-hidden className="grid size-6 place-items-center rounded-full bg-[#374151] text-[10px] font-semibold text-white">{initialsOf(user.name)}</span>
      </button>
    </PopoverTrigger>
    <PopoverContent align="end" sideOffset={6} className="dp-pop" style={popStyle(236)}><ProfileMenuBody /></PopoverContent>
  </Popover>;
}
