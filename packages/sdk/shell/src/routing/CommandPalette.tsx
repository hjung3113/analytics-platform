import { CornerDownLeft, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { type MenuEntry, useI18n, useRecentVisits } from '@ap/kernel';
import { useHostPlatform, useLeaveRequest, useOverlayState } from '@ap/kernel/host';
import type { Text } from '@ap/contracts';
import { usePlatformMenu } from '../frame/platformMenu';
import { isNearMiss, MATCH_NAME, matchRank, queryWords, type PaletteTarget } from './paletteMatch';
import { cn, Dialog, DialogContent, DialogTitle } from '@ap/ui';

/** §10: menu navigation is the palette's base responsibility; entity search/action commands are Deferred. */
export function CommandPalette() {
  const { setPaletteOpen, menusInSpace, accessibleSpaces, navigate, linkTo, registry, pathname } = useHostPlatform();
  const { paletteOpen, paletteSession } = useOverlayState();
  const leaveRequest = useLeaveRequest();
  const recent = useRecentVisits();
  const { t, tx, text, lang } = useI18n();
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const [failedSelection, setFailedSelection] = useState(false);
  const platformLabel = text('palettePlatform');
  const platformMenus = usePlatformMenu().sections.flatMap(section => section.items);
  const paletteOwner = useRef(Symbol('CommandPalette'));
  const disposalTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    const owner = paletteOwner.current;
    clearTimeout(disposalTimer.current);
    return () => {
      // Component disposal may happen while Provider still considers the palette open.
      // Defer until FocusScope's passive cleanup has removed its trap listeners.
      if (paletteSession) disposalTimer.current = setTimeout(() => paletteSession.release(owner), 0);
    };
  }, [paletteSession]);


  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); if (!leaveRequest) setPaletteOpen(!paletteOpen); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [paletteOpen, setPaletteOpen, leaveRequest]);
  useEffect(() => { if (paletteOpen) { setQ(''); setActive(0); } }, [paletteOpen]);

  // A false navigate can also mean the current URL (no request); retain the old close behavior there.
  useEffect(() => {
    if (!failedSelection) return;
    setFailedSelection(false);
    if (!leaveRequest) setPaletteOpen(false);
  }, [failedSelection, leaveRequest, setPaletteOpen]);

  const { sections, suggested } = useMemo(() => {
    const recentRank = (id: string) => { const i = recent.findIndex(r => r.menuId === id); return i < 0 ? 99 : i; };
    const words = queryWords(q);
    const searching = words.length > 0;
    const targetOf = (m: MenuEntry, names: readonly string[]): PaletteTarget => {
      const group = registry.groupById(m.group);
      return { names: [m.label.ko, m.label.en], keywords: [...(m.keywords?.ko ?? []), ...(m.keywords?.en ?? [])], context: [...names, group.label.ko, group.label.en] };
    };
    const build = (pick: (m: MenuEntry, target: PaletteTarget) => number | null) => {
      // Rank (name > keyword > group/system), then implemented above planned, then recent. Without a query only recency orders.
      const sort = (menus: readonly MenuEntry[], names: readonly string[]) => menus.filter(m => !m.navHidden)
        .flatMap(m => { const rank = pick(m, targetOf(m, names)); return rank === null ? [] : [{ m, rank }]; })
        .sort((a, b) => a.rank - b.rank
          || (searching ? Number(!a.m.component && !a.m.moduleScreen) - Number(!b.m.component && !b.m.moduleScreen) : 0)
          || recentRank(a.m.id) - recentRank(b.m.id))
        .map(entry => entry.m);
      const bundles: { key: string; label: Text; items: MenuEntry[] }[] = [];
      for (const space of accessibleSpaces) {
        const items = sort(menusInSpace(space.id), [space.label.ko, space.label.en]);
        if (items.length) bundles.push({ key: space.id, label: space.label, items });
      }
      const globals = sort(platformMenus, [platformLabel.ko, platformLabel.en]);
      if (globals.length) bundles.push({ key: 'platform', label: platformLabel, items: globals });
      return bundles;
    };
    const found = build((_m, target) => searching ? matchRank(words, target) : MATCH_NAME);
    if (found.length || !searching) return { sections: found, suggested: false };
    // Nothing matched: offer menus one letter away from the query.
    const near = build((_m, target) => isNearMiss(q, target) ? MATCH_NAME : null);
    return { sections: near, suggested: near.length > 0 };
  }, [accessibleSpaces, menusInSpace, platformMenus, recent, q, registry, platformLabel]);

  const items = sections.flatMap(section => section.items);
  const activeId = items[active]?.id;
  useEffect(() => {
    if (!activeId) return;
    document.getElementById(`palette-${activeId}`)?.scrollIntoView?.({ block: 'nearest' });
  }, [activeId]);

  const go = (index: number) => {
    const m = items[index];
    if (!m) return;
    const href = linkTo(m.id);
    const changesPage = href.split('?')[0] !== pathname;
    const moved = navigate(href, changesPage ? { focus: 'page', via: 'palette' } : { via: 'palette' });
    // A held move keeps the search and active option mounted beneath the confirmation.
    if (!moved) { setFailedSelection(true); return; }
    if (changesPage) paletteSession?.select();
    setPaletteOpen(false);
  };

  let index = 0;
  return <Dialog open={paletteOpen} onOpenChange={setPaletteOpen}>
      <DialogContent closeLabel={t('close')} scrim="palette" aria-describedby={undefined}
        className="top-[12vh] w-[min(640px,92vw)] max-w-none translate-y-0 gap-0 overflow-hidden p-0"
        onOpenAutoFocus={() => {
          paletteSession?.claim(paletteOwner.current);
        }}
        onCloseAutoFocus={event => {
          event.preventDefault();
          if (!paletteSession) return;
          // Only this instance may release its rendered palette block.
          paletteSession.release(paletteOwner.current);
          if (!paletteSession.isCurrent()) return;
          if (paletteSession.isSelecting()) return;
          const target = paletteSession.opener?.isConnected && paletteSession.opener !== document.body
            ? paletteSession.opener : document.getElementById('platform-main');
          target?.focus({ preventScroll: true });
        }}>
        <DialogTitle className="sr-only">{t('goTo')}</DialogTitle>
        <div className="flex items-center gap-2 border-b border-border-subtle px-4 pr-12 focus-within:ring-2 focus-within:ring-inset focus-within:ring-focus-ring">
          <Search className="size-4 text-text-muted" aria-hidden />
          <input value={q} onChange={e => { setQ(e.target.value); setActive(0); }} placeholder={t('palettePlaceholder')} aria-label={t('paletteName')}
            role="combobox" aria-expanded aria-controls="palette-list" aria-activedescendant={items[active] ? `palette-${items[active].id}` : undefined}
            className="h-12 flex-1 bg-transparent text-base outline-none"
            onKeyDown={e => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(items.length - 1, a + 1)); }
              if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(0, a - 1)); }
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); go(active); }
            }} />
        </div>
        <ul id="palette-list" role="listbox" className="max-h-[50vh] overflow-auto p-1.5">
          {items.length === 0 && <li className="px-3 py-6 text-center text-sm text-text-muted">{t('paletteEmpty')}</li>}
          {suggested && <li role="presentation" className="px-3 pb-1 pt-2 text-sm text-text-muted">{t('paletteDidYouMean')}</li>}
          {sections.map(section => {
            const headingId = `palette-heading-${section.key}`;
            return <li key={section.key} role="presentation">
              <p id={headingId} role="presentation" className="px-3 pb-1 pt-2 t-nav-group text-text-muted">{tx(section.label)}</p>
              <ul role="group" aria-labelledby={headingId}>
                {section.items.map(m => {
                  const i = index++;
                  const Icon = m.icon;
                  // <system> › <section> › <menu> (15 §3.2); a name repeated right after itself is written once.
                  const base = [tx(section.label), tx(registry.groupById(m.group).label), tx(m.label)].filter((name, at, names) => at === 0 || name !== names[at - 1]).join(' › ');
                  return <li key={m.id} id={`palette-${m.id}`} role="option" aria-selected={i === active} onMouseEnter={() => setActive(i)} onClick={() => go(i)}
                    className={cn('flex cursor-pointer items-center gap-3 rounded-md px-3 py-2', i === active && 'bg-accent-primary-soft')}>
                    <Icon className="size-4 text-text-muted" aria-hidden />
                    <span className="flex-1">
                      <span className="block text-sm font-medium">{tx(m.label)}</span>
                      <span className="block text-tiny text-text-secondary">{!m.component && !m.moduleScreen ? `${base} · ${t('planned')}` : base}</span>
                    </span>
                    {i === active && <CornerDownLeft className="size-3.5 text-text-muted" aria-hidden />}
                  </li>;
                })}
              </ul>
            </li>;
          })}
        </ul>
        <p className="border-t border-border-subtle bg-surface-sunken px-4 py-2 text-tiny text-text-secondary">{t('paletteHint')} · {lang === 'ko' ? '이동 시 전역 Context를 보존합니다.' : 'Global context is preserved on navigation.'}</p>
      </DialogContent>
  </Dialog>;
}
