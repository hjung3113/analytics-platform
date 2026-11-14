import type { RefObject } from 'react';
import { Maximize2, Minimize2, MoreHorizontal } from 'lucide-react';
import { useMessages } from '@ap/kernel';
import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@ap/ui';
import type { DockLayoutMenu } from '../dock/layoutMenu';
import { COMPONENTS_MESSAGES } from '../messages';

const ICON = 'size-7';

/**
 * Header-right content of a panel group (chrome C of the board's strip, ADR-0067 decision 16): the maximize toggle and one `⋯` menu for the
 * group's active panel. `hide` is absent for the primary panel.
 */
export function WorkspaceGroupActions({ title, titleOf, menu, closeFocus, onMaximize, onSplit, onMove, onMoveBelow, onHide }: {
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
}) {
  const m = useMessages(COMPONENTS_MESSAGES);
  const maximized = menu.maximized;
  const toggle = maximized ? m('workspaceRestore') : m('workspaceMaximize', { title });
  const actions = m('workspaceActions', { title });
  return <div data-workspace-group-actions className="flex shrink-0 items-center gap-1 pr-1">
    <Button type="button" variant="ghost" size="icon-sm" className={ICON} data-workspace-maximize aria-label={toggle} title={toggle} onClick={() => { onMaximize(!maximized); }}>
      {maximized ? <Minimize2 className="size-3.5" aria-hidden /> : <Maximize2 className="size-3.5" aria-hidden />}
    </Button>
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
              <DropdownMenuItem onSelect={onHide}>{m('workspaceHide')}</DropdownMenuItem>
            </>}
          </>}
      </DropdownMenuContent>
    </DropdownMenu>
  </div>;
}
