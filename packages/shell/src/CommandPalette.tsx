import * as Dialog from '@radix-ui/react-dialog';
import { CornerDownLeft, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { type MenuEntry, useI18n, usePlatform } from '@ap/kernel';
import type { Text } from '@ap/contracts';
import { cn } from '@ap/ui';

/** §10: menu navigation is the palette's base responsibility; entity search/action commands are Deferred. */
export function CommandPalette() {
  const { paletteOpen, setPaletteOpen, menusInSpace, accessibleSpaces, globalMenus, recent, navigate, linkTo, registry } = usePlatform();
  const { t, tx, text, lang } = useI18n();
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const platformLabel = text('palettePlatform');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPaletteOpen(!paletteOpen); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [paletteOpen, setPaletteOpen]);
  useEffect(() => { if (paletteOpen) { setQ(''); setActive(0); } }, [paletteOpen]);

  const sections = useMemo(() => {
    const rank = (id: string) => { const i = recent.findIndex(r => r.menuId === id); return i < 0 ? 99 : i; };
    const needle = q.trim().toLowerCase();
    const sort = (menus: readonly MenuEntry[]) => menus.filter(m => !m.navHidden).slice().sort((a, b) => rank(a.id) - rank(b.id));
    const matches = (m: MenuEntry, names: readonly string[]) => {
      if (!needle) return true;
      const group = registry.groupById(m.group);
      return [m.label.ko, m.label.en, ...names, group.label.ko, group.label.en].some(s => s.toLowerCase().includes(needle));
    };
    const bundles: { key: string; label: Text; items: MenuEntry[] }[] = [];
    for (const space of accessibleSpaces) {
      const items = sort(menusInSpace(space.id)).filter(m => matches(m, [space.label.ko, space.label.en]));
      if (items.length) bundles.push({ key: space.id, label: space.label, items });
    }
    const globals = sort(globalMenus).filter(m => matches(m, [platformLabel.ko, platformLabel.en]));
    if (globals.length) bundles.push({ key: 'platform', label: platformLabel, items: globals });
    return bundles;
  }, [accessibleSpaces, menusInSpace, globalMenus, recent, q, registry, platformLabel]);

  const items = sections.flatMap(section => section.items);
  const activeId = items[active]?.id;
  useEffect(() => {
    if (!activeId) return;
    document.getElementById(`palette-${activeId}`)?.scrollIntoView?.({ block: 'nearest' });
  }, [activeId]);

  const go = (index: number) => {
    const m = items[index];
    if (!m) return;
    setPaletteOpen(false);
    navigate(linkTo(m.id));
  };

  let index = 0;
  return <Dialog.Root open={paletteOpen} onOpenChange={setPaletteOpen}>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-text-primary/30" />
      <Dialog.Content aria-describedby={undefined} className="fixed left-1/2 top-[12vh] z-50 w-[min(640px,92vw)] -translate-x-1/2 overflow-hidden rounded-lg border border-border-strong bg-surface-card shadow-2xl">
        <Dialog.Title className="sr-only">{t('goTo')}</Dialog.Title>
        <div className="flex items-center gap-2 border-b border-border-subtle px-4">
          <Search className="size-4 text-text-muted" aria-hidden />
          <input autoFocus value={q} onChange={e => { setQ(e.target.value); setActive(0); }} placeholder={t('palettePlaceholder')} aria-label={t('paletteName')}
            role="combobox" aria-expanded aria-controls="palette-list" aria-activedescendant={items[active] ? `palette-${items[active].id}` : undefined}
            className="h-12 flex-1 bg-transparent text-base outline-none"
            onKeyDown={e => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(items.length - 1, a + 1)); }
              if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(0, a - 1)); }
              if (e.key === 'Enter') { e.preventDefault(); go(active); }
            }} />
        </div>
        <ul id="palette-list" role="listbox" className="max-h-[50vh] overflow-auto p-1.5">
          {items.length === 0 && <li className="px-3 py-6 text-center text-sm text-text-muted">{t('paletteEmpty')}</li>}
          {sections.map(section => {
            const headingId = `palette-heading-${section.key}`;
            return <li key={section.key} role="presentation">
              <p id={headingId} role="presentation" className="px-3 pb-1 pt-2 text-caption font-semibold text-text-muted">{tx(section.label)}</p>
              <ul role="group" aria-labelledby={headingId}>
                {section.items.map(m => {
                  const i = index++;
                  const Icon = m.icon;
                  const groupName = tx(registry.groupById(m.group).label);
                  const spaceName = tx(section.label);
                  const base = spaceName === groupName ? spaceName : `${spaceName} · ${groupName}`;
                  return <li key={m.id} id={`palette-${m.id}`} role="option" aria-selected={i === active} onMouseEnter={() => setActive(i)} onClick={() => go(i)}
                    className={cn('flex cursor-pointer items-center gap-3 rounded-md px-3 py-2', i === active && 'bg-accent-primary-soft')}>
                    <Icon className="size-4 text-text-muted" aria-hidden />
                    <span className="flex-1">
                      <span className="block text-sm font-medium">{tx(m.label)}</span>
                      <span className="block text-tiny text-text-secondary">{!m.component ? `${base} · ${t('planned')}` : base}</span>
                    </span>
                    {i === active && <CornerDownLeft className="size-3.5 text-text-muted" aria-hidden />}
                  </li>;
                })}
              </ul>
            </li>;
          })}
        </ul>
        <p className="border-t border-border-subtle bg-surface-sunken px-4 py-2 text-tiny text-text-secondary">{t('paletteHint')} · {lang === 'ko' ? '이동 시 전역 Context를 보존합니다.' : 'Global context is preserved on navigation.'}</p>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
