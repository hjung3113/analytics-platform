import type { RefObject } from 'react';
import { Maximize2, Minimize2, MoreHorizontal } from 'lucide-react';
import { useI18n } from '@ap/kernel';
import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@ap/ui';
import type { DockLayoutMenu } from '../dock/layoutMenu';
import { workspaceText } from './text';

const ICON = 'size-7';

/**
 * Header-right content of a panel group (chrome C of the board's strip, ADR-0067 decision 16): the maximize toggle and one `⋯` menu for the
 * group's active panel. `hide` is absent for the primary panel.
 */
export function WorkspaceGroupActions({ title, titleOf, menu, closeFocus, onMaximize, onSplit, onMove, onHide }: {
  title: string;
  /** A panel's title, naming each move target by its active panel. */
  titleOf: (panelId: string) => string;
  menu: DockLayoutMenu;
  /** Set by an action that moves the panel: run once the menu has closed, instead of returning focus to the `⋯` trigger (which may be gone). */
  closeFocus: RefObject<(() => void) | null>;
  onMaximize: (maximize: boolean) => void;
  onSplit: (position: 'right' | 'bottom') => void;
  onMove: (target: string) => void;
  onHide?: () => void;
}) {
  const { tx } = useI18n();
  const maximized = menu.maximized;
  const toggle = tx(maximized ? workspaceText.restore : workspaceText.maximize(title));
  const actions = tx(workspaceText.actions(title));
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
          ? <DropdownMenuItem onSelect={() => { onMaximize(false); }}>{tx(workspaceText.restore)}</DropdownMenuItem>
          : <>
            <DropdownMenuItem onSelect={() => { onMaximize(true); }}>{tx(workspaceText.maximize(title))}</DropdownMenuItem>
            {menu.split !== null && <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => { onSplit('right'); }}>{tx(workspaceText.splitRight)}</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => { onSplit('bottom'); }}>{tx(workspaceText.splitDown)}</DropdownMenuItem>
            </>}
            {menu.moves.length > 0 && <DropdownMenuSeparator />}
            {menu.moves.map(move => <DropdownMenuItem key={move.target} onSelect={() => { onMove(move.target); }}>{tx(workspaceText.moveToGroup(titleOf(move.target)))}</DropdownMenuItem>)}
            {onHide && <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={onHide}>{tx(workspaceText.hide)}</DropdownMenuItem>
            </>}
          </>}
      </DropdownMenuContent>
    </DropdownMenu>
  </div>;
}
