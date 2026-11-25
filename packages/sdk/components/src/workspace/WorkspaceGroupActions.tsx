import { useId, type RefObject } from 'react';
import { Maximize2, Minimize2, MoreHorizontal, Pin, X } from 'lucide-react';
import { useMessages } from '@ap/kernel';
import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@ap/ui';
import type { DockLayoutMenu } from '../dock/layoutMenu';
import { COMPONENTS_MESSAGES } from '../messages';

const ICON = 'size-7';

/**
 * Header-right content of a panel group (chrome C of the board's strip, ADR-0067 decision 16): the maximize toggle and one `⋯` menu for the
 * group's active panel. Collapse and float are absent for primary panels. Floating headers offer pin, close and keyboard geometry.
 */
export function WorkspaceGroupActions({ title, titleOf, menu, closeFocus, onMaximize, onSplit, onMove, onMoveBelow, onHide, hideBlocked, pin, edgeActions, menuItems }: {
  menuItems?: readonly { id: string; label: string; onSelect: () => void }[];
  title: string;
  /** A panel's title, naming each move target by its active panel. */
  titleOf: (panelId: string) => string;
  menu: DockLayoutMenu;
  /** Set by an action that moves the panel: run once the menu has closed, instead of returning focus to the `⋯` trigger (which may be gone). */
  closeFocus: RefObject<(() => void) | null>;
  /** `fromMenu`: the `원래 크기로` item; the menu closes over a trigger that the layout change may replace, so the host sets `closeFocus`. */
  onMaximize: (maximize: boolean, fromMenu?: boolean) => void;
  onSplit: (position: 'right' | 'bottom') => void;
  onMove: (target: string) => void;
  /** Stack mode only, and absent when the panel already is alone in the last row. */
  onMoveBelow?: () => void;
  onHide?: () => void;
  /** «숨기기» is unavailable while present (`PanelWorkspacePanel.keep`): the item stays, disabled, and shows the reason. */
  hideBlocked?: { reason: string };
  edgeActions?: {
    left?: () => void; top?: () => void; float?: () => void;
    overlay?: { pin: () => void; close: () => void; position?: (place: 'top-left' | 'center') => void; size?: (size: 'small' | 'large') => void };
  };
  /** The active panel opted into `pin` (#2398): a pressed-state pin button before the workspace actions. */
  pin?: { pinned: boolean; onToggle: () => void };
}) {
  const m = useMessages(COMPONENTS_MESSAGES);
  const maximized = menu.maximized;
  const toggle = maximized ? m('workspaceRestore') : m('workspaceMaximize', { title });
  const actions = m('workspaceActions', { title });
  const pinLabel = m('panelPin', { title });
  const hideReasonId = useId();
  return <div data-workspace-group-actions className="flex shrink-0 items-center gap-1 pr-1">
    {pin && !maximized && <Button type="button" variant={pin.pinned ? 'secondary' : 'ghost'} size="icon-sm" className={ICON} data-workspace-pin aria-label={pinLabel} title={pin.pinned ? m('panelPinned', { title }) : pinLabel} aria-pressed={pin.pinned} onClick={pin.onToggle}>
      <Pin className={pin.pinned ? 'size-3.5 fill-current' : 'size-3.5'} aria-hidden />
    </Button>}
    {edgeActions?.overlay && <>
      <Button type="button" variant="ghost" size="toolbar" onClick={edgeActions.overlay.pin}>{m('workspacePinOpen')}</Button>
      <Button type="button" variant="ghost" size="icon-sm" className={ICON} aria-label={m('workspaceCollapse')} title={m('workspaceCollapse')} onClick={edgeActions.overlay.close}><X className="size-3.5" aria-hidden /></Button>
    </>}
    {!edgeActions?.overlay && <Button type="button" variant="ghost" size="icon-sm" className={ICON} data-workspace-maximize aria-label={toggle} title={toggle} onClick={() => { onMaximize(!maximized); }}>
      {maximized ? <Minimize2 className="size-3.5" aria-hidden /> : <Maximize2 className="size-3.5" aria-hidden />}
    </Button>}
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="icon-sm" className={ICON} data-dock-group-menu aria-label={actions} title={actions}><MoreHorizontal className="size-3.5" aria-hidden /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onCloseAutoFocus={event => {
        const next = closeFocus.current;
        closeFocus.current = null;
        if (next === null) return;
        event.preventDefault();
        next();
      }}>
        {edgeActions && <>
          {edgeActions.left && <DropdownMenuItem onSelect={edgeActions.left}>{m('workspaceCollapseLeft')}</DropdownMenuItem>}
          {edgeActions.top && <DropdownMenuItem onSelect={edgeActions.top}>{m('workspaceCollapseTop')}</DropdownMenuItem>}
          {edgeActions.float && <DropdownMenuItem onSelect={edgeActions.float}>{m('workspaceFloat')}</DropdownMenuItem>}
          {edgeActions.overlay?.position && <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => { edgeActions.overlay?.position?.('top-left'); }}>{m('workspaceFloatTopLeft')}</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => { edgeActions.overlay?.position?.('center'); }}>{m('workspaceFloatCenter')}</DropdownMenuItem>
          </>}
          {edgeActions.overlay?.size && <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => { edgeActions.overlay?.size?.('small'); }}>{m('workspaceFloatSmall')}</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => { edgeActions.overlay?.size?.('large'); }}>{m('workspaceFloatLarge')}</DropdownMenuItem>
          </>}
        </>}
        {!edgeActions?.overlay && <>
        {menu.maximized
          ? <DropdownMenuItem onSelect={() => { onMaximize(false, true); }}>{m('workspaceRestore')}</DropdownMenuItem>
          : <>
            <DropdownMenuItem onSelect={() => { onMaximize(true); }}>{m('workspaceMaximize', { title })}</DropdownMenuItem>
            {menu.split !== null && <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => { onSplit('right'); }}>{m('workspaceSplitRight')}</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => { onSplit('bottom'); }}>{m('workspaceSplitDown')}</DropdownMenuItem>
            </>}
            {onMoveBelow && <>
              {menu.split === null && <DropdownMenuSeparator />}
              <DropdownMenuItem onSelect={onMoveBelow}>{m('workspaceMoveBelow')}</DropdownMenuItem>
            </>}
            {menu.moves.length > 0 && <DropdownMenuSeparator />}
            {menu.moves.map(move => <DropdownMenuItem key={move.target} onSelect={() => { onMove(move.target); }}>{m('workspaceMoveToGroup', { title: titleOf(move.target) })}</DropdownMenuItem>)}
            {onHide && <>
              <DropdownMenuSeparator />
              {hideBlocked
                // Named by the action and described by the visible reason, as a disabled «다음 분석» item (#2862 R C4).
                ? <DropdownMenuItem aria-label={m('workspaceHide')} aria-disabled aria-describedby={hideBlocked.reason ? hideReasonId : undefined} onSelect={event => { event.preventDefault(); }}>
                  <span className="flex min-w-0 flex-col"><span>{m('workspaceHide')}</span>{hideBlocked.reason && <span id={hideReasonId} className="text-xs text-text-muted">{hideBlocked.reason}</span>}</span>
                </DropdownMenuItem>
                : <DropdownMenuItem onSelect={onHide}>{m('workspaceHide')}</DropdownMenuItem>}
            </>}
          </>}
        </>}
        {!!menuItems?.length && <DropdownMenuSeparator />}
        {menuItems?.map(item => <DropdownMenuItem key={item.id} onSelect={item.onSelect}>{item.label}</DropdownMenuItem>)}
      </DropdownMenuContent>
    </DropdownMenu>
  </div>;
}
