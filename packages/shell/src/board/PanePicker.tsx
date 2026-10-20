import { useMemo } from 'react';
import { useI18n, usePlatform, type MenuEntry } from '@ap/kernel';
import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@ap/ui';
import { placeableMenus } from './boardMenus';
import { boardText } from './text';

/** `분석 화면 넣기`: the board-declared menus the user can open, grouped by business system (docs/16 §4). */
export function PanePicker({ open, paneNumber, onOpenChange, onPick, onCloseAutoFocus }: {
  open: boolean; paneNumber: number; onOpenChange: (open: boolean) => void; onPick: (menu: MenuEntry) => void;
  onCloseAutoFocus: (event: Event) => void;
}) {
  const { registry, canOpen } = usePlatform();
  const { tx, lang } = useI18n();
  const text = boardText(lang);
  const groups = useMemo(() => {
    const byKey = new Map<string, { label: string; menus: MenuEntry[] }>();
    for (const menu of placeableMenus(registry, canOpen)) {
      const space = registry.spaceOf(menu);
      const key = space ? `space:${space.id}` : `group:${menu.group}`;
      const entry = byKey.get(key) ?? { label: tx(space ? space.label : registry.groupById(menu.group).label), menus: [] };
      entry.menus.push(menu);
      byKey.set(key, entry);
    }
    return [...byKey.values()];
  }, [registry, canOpen, tx]);
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent closeLabel={text.close} onCloseAutoFocus={onCloseAutoFocus} className="max-h-[80vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{text.insertTitle(paneNumber)}</DialogTitle>
        <DialogDescription>{text.insertBody}</DialogDescription>
      </DialogHeader>
      {groups.length === 0 ? <p className="text-sm text-text-secondary">{text.insertEmpty}</p>
        : groups.map(group => <section key={group.label} aria-label={group.label} className="grid gap-1">
          <h3 className="text-tiny font-semibold uppercase tracking-wide text-text-secondary">{group.label}</h3>
          <ul className="grid gap-1">
            {group.menus.map(menu => <li key={menu.id}>
              <Button type="button" variant="ghost" size="sm" className="w-full justify-start" onClick={() => onPick(menu)}>
                {tx(menu.label)}
              </Button>
            </li>)}
          </ul>
        </section>)}
    </DialogContent>
  </Dialog>;
}
