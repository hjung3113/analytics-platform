// THROWAWAY #423 — never merge.
import { Check, ChevronDown, ChevronRight, CornerDownLeft, House, LayoutGrid, Search } from 'lucide-react';
import { useMemo, useRef, useState, type ComponentType, type ReactNode } from 'react';
import type { SpaceId } from '@ap/contracts';
import { type MenuEntry, PlatformLink, useI18n, usePlatform } from '@ap/kernel';
import { cn, Dialog, DialogContent, DialogTitle, Popover, PopoverContent, PopoverTrigger, Tooltip, TooltipContent, TooltipTrigger, usePrototype } from '@ap/ui';

type Icon = ComponentType<{ className?: string }>;
export interface Row { key: string; spaceId?: SpaceId; title: string; sub?: string; icon: Icon; current?: boolean; href?: string | null; inert?: boolean; section: 'main' | 'planned' }
export interface Section { groupId: string; label: string; icon: Icon; href: string | null }

const plain = (m: MenuEntry) => !m.navHidden && !m.path.split('/').some(s => s.startsWith(':'));

/** Sections (= groups with visible menus) of one space, each with its first menu's link. */
export function useSectionsOf() {
  const { registry, menusInSpace, linkTo } = usePlatform();
  const { tx } = useI18n();
  return (spaceId: SpaceId): Section[] => {
    const menus = menusInSpace(spaceId);
    return registry.groups.filter(g => g.space === spaceId).flatMap(g => {
      const first = menus.find(m => m.group === g.id && plain(m));
      return first ? [{ groupId: g.id, label: tx(g.label), icon: g.icon as Icon, href: linkTo(first.id) }] : [];
    });
  };
}

export function useCurrentGroupId() {
  const { route } = usePlatform();
  return route?.menu.group ?? null;
}

function useRows(): Row[] {
  const { accessibleSpaces, currentSpace, registry, spaceEntry, resolveLink } = usePlatform();
  const { tx } = useI18n();
  const { fixed } = usePrototype();
  const homeMenu = registry.matchRoute('/')?.menu;
  const homeOpened = homeMenu ? resolveLink(homeMenu.id) : null;
  return [
    { key: 'home', title: '플랫폼 홈', icon: House, href: homeOpened?.allowed ? homeOpened.href : null, section: 'main' as const },
    ...accessibleSpaces.map(space => {
      const entry = spaceEntry(space.id);
      const name = entry ? tx(registry.menuById(entry.menuId).label) : tx(registry.menuById(space.homeMenuId).label);
      return { key: space.id, spaceId: space.id, title: tx(space.label), sub: `${entry?.resumed ? '이어서' : '시작'}: ${name}`, icon: registry.groupById(registry.menuById(space.homeMenuId).group).icon as Icon,
        current: currentSpace?.id === space.id, href: entry?.href ?? null, section: 'main' as const };
    }),
    ...fixed.map(f => ({ key: f.id, title: f.label, sub: f.reason, icon: f.icon, inert: true, section: f.section === 'planned' ? 'planned' as const : 'main' as const })),
  ];
}

function useGo(close: () => void, selected: { current: boolean }) {
  const { navigate, pathname } = usePlatform();
  return (href: string) => {
    selected.current = true;
    close();
    navigate(href, href.split('?')[0] !== pathname ? { focus: 'page' } : undefined);
  };
}

