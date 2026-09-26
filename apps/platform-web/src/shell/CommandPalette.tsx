import * as Dialog from '@radix-ui/react-dialog';
import { CornerDownLeft, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { PAGE_TYPE_LABELS, useI18n, usePlatform } from '@ap/kernel';
import { cn } from '@ap/ui';

/** §10: menu navigation is the palette's base responsibility; entity search/action commands are Deferred. */
export function CommandPalette() {
  const { paletteOpen, setPaletteOpen, visibleMenus, recent, navigate, linkTo, registry } = usePlatform();
  const { t, tx, lang } = useI18n();
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPaletteOpen(!paletteOpen); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [paletteOpen, setPaletteOpen]);
  useEffect(() => { if (paletteOpen) { setQ(''); setActive(0); } }, [paletteOpen]);

  const items = useMemo(() => {
    const rank = (id: string) => { const i = recent.findIndex(r => r.menuId === id); return i < 0 ? 99 : i; };
    const needle = q.trim().toLowerCase();
    return visibleMenus.filter(m => !m.navHidden)
      .filter(m => !needle || [m.label.ko, m.label.en, registry.groupById(m.group).label.ko, registry.groupById(m.group).label.en].some(s => s.toLowerCase().includes(needle)))
      .sort((a, b) => rank(a.id) - rank(b.id));
  }, [visibleMenus, recent, q]);

  const go = (index: number) => {
    const m = items[index];
    if (!m) return;
    setPaletteOpen(false);
    navigate(linkTo(m.id));
  };

  return <Dialog.Root open={paletteOpen} onOpenChange={setPaletteOpen}>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-text-primary/30" />
      <Dialog.Content aria-describedby={undefined} className="fixed left-1/2 top-[12vh] z-50 w-[min(640px,92vw)] -translate-x-1/2 overflow-hidden rounded-lg border border-border-strong bg-surface-card shadow-2xl">
        <Dialog.Title className="sr-only">{t('goTo')}</Dialog.Title>
        <div className="flex items-center gap-2 border-b border-border-subtle px-4">
          <Search className="size-4 text-text-muted" aria-hidden />
          <input autoFocus value={q} onChange={e => { setQ(e.target.value); setActive(0); }} placeholder={t('palettePlaceholder')}
            role="combobox" aria-expanded aria-controls="palette-list" aria-activedescendant={items[active] ? `palette-${items[active].id}` : undefined}
            className="h-12 flex-1 bg-transparent text-[14px] outline-none"
            onKeyDown={e => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(items.length - 1, a + 1)); }
              if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(0, a - 1)); }
              if (e.key === 'Enter') { e.preventDefault(); go(active); }
            }} />
        </div>
        <ul id="palette-list" role="listbox" className="max-h-[50vh] overflow-auto p-1.5">
          {items.length === 0 && <li className="px-3 py-6 text-center text-[13px] text-text-muted">{t('paletteEmpty')}</li>}
          {items.map((m, i) => {
            const Icon = m.icon;
            const group = registry.groupById(m.group);
            return <li key={m.id} id={`palette-${m.id}`} role="option" aria-selected={i === active} onMouseEnter={() => setActive(i)} onClick={() => go(i)}
              className={cn('flex cursor-pointer items-center gap-3 rounded-md px-3 py-2', i === active && 'bg-accent-primary-soft')}>
              <Icon className="size-4 text-text-muted" aria-hidden />
              <span className="flex-1">
                <span className="block text-[13px] font-medium">{tx(m.label)}</span>
                <span className="block text-[11px] text-text-muted">{tx(group.label)} · {tx(PAGE_TYPE_LABELS[m.pageType])}{!m.component && ` · ${t('planned')}`}</span>
              </span>
              {i === active && <CornerDownLeft className="size-3.5 text-text-muted" aria-hidden />}
            </li>;
          })}
        </ul>
        <p className="border-t border-border-subtle bg-surface-sunken px-4 py-2 text-[11px] text-text-muted">{t('paletteHint')} · {lang === 'ko' ? '이동 시 전역 Context를 보존합니다.' : 'Global context is preserved on navigation.'}</p>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
