import { Ban } from 'lucide-react';
import { useRef, useState, type ComponentType } from 'react';
import { PaneScreenProvider, useI18n, usePlatform, type MenuEntry, type PaneScreen } from '@ap/kernel';
import { StateMessage } from '@ap/components';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, Button, cn } from '@ap/ui';
import { admitPaneScreen } from './boardMenus';
import { PaneHeader } from './PaneHeader';
import type { PaneSignal } from './paneActions';
import { PanePicker } from './PanePicker';
import { boardPrototypeCopy } from './boardPrototype';
import { boardText } from './text';

export type BoardPaneProps = {
  paneId: string;
  /** 1-based, the `칸 N` everyone sees. */
  number: number;
  screen: PaneScreen | null;
  selected: boolean;
  Outlet: ComponentType;
  /** This pane's Context against the other panes of its sheet; null for an empty, denied or unreadable pane. */
  signal: PaneSignal | null;
  /** The pane has an `이전 화면` to go back to. */
  hasPrevious: boolean;
  /** Why `이 조건을 시트의 모든 칸에 적용` is unavailable, or null. */
  applyAllOff: string | null;
  duplicateOff: string | null;
  contentMode?: 'default' | 'fixed' | 'natural' | 'capped';
  scrollRegion?: boolean;
  emptyHint?: string;
  chipMode?: 'priority' | 'value' | 'wrap';
  maximizable?: boolean;
  maximized?: boolean;
  hiddenForMax?: boolean;
  gridPlacement?: string;
  maximizedOverlay?: boolean;
  onToggleMaximize?: () => void;
  onSelect: () => void;
  onChange: (next: PaneScreen, how: 'push' | 'replace') => void;
  onLeave: (href: string) => void;
  onInsert: (menu: MenuEntry) => void;
  onClear: () => void;
  onBack: () => void;
  onApplyAll: () => void;
  onOpenFull: () => void;
  onReplace: (menu: MenuEntry) => void;
  onDuplicate: () => void;
  onEditContext: () => void;
};

/**
 * One pane (docs/16 §4): the head (`PaneHeader`), then the screen. The root is the pane's focus fallback (`data-pane-id`,
 * `tabIndex=-1`). Focus inside the pane, a press on it and any header control select it first. `바꾸기` chains the picker and a confirm
 * dialog off the `⋯` menu; focus ends on the `⋯` trigger (or the pane root when the trigger is gone).
 */