export function SwitcherButton() {
  const { variant } = usePrototype();
  const { currentSpace, registry, setPaletteOpen, paletteOpen } = usePlatform();
  const { tx } = useI18n();
  const [open, setOpen] = useState(false);
  const selected = useRef(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const Cur = currentSpace ? registry.groupById(registry.menuById(currentSpace.homeMenuId).group).icon as Icon : LayoutGrid;
  const label = currentSpace ? `업무 시스템 전환 · 현재: ${tx(currentSpace.label)}` : '업무 시스템 전환';
  const rows = useRows();
  const go = useGo(() => setOpen(false), selected);
  const button = <button type="button" aria-label={label} aria-haspopup="dialog" aria-expanded={variant === 'C' ? paletteOpen : open}
    onClick={variant === 'C' ? () => setPaletteOpen(true) : undefined}
    className="relative grid size-8 place-items-center rounded-md bg-accent-primary-soft text-accent-primary hover:bg-surface-row-hover">
    <Cur className="size-4" aria-hidden /><ChevronDown className="absolute bottom-0.5 right-0.5 size-2.5" aria-hidden />
  </button>;
  const wrap = (node: ReactNode) => <div className="-mt-3 flex h-[50px] w-full shrink-0 items-center justify-center">{node}</div>;
  const focusIn = (e: Event, sel: string) => { e.preventDefault(); contentRef.current?.querySelector<HTMLElement>(sel)?.focus(); };
  const onOpen = (v: boolean) => { if (v) selected.current = false; setOpen(v); };

  if (variant === 'C') return <>{wrap(<Tooltip><TooltipTrigger asChild>{button}</TooltipTrigger><TooltipContent side="right">{label}</TooltipContent></Tooltip>)}<SearchDialog rows={rows} /></>;

  if (variant === 'A') {
    const main = rows.filter(r => r.section === 'main' && r.key !== 'home');
    const planned = rows.filter(r => r.section === 'planned');
    const home = rows.find(r => r.key === 'home')!;
    return wrap(<Popover modal open={open} onOpenChange={onOpen}>
      <PopoverTrigger asChild>{button}</PopoverTrigger>
      <PopoverContent ref={contentRef} side="right" align="start" padding="none" className="w-[520px]"
        onOpenAutoFocus={e => focusIn(e, '[data-current-card], [data-card]')}
        onCloseAutoFocus={e => { if (selected.current) e.preventDefault(); }}>
        <div role="dialog" aria-label="업무 시스템 전환">
          <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
            <h2 className="text-sm font-semibold">업무 시스템 전환</h2>
            <button type="button" disabled={!home.href} onClick={() => home.href && go(home.href)} className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-text-secondary hover:bg-surface-row-hover"><House className="size-3.5" aria-hidden />플랫폼 홈</button>
          </div>
          <ul className="grid grid-cols-2 gap-2 p-3">{main.map(r => <li key={r.key}><Card row={r} go={go} /></li>)}</ul>
          {planned.length > 0 && <div className="border-t border-border-subtle p-3"><p className="mb-2 text-caption font-semibold text-text-muted">준비 중</p>
            <ul className="grid grid-cols-2 gap-2">{planned.map(r => <li key={r.key}><Card row={r} go={go} /></li>)}</ul></div>}
        </div>
      </PopoverContent>
    </Popover>);
  }

  return wrap(<Dialog open={open} onOpenChange={onOpen}>
    <Tooltip><TooltipTrigger asChild><button type="button" aria-label={label} aria-haspopup="dialog" aria-expanded={open} onClick={() => onOpen(true)}
      className="relative grid size-8 place-items-center rounded-md bg-accent-primary-soft text-accent-primary hover:bg-surface-row-hover"><Cur className="size-4" aria-hidden /><ChevronDown className="absolute bottom-0.5 right-0.5 size-2.5" aria-hidden /></button></TooltipTrigger><TooltipContent side="right">{label}</TooltipContent></Tooltip>
    <DialogContent ref={contentRef} closeLabel="닫기" aria-describedby={undefined}
      className="left-(--rail-width) top-0 h-full w-[280px] max-w-none translate-x-0 translate-y-0 content-start gap-0 overflow-y-auto p-0 data-[state=open]:translate-x-0"
      onOpenAutoFocus={e => focusIn(e, '[data-first]')} onCloseAutoFocus={e => { if (selected.current) e.preventDefault(); }}>
      <DialogTitle className="sr-only">업무 시스템 전환</DialogTitle>
      <p aria-hidden className="border-b border-border-subtle px-4 py-3.5 text-sm font-semibold">업무 시스템 전환</p>
      <PanelB rows={rows} go={go} />
    </DialogContent>
  </Dialog>);
}

function Card({ row, go }: { row: Row; go: (href: string) => void }) {
  const Ic = row.icon;
  return <button type="button" {...(row.current ? { 'data-current-card': true, 'aria-current': 'true' as const } : { 'data-card': true })}
    aria-describedby={undefined} onClick={() => row.href && !row.inert && go(row.href)}
    className={cn('flex w-full items-start gap-2 rounded-md border px-3 py-2.5 text-left hover:bg-surface-row-hover', row.current ? 'border-accent-primary bg-accent-primary-soft' : 'border-border-subtle', row.inert && 'text-text-muted')}>
    <Ic className="mt-0.5 size-4 shrink-0" aria-hidden />
    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{row.title}</span><span className="block truncate text-caption text-text-muted">{row.sub}</span></span>
    {row.current && <span className="flex items-center gap-0.5 text-caption font-semibold text-accent-primary"><Check className="size-3" aria-hidden />현재</span>}
  </button>;
}

function PanelB({ rows, go }: { rows: Row[]; go: (href: string) => void }) {
  const { currentSpace, registry } = usePlatform();
  const sectionsOf = useSectionsOf();
  const curGroup = useCurrentGroupId();
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(currentSpace ? [currentSpace.id] : []));
  const toggle = (k: string) => setExpanded(s => { const n = new Set(s); if (!n.delete(k)) n.add(k); return n; });
  void registry;
  const item = 'flex min-h-9 w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-sm text-text-secondary hover:bg-surface-row-hover';
  return <ul className="p-2">{rows.map(r => {
    const Ic = r.icon;
    if (r.key === 'home') return <li key={r.key}><button type="button" data-first disabled={!r.href} onClick={() => r.href && go(r.href)} className={item}><Ic className="size-4" aria-hidden />{r.title}</button></li>;
    if (r.inert) return <li key={r.key}>{r.key === 'feedbackops' || r.section === 'planned' ? null : null}<button type="button" onClick={() => undefined} className={cn(item, 'text-text-muted')}><Ic className="size-4" aria-hidden /><span className="flex-1">{r.title}</span><span className="text-caption">{r.sub}</span></button></li>;
    const open = expanded.has(r.key);
    const secs = r.spaceId ? sectionsOf(r.spaceId) : [];
    return <li key={r.key}>
      <div className="flex items-center">
        <button type="button" aria-expanded={open} aria-label={`${r.title} 섹션 ${open ? '접기' : '펼치기'}`} onClick={() => toggle(r.key)} className="grid size-7 place-items-center rounded-md text-text-muted hover:bg-surface-row-hover"><ChevronRight className={cn('size-3.5', open && 'rotate-90')} aria-hidden /></button>
        <button type="button" onClick={() => r.href && go(r.href)} className={cn(item, 'flex-1', r.current && 'font-semibold text-text-primary')}><Ic className="size-4" aria-hidden /><span className="min-w-0 flex-1 truncate">{r.title}</span>{r.current && <Check className="size-3.5 text-accent-primary" aria-label="현재" />}</button>
      </div>
      {open && <ul className="ml-9 space-y-0.5 pb-1">{secs.map(s => <li key={s.groupId}><button type="button" onClick={() => s.href && go(s.href)}
        className={cn('flex min-h-8 w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm text-text-secondary hover:bg-surface-row-hover', r.current && curGroup === s.groupId && 'bg-surface-row-selected font-semibold text-text-primary')}>
        <s.icon className="size-3.5" aria-hidden />{s.label}</button></li>)}</ul>}
    </li>;
  })}
  <li className="mt-2 border-t border-border-subtle px-3 pt-2 text-caption font-semibold text-text-muted">준비 중</li>
  {rows.filter(r => r.section === 'planned').map(r => <li key={r.key}><button type="button" onClick={() => undefined} className={cn(item, 'text-text-muted')}><r.icon className="size-4" aria-hidden /><span className="flex-1">{r.title}</span><span className="text-caption">{r.sub}</span></button></li>)}
  </ul>;
}

