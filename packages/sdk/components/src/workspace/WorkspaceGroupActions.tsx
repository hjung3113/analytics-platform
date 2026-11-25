import { useContext, useId, useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { Maximize2, Minimize2, MoreHorizontal, Pin, X } from 'lucide-react';
import { useMessages } from '@ap/kernel';
import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@ap/ui';
import { DockChartCloseMore, DockChartLayoutActionsSlot, DockChartMaximizeTarget, type DockChartCloseFocus, type DockChartLayoutActions } from '../dock/DockChartHead';
import type { DockLayoutMenu } from '../dock/layoutMenu';
import { COMPONENTS_MESSAGES } from '../messages';

const ICON = 'size-7';

/**
 * Header-right content of a panel group (chrome C of the board's strip, ADR-0067 decision 16): the maximize toggle and one `⋯` menu for the
 * group's active panel. Collapse and float are absent for primary panels. Floating headers offer pin, close and keyboard geometry.
 */
export function WorkspaceGroupActions({ title, titleOf, menu, closeFocus, onMaximize, onSplit, onMove, onMoveBelow, onHide, onRemove, hideBlocked, pin, edgeActions, menuItems, onOpenSettings }: {
  onOpenSettings?: (trigger: HTMLButtonElement) => void;
  menuItems?: readonly { id: string; label: string; onSelect: () => void }[];
  title: string;
  /** A panel's title, naming each move target by its active panel. */
  titleOf: (panelId: string) => string;
  menu: DockLayoutMenu;
  /** An action can take over focus when closing its menu. The menu supplies its trigger, if still mounted. */
  closeFocus: RefObject<DockChartCloseFocus | null>;
  /** `fromMenu`: the `원래 크기로` item; the menu closes over a trigger that the layout change may replace, so the host sets `closeFocus`. */
  onMaximize: (maximize: boolean, fromMenu?: boolean) => void;
  onSplit: (position: 'right' | 'bottom') => void;
  onMove: (target: string) => void;
  /** Stack mode only, and absent when the panel already is alone in the last row. */
  onMoveBelow?: () => void;
  onHide?: () => void;
  onRemove?: () => void;
  /** The hide/delete action stays disabled and shows the reason while `PanelWorkspacePanel.keep` is set. */
  hideBlocked?: { reason: string };
  edgeActions?: {
    left?: () => void; top?: () => void; float?: () => void;
    overlay?: { pin: () => void; close: () => void; position?: (place: 'top-left' | 'center') => void; size?: (size: 'small' | 'large') => void };
  };
  /** The active panel opted into `pin` (#2398): a pressed-state pin button before the workspace actions. */
  pin?: { pinned: boolean; onToggle: () => void };
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const m = useMessages(COMPONENTS_MESSAGES);
  const maximized = menu.maximized;
  const toggle = maximized ? m('workspaceRestore') : m('workspaceMaximize', { title });
  const actions = m('workspaceActions', { title });
  const pinLabel = m('panelPin', { title });
  const hideReasonId = useId();
  const hideDescription = hideBlocked?.reason ? hideReasonId : undefined;
  const maximizeTarget = useContext(DockChartMaximizeTarget);
  const maximizeButton = !edgeActions?.overlay && <Button type="button" variant="ghost" size={maximizeTarget ? 'icon-xs' : 'icon-sm'} className={maximizeTarget ? undefined : ICON} data-workspace-maximize aria-label={toggle} title={toggle} onClick={() => { onMaximize(!maximized); }}>
    {maximized ? <Minimize2 className="size-3.5" aria-hidden /> : <Maximize2 className="size-3.5" aria-hidden />}
  </Button>;
  const layoutActionsSlot = useContext(DockChartLayoutActionsSlot);
  const separator = layoutActionsSlot ? <div aria-hidden className="my-1 border-t border-border-subtle" /> : <DropdownMenuSeparator />;
  const items = <>
    {edgeActions && <>
      {edgeActions.left && <LayoutItem onSelect={edgeActions.left}>{m('workspaceCollapseLeft')}</LayoutItem>}
      {edgeActions.top && <LayoutItem onSelect={edgeActions.top}>{m('workspaceCollapseTop')}</LayoutItem>}
      {edgeActions.float && <LayoutItem onSelect={edgeActions.float}>{m('workspaceFloat')}</LayoutItem>}
      {edgeActions.overlay?.position && <>
        {separator}
        <LayoutItem onSelect={() => { edgeActions.overlay?.position?.('top-left'); }}>{m('workspaceFloatTopLeft')}</LayoutItem>
        <LayoutItem onSelect={() => { edgeActions.overlay?.position?.('center'); }}>{m('workspaceFloatCenter')}</LayoutItem>
      </>}
      {edgeActions.overlay?.size && <>
        {separator}
        <LayoutItem onSelect={() => { edgeActions.overlay?.size?.('small'); }}>{m('workspaceFloatSmall')}</LayoutItem>
        <LayoutItem onSelect={() => { edgeActions.overlay?.size?.('large'); }}>{m('workspaceFloatLarge')}</LayoutItem>
      </>}
    </>}
    {!edgeActions?.overlay && <>
      {menu.maximized
        ? <LayoutItem onSelect={() => { onMaximize(false, true); }}>{m('workspaceRestore')}</LayoutItem>
        : <>
          <LayoutItem onSelect={() => { onMaximize(true); }}>{m('workspaceMaximize', { title })}</LayoutItem>
          {menu.split !== null && <>
            {separator}
            <LayoutItem onSelect={() => { onSplit('right'); }}>{m('workspaceSplitRight')}</LayoutItem>
            <LayoutItem onSelect={() => { onSplit('bottom'); }}>{m('workspaceSplitDown')}</LayoutItem>
          </>}
          {onMoveBelow && <>
            {menu.split === null && separator}
            <LayoutItem onSelect={onMoveBelow}>{m('workspaceMoveBelow')}</LayoutItem>
          </>}
          {menu.moves.length > 0 && separator}
          {menu.moves.map(move => <LayoutItem key={move.target} onSelect={() => { onMove(move.target); }}>{m('workspaceMoveToGroup', { title: titleOf(move.target) })}</LayoutItem>)}
          {onHide && <>
            {separator}
            {hideBlocked
              // Named by the action and described by the visible reason, as a disabled «다음 분석» item (#2862 R C4).
              ? <LayoutItem aria-label={m('workspaceHide')} aria-disabled aria-describedby={hideDescription}>
                <span className="flex min-w-0 flex-col break-keep"><span>{m('workspaceHide')}</span>{hideBlocked.reason && <span id={hideReasonId} className="text-xs text-text-muted">{hideBlocked.reason}</span>}</span>
              </LayoutItem>
              : <LayoutItem onSelect={onHide}>{m('workspaceHide')}</LayoutItem>}
            {onRemove && <LayoutItem aria-disabled={hideBlocked ? true : undefined} aria-describedby={hideDescription} onSelect={onRemove}>{m('workspaceDelete')}</LayoutItem>}
          </>}
        </>}
    </>}
    {(onOpenSettings || !!menuItems?.length) && separator}
    {onOpenSettings && <LayoutItem onSelect={() => {
      closeFocus.current = opener => { if (opener) onOpenSettings(opener); };
    }}>{m('panelSettings')}</LayoutItem>}
    {menuItems?.map(item => <LayoutItem key={item.id} onSelect={item.onSelect}>{item.label}</LayoutItem>)}
  </>;
  const takeCloseFocus = () => {
    const next = closeFocus.current;
    closeFocus.current = null;
    return next;
  };
  return <div data-workspace-group-actions className="flex shrink-0 items-center gap-1 pr-1">
    {pin && !maximized && <Button type="button" variant={pin.pinned ? 'secondary' : 'ghost'} size="icon-sm" className={ICON} data-workspace-pin aria-label={pinLabel} title={pin.pinned ? m('panelPinned', { title }) : pinLabel} aria-pressed={pin.pinned} onClick={pin.onToggle}>
      <Pin className={pin.pinned ? 'size-3.5 fill-current' : 'size-3.5'} aria-hidden />
    </Button>}
    {edgeActions?.overlay && <>
      <Button type="button" variant="ghost" size="toolbar" onClick={edgeActions.overlay.pin}>{m('workspacePinOpen')}</Button>
      <Button type="button" variant="ghost" size="icon-sm" className={ICON} aria-label={m('workspaceCollapse')} title={m('workspaceCollapse')} onClick={edgeActions.overlay.close}><X className="size-3.5" aria-hidden /></Button>
    </>}
    {maximizeTarget ? createPortal(maximizeButton, maximizeTarget) : maximizeButton}
    {layoutActionsSlot && <MergedLayoutActions register={layoutActionsSlot} takeCloseFocus={takeCloseFocus}>
      <div role="group" aria-label={m('workspaceLayout')} className="w-full border-t border-border-subtle pt-2">{items}</div>
    </MergedLayoutActions>}
    {!layoutActionsSlot && <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="icon-sm" className={ICON} ref={trigger} data-dock-group-menu aria-label={actions} title={actions}><MoreHorizontal className="size-3.5" aria-hidden /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onCloseAutoFocus={event => {
        const next = takeCloseFocus();
        if (next === null) return;
        event.preventDefault();
        next(trigger.current);
      }}>
        {items}
      </DropdownMenuContent>
    </DropdownMenu>}
  </div>;
}

function MergedLayoutActions({ register, takeCloseFocus, children }: {
  register: (actions: DockChartLayoutActions | undefined) => void;
  takeCloseFocus: DockChartLayoutActions['takeCloseFocus'];
  children: ReactNode;
}) {
  useLayoutEffect(() => () => { register(undefined); }, [register]);
  useLayoutEffect(() => { register({ content: children, takeCloseFocus }); }, [register, children, takeCloseFocus]);
  return null;
}

function LayoutItem({ onSelect, children, 'aria-label': label, 'aria-disabled': disabled, 'aria-describedby': describedBy }: {
  onSelect?: () => void;
  children: ReactNode;
  'aria-label'?: string;
  'aria-disabled'?: boolean;
  'aria-describedby'?: string | undefined;
}) {
  const closeMore = useContext(DockChartCloseMore);
  if (!closeMore) return <DropdownMenuItem aria-label={label} aria-disabled={disabled} aria-describedby={describedBy} onSelect={event => {
    if (disabled) event.preventDefault();
    else onSelect?.();
  }}>{children}</DropdownMenuItem>;
  return <Button type="button" variant="ghost" size="toolbar" className="h-auto min-h-8 w-full justify-start whitespace-normal text-start"
    aria-label={label} aria-disabled={disabled} aria-describedby={describedBy} onClick={() => {
      if (disabled) return;
      onSelect?.();
      closeMore();
    }}>{children}</Button>;
}