export function BoardPane({ paneId, number, screen, selected, Outlet, signal, hasPrevious, applyAllOff, duplicateOff, contentMode = 'default', scrollRegion, emptyHint, chipMode, maximizable, maximized, hiddenForMax, gridPlacement, maximizedOverlay, onToggleMaximize, onSelect, onChange, onLeave, onInsert, onClear, onBack, onApplyAll, onOpenFull, onReplace, onDuplicate, onEditContext }: BoardPaneProps) {
  const { registry } = usePlatform();
  const { tx, lang } = useI18n();
  const text = boardText(lang);
  const prototypeText = boardPrototypeCopy(lang);
  const root = useRef<HTMLDivElement>(null);
  const menuTrigger = useRef<HTMLButtonElement>(null);
  const afterMenuClose = useRef<(() => void) | null>(null);
  const picked = useRef(false);
  const pickMode = useRef<'insert' | 'replace'>('insert');
  const cancelReplace = useRef<HTMLButtonElement>(null);
  const [picking, setPicking] = useState<'insert' | 'replace' | null>(null);
  const [replaceWith, setReplaceWith] = useState<MenuEntry | null>(null);
  const admitted = screen !== null && admitPaneScreen(registry, screen);
  const menu = screen === null ? null : registry.menus.find(m => m.id === screen.menuId) ?? null;
  const space = menu ? registry.spaceOf(menu) : null;
  const menuName = menu ? tx(menu.label) : screen ? screen.menuId : '';
  const regionName = menu ? tx(menu.label) : screen?.menuId ?? text.emptyPane;
  const clear = () => { onSelect(); onClear(); root.current?.focus({ preventScroll: true }); };
  const focusHead = () => (menuTrigger.current ?? root.current)?.focus({ preventScroll: true });

  return <div ref={root} id={paneId} role="group" aria-label={text.pane(number)} data-pane-id={paneId} tabIndex={-1} data-selected={selected}
    hidden={hiddenForMax} aria-hidden={hiddenForMax || undefined} inert={hiddenForMax || undefined}
    onFocus={onSelect} onPointerDownCapture={onSelect}
    className={cn('relative flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border bg-surface-card outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring',
      gridPlacement, maximizedOverlay && 'absolute inset-0 z-30 h-full w-full',
      contentMode === 'natural' && 'flex-none overflow-visible',
      selected ? 'border-border-selected' : 'border-border-subtle')}>
    {selected && <span aria-hidden data-pane-selected-bar className="absolute inset-y-0 left-0 z-10 w-0.5 bg-accent-primary" />}
    <PaneHeader number={number} selected={selected} systemLabel={space ? tx(space.label) : null}
      menuName={menu ? menuName : screen ? <span className="t-mono">{screen.menuId}</span> : null}
      active={screen !== null && admitted} signal={signal} hasPrevious={hasPrevious} applyAllOff={applyAllOff} duplicateOff={duplicateOff}
      chipMode={chipMode} maximizable={maximizable} maximized={maximized} onToggleMaximize={onToggleMaximize}
      menuTrigger={menuTrigger} afterMenuClose={afterMenuClose}
      onSelect={onSelect} onBack={onBack} onApplyAll={onApplyAll} onOpenFull={onOpenFull} onDuplicate={onDuplicate} onEditContext={onEditContext}
      onReplace={() => { onSelect(); picked.current = false; pickMode.current = 'replace'; setPicking('replace'); }}
      onClear={() => { afterMenuClose.current = () => root.current?.focus({ preventScroll: true }); onSelect(); onClear(); }} />
    <div className={cn(contentMode === 'natural' ? 'flex-none overflow-visible' : 'min-h-0 flex-1 overflow-auto')}
      role={scrollRegion ? 'region' : undefined} aria-label={scrollRegion ? prototypeText.screenRegion(number, regionName) : undefined} tabIndex={scrollRegion ? 0 : undefined}>
      {screen === null
        ? <div className="grid h-full place-items-center p-6">
          <div className="grid justify-items-center gap-3 text-center">
            <p className="text-sm text-text-secondary">{text.emptyPane}</p>
            {emptyHint && <p title={emptyHint} className="max-w-56 truncate text-xs text-text-secondary">{emptyHint}</p>}
            <Button type="button" variant="secondary" size="sm" onClick={() => { onSelect(); pickMode.current = 'insert'; setPicking('insert'); }}>{text.insertScreen}</Button>
          </div>
        </div>
        : admitted
          ? <PaneScreenProvider paneId={paneId} paneLabel={text.paneCaption(number, menuName)} screen={screen} onChange={onChange} onLeave={onLeave}><Outlet /></PaneScreenProvider>
          : <div className="p-4">
            <StateMessage tone="warning" icon={<Ban className="size-4" aria-hidden />} title={text.unavailable} body={text.unavailableBody}
              action={<Button type="button" size="sm" variant="secondary" onClick={clear}>{text.clear}</Button>} />
          </div>}
    </div>
    <PanePicker open={picking !== null} paneNumber={number} onOpenChange={open => { if (!open) setPicking(null); }}
      onPick={picked_ => {
        const mode = picking;
        setPicking(null);
        if (mode === 'replace') { picked.current = true; setReplaceWith(picked_); } else onInsert(picked_);
      }}
      onCloseAutoFocus={event => {
        event.preventDefault();
        // The empty view (and its trigger) is gone once a screen is placed, so focus goes to the pane itself. A replace goes on to the
        // confirm dialog when a screen was picked, and back to the `⋯` trigger when it was cancelled.
        if (pickMode.current === 'replace') { if (!picked.current) focusHead(); return; }
        root.current?.focus({ preventScroll: true });
      }} />
    <AlertDialog open={replaceWith !== null} onOpenChange={open => { if (!open) setReplaceWith(null); }}>
      <AlertDialogContent role="alertdialog"
        onOpenAutoFocus={event => { event.preventDefault(); cancelReplace.current?.focus(); }}
        onCloseAutoFocus={event => { event.preventDefault(); focusHead(); }}>
        <AlertDialogHeader>
          <AlertDialogTitle>{text.replaceTitle(number)}</AlertDialogTitle>
          <AlertDialogDescription>{replaceWith ? text.replaceBody(menuName, tx(replaceWith.label)) : ''}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel ref={cancelReplace} onClick={() => setReplaceWith(null)}>{text.cancel}</AlertDialogCancel>
          <AlertDialogAction onClick={() => { const next = replaceWith; setReplaceWith(null); picked.current = false; if (next) onReplace(next); }}>{text.replaceConfirm}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}