/** C: one dialog for switching systems and searching every menu of every accessible space. */
export function SearchDialog({ rows }: { rows: Row[] }) {
  const { paletteOpen, setPaletteOpen, accessibleSpaces, menusInSpace, registry, linkTo } = usePlatform();
  const { tx } = useI18n();
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const selected = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const go = useGo(() => setPaletteOpen(false), selected);
  const needle = q.trim().toLowerCase();
  const items = useMemo(() => {
    const out: { key: string; title: string; sub: string; icon: Icon; href: string | null; inert?: boolean; current?: boolean; planned?: boolean }[] = [];
    const sysRows = rows.filter(r => !needle || r.title.toLowerCase().includes(needle));
    for (const r of sysRows) out.push({ key: `s-${r.key}`, title: r.title, sub: r.sub ?? '', icon: r.icon, href: r.href ?? null, inert: r.inert, current: r.current, planned: r.section === 'planned' });
    if (needle) for (const space of accessibleSpaces) for (const m of menusInSpace(space.id).filter(plain)) {
      const g = registry.groupById(m.group);
      if ([m.label.ko, m.label.en, g.label.ko, g.label.en].some(s => s.toLowerCase().includes(needle))) out.push({ key: `m-${m.id}`, title: tx(m.label), sub: `${tx(space.label)} › ${tx(g.label)} › ${tx(m.label)}`, icon: m.icon as Icon, href: linkTo(m.id) });
    }
    return out;
  }, [rows, needle, accessibleSpaces, menusInSpace, registry, linkTo, tx]);
  const pick = (i: number) => { const it = items[i]; if (it?.href && !it.inert) go(it.href); };
  return <Dialog open={paletteOpen} onOpenChange={v => { if (v) { selected.current = false; setQ(''); setActive(0); } setPaletteOpen(v); }}>
    <DialogContent closeLabel="닫기" aria-describedby={undefined} className="top-[12vh] w-[min(560px,92vw)] max-w-none translate-y-0 gap-0 overflow-hidden p-0"
      onOpenAutoFocus={e => { e.preventDefault(); inputRef.current?.focus(); }} onCloseAutoFocus={e => { if (selected.current) e.preventDefault(); }}>
      <DialogTitle className="sr-only">업무 시스템 전환 · 검색</DialogTitle>
      <div className="flex items-center gap-2 border-b border-border-subtle px-4 pr-12 focus-within:ring-2 focus-within:ring-inset focus-within:ring-focus-ring">
        <Search className="size-4 text-text-muted" aria-hidden />
        <input ref={inputRef} value={q} onChange={e => { setQ(e.target.value); setActive(0); }} placeholder="시스템 전환 또는 메뉴 검색" aria-label="시스템 전환 또는 메뉴 검색"
          role="combobox" aria-expanded aria-controls="sw-list" aria-activedescendant={items[active] ? `sw-${items[active].key}` : undefined} className="h-12 flex-1 bg-transparent text-base outline-none"
          onKeyDown={e => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(items.length - 1, a + 1)); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(0, a - 1)); }
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); pick(active); }
          }} />
      </div>
      <ul id="sw-list" role="listbox" className="max-h-[50vh] overflow-auto p-1.5">
        {items.length === 0 && <li className="px-3 py-6 text-center text-sm text-text-muted">결과가 없습니다</li>}
        {items.map((it, i) => <li key={it.key} id={`sw-${it.key}`} role="option" aria-selected={i === active} onMouseEnter={() => setActive(i)} onClick={() => pick(i)}
          className={cn('flex cursor-pointer items-center gap-3 rounded-md px-3 py-2', i === active && 'bg-accent-primary-soft', it.inert && 'text-text-muted')}>
          <it.icon className="size-4 text-text-muted" aria-hidden />
          <span className="flex-1"><span className="block text-sm font-medium">{it.title}{it.planned && <span className="ml-2 text-caption font-normal">준비 중</span>}</span><span className="block text-tiny text-text-secondary">{it.sub}</span></span>
          {it.current && <span className="text-caption font-semibold text-accent-primary">현재</span>}
          {i === active && !it.inert && <CornerDownLeft className="size-3.5 text-text-muted" aria-hidden />}
        </li>)}
      </ul>
    </DialogContent>
  </Dialog>;
}

export { PlatformLink };
