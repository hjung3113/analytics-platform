import { Ban } from 'lucide-react';
import { useRef, useState, type ComponentType } from 'react';
import { PaneScreenProvider, useI18n, usePlatform, type MenuEntry, type PaneScreen } from '@ap/kernel';
import { StateMessage } from '@ap/components';
import { Button, cn } from '@ap/ui';
import { admitPaneScreen } from './boardMenus';
import { PaneBadge } from './PaneBadge';
import { PanePicker } from './PanePicker';
import { boardText } from './text';

export type BoardPaneProps = {
  paneId: string;
  /** 1-based, the `칸 N` everyone sees. */
  number: number;
  screen: PaneScreen | null;
  selected: boolean;
  Outlet: ComponentType;
  onSelect: () => void;
  onChange: (next: PaneScreen) => void;
  onLeave: (href: string) => void;
  onInsert: (menu: MenuEntry) => void;
  onClear: () => void;
};

/**
 * One pane (docs/16 §4): the number badge, the system chip, the menu name and `비우기`, then the screen. The root is the pane's focus
 * fallback (`data-pane-id`, `tabIndex=-1`). Focus inside the pane, a press on it and any header control select it first.
 */
export function BoardPane({ paneId, number, screen, selected, Outlet, onSelect, onChange, onLeave, onInsert, onClear }: BoardPaneProps) {
  const { registry } = usePlatform();
  const { tx, lang } = useI18n();
  const text = boardText(lang);
  const root = useRef<HTMLDivElement>(null);
  const [picking, setPicking] = useState(false);
  const admitted = screen !== null && admitPaneScreen(registry, screen);
  const menu = screen === null ? null : registry.menus.find(m => m.id === screen.menuId) ?? null;
  const space = menu ? registry.spaceOf(menu) : null;
  const clear = () => { onSelect(); onClear(); root.current?.focus({ preventScroll: true }); };

  return <div ref={root} role="group" aria-label={text.pane(number)} data-pane-id={paneId} tabIndex={-1} data-selected={selected}
    onFocus={onSelect} onPointerDownCapture={onSelect}
    className={cn('relative flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border bg-surface-card outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring',
      selected ? 'border-border-selected' : 'border-border-subtle')}>
    {selected && <span aria-hidden data-pane-selected-bar className="absolute inset-y-0 left-0 z-10 w-0.5 bg-accent-primary" />}
    <div data-pane-head className={cn('flex h-10 shrink-0 items-center gap-2 border-b border-border-subtle px-2', selected ? 'bg-surface-row-selected' : 'bg-surface-card')}>
      <button type="button" aria-label={text.selectPane(number)} aria-pressed={selected} onClick={onSelect}
        className="rounded-xs focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-focus-ring">
        <PaneBadge label={text.pane(number)} selected={selected} />
      </button>
      {space && <span data-pane-system className="shrink-0 rounded-xs border border-border-subtle px-1.5 text-caption text-text-secondary">{tx(space.label)}</span>}
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-text-primary">
        {menu ? tx(menu.label) : screen ? <span className="t-mono">{screen.menuId}</span> : null}
      </span>
      {screen && admitted && <Button type="button" variant="ghost" size="toolbar" aria-label={text.clearPane(number)} onClick={clear}>{text.clear}</Button>}
    </div>
    <div className="min-h-0 flex-1 overflow-auto">
      {screen === null
        ? <div className="grid h-full place-items-center p-6">
          <div className="grid justify-items-center gap-3 text-center">
            <p className="text-sm text-text-secondary">{text.emptyPane}</p>
            <Button type="button" variant="secondary" size="sm" onClick={() => { onSelect(); setPicking(true); }}>{text.insertScreen}</Button>
          </div>
        </div>
        : admitted
          ? <PaneScreenProvider paneId={paneId} screen={screen} onChange={next => onChange(next)} onLeave={onLeave}><Outlet /></PaneScreenProvider>
          : <div className="p-4">
            <StateMessage tone="warning" icon={<Ban className="size-4" aria-hidden />} title={text.unavailable} body={text.unavailableBody}
              action={<Button type="button" size="sm" variant="secondary" onClick={clear}>{text.clear}</Button>} />
          </div>}
    </div>
    <PanePicker open={picking} paneNumber={number} onOpenChange={setPicking}
      onPick={picked => { setPicking(false); onInsert(picked); }}
      // The empty view (and its trigger) is gone once a screen is placed, so focus goes to the pane itself.
      onCloseAutoFocus={event => { event.preventDefault(); root.current?.focus({ preventScroll: true }); }} />
  </div>;
}
