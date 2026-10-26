import { Ban } from 'lucide-react';
import { Suspense, useLayoutEffect, useRef, useState, type CSSProperties, type ComponentType, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useI18n, type MenuEntry } from '@ap/kernel';
import { PaneScreenProvider, useHostPlatform, type PaneScreen } from '@ap/kernel/host';
import { LoadingBlock, StateMessage } from '@ap/components';
import { WorkspaceCommandsHost } from '@ap/components/dock';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, Button, cn, TransientOverlayScope } from '@ap/ui';
import { admitPaneScreen } from './boardMenus';
import { PaneHeader, type DockStrip } from './PaneHeader';
import type { PaneSignal } from './paneActions';
import { PanePicker } from './PanePicker';
import { boardText } from './text';

/** Where and how the dock renderer shows a pane's head: the slot in its group's strip it is the active tab of (absent while the pane is a background tab). */
export type DockHead = {
  slot: HTMLElement;
  strip: DockStrip;
  /** The pane's group is the maximized one. */
  maximized: boolean;
  onMaximize: () => void;
  /** The layout group of the `⋯` menu. */
  menu: (afterMenuClose: RefObject<(() => void) | null>) => ReactNode;
};

export type BoardPaneProps = {
  paneId: string;
  /**
   * Dock renderer: the pane fills its dock panel (the panel owns visibility and the frame). Its head is not drawn here but in `dockHead.slot`, in the
   * strip of its tab group (the number and menu name are on the tab), and an empty pane may offer `칸 닫기`.
   */
  dock?: boolean;
  dockHead?: DockHead;
  onClosePane?: () => void;
  placement?: { left: number; top: number; width: number | string; height: number };
  hidden?: boolean;
  collapsed?: boolean;
  maximized?: boolean;
  sizing?: boolean;
  canMaximize?: boolean;
  collapseOff?: string | null;
  onCollapse?: () => void;
  onMaximize?: () => void;
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
export function BoardPane({ dock = false, dockHead, onClosePane, placement, hidden = false, collapsed = false, maximized = false, sizing = false, canMaximize = false, collapseOff = null, onCollapse, onMaximize, paneId, number, screen, selected, Outlet, signal, hasPrevious, applyAllOff, duplicateOff, onSelect, onChange, onLeave, onInsert, onClear, onBack, onApplyAll, onOpenFull, onReplace, onDuplicate, onEditContext }: BoardPaneProps) {
  const { registry } = useHostPlatform();
  const { tx, lang } = useI18n();
  const text = boardText(lang);
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
  const clear = () => { onSelect(); onClear(); root.current?.focus({ preventScroll: true }); };
  const focusHead = () => { if (root.current?.isConnected && !root.current.closest('[inert], [hidden]')) (menuTrigger.current ?? root.current).focus({ preventScroll: true }); };
  const bodyHidden = collapsed && !maximized;
  useLayoutEffect(() => {
    if (!hidden && !bodyHidden) return;
    afterMenuClose.current = null;
    picked.current = false;
    setPicking(null);
    setReplaceWith(null);
  }, [hidden, bodyHidden]);

  const headElement = <PaneHeader variant={dock ? 'dock' : 'grid'} strip={dockHead?.strip} dockMenu={dockHead?.menu} onClosePane={onClosePane} sizing={sizing} collapsed={collapsed} maximized={dock ? dockHead?.maximized : maximized} canMaximize={canMaximize} collapseOff={collapseOff}
    onCollapse={() => { onSelect(); onCollapse?.(); }} onMaximize={() => { onSelect(); (dock ? dockHead?.onMaximize : onMaximize)?.(); }} presentationHidden={hidden}
    number={number} selected={selected} systemLabel={space ? tx(space.label) : null}
    menuName={menu ? menuName : screen ? <span className="t-mono">{screen.menuId}</span> : null}
    active={screen !== null && admitted} signal={signal} hasPrevious={hasPrevious} applyAllOff={applyAllOff} duplicateOff={duplicateOff}
    menuTrigger={menuTrigger} afterMenuClose={afterMenuClose}
    onSelect={onSelect} onBack={onBack} onApplyAll={onApplyAll} onOpenFull={onOpenFull} onDuplicate={onDuplicate} onEditContext={onEditContext}
    onReplace={() => { onSelect(); picked.current = false; pickMode.current = 'replace'; setPicking('replace'); }}
    onClear={() => { afterMenuClose.current = () => root.current?.focus({ preventScroll: true }); onSelect(); onClear(); }} />;
  // The dock draws the head of the pane that is its group's active tab into that group's strip; the state it holds (an open menu, the picker) stays with the pane.
  const header = dock ? (dockHead ? createPortal(headElement, dockHead.slot) : null) : headElement;

  return <TransientOverlayScope active={!hidden}><WorkspaceCommandsHost><div ref={root} id={`board-pane-${paneId}`} data-pane-index={number - 1} data-maximized={maximized} style={placement ? { '--pane-left': `${placement.left}px`, '--pane-top': `${placement.top}px`, '--pane-width': typeof placement.width === 'number' ? `${placement.width}px` : placement.width, '--pane-height': `${placement.height}px` } as CSSProperties : undefined} hidden={hidden} inert={hidden || undefined} aria-hidden={hidden || undefined} role="group" aria-label={text.pane(number)} data-pane-id={paneId} tabIndex={-1} data-selected={selected}
    onFocus={onSelect} onPointerDownCapture={onSelect}
    className={cn('relative flex min-h-0 min-w-0 flex-col overflow-hidden bg-surface-card outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring',
      dock ? 'h-full w-full' : cn('rounded-lg border', selected ? 'border-border-selected' : 'border-border-subtle'),
      placement && 'absolute left-(--pane-left) top-(--pane-top) h-(--pane-height) w-(--pane-width)', hidden && 'hidden')}>
    {selected && <span aria-hidden data-pane-selected-bar className="absolute inset-y-0 left-0 z-10 w-0.5 bg-accent-primary" />}
    {header}
    <TransientOverlayScope active={!bodyHidden}><div data-pane-body hidden={bodyHidden} inert={bodyHidden || undefined} className="min-h-0 flex-1 overflow-auto">
      {screen === null
        ? <div className="grid h-full place-items-center p-6">
          <div className="grid justify-items-center gap-3 text-center">
            <p className="text-sm text-text-secondary">{text.emptyPane}</p>
            <Button type="button" variant="secondary" size="sm" onClick={() => { onSelect(); pickMode.current = 'insert'; setPicking('insert'); }}>{text.insertScreen}</Button>
          </div>
        </div>
        : admitted
          ? <PaneScreenProvider paneId={paneId} paneLabel={text.paneCaption(number, menuName)} screen={screen} onChange={onChange} onLeave={onLeave}>
            {/* The pane's own boundary (#915): a pane whose menu screen is still loading shows its own skeleton, instead of suspending to the
                dock's boundary and covering every pane and tab strip again. */}
            <Suspense fallback={<div className="p-4"><LoadingBlock rows={4} height={240} /></div>}><Outlet /></Suspense>
          </PaneScreenProvider>
          : <div className="p-4">
            <StateMessage tone="warning" icon={<Ban className="size-4" aria-hidden />} title={text.unavailable} body={text.unavailableBody}
              action={<Button type="button" size="sm" variant="secondary" onClick={clear}>{text.clear}</Button>} />
          </div>}
    </div></TransientOverlayScope>
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
        if (root.current?.isConnected && !root.current.closest('[inert], [hidden]')) root.current.focus({ preventScroll: true });
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
  </div></WorkspaceCommandsHost></TransientOverlayScope>;
}
