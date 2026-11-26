import { useContext, useId, useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { Maximize2, Minimize2, MoreHorizontal, Pin, X } from 'lucide-react';
import type { Text } from '@ap/contracts';
import { useAnalysisSelectionChips, useI18n, useMessages } from '@ap/kernel';
import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@ap/ui';
import { DockChartLayoutActionsSlot, DockChartMaximizeTarget, type DockChartCloseFocus, type DockChartLayoutActions } from '../dock/DockChartHead';
import type { DockLayoutMenu } from '../dock/layoutMenu';
import { DockMenuItem, DockMenuSeparator } from '../dock/DockMenuItem';
import { analysisSelectionChipLabel } from '../filters/analysisSelectionChipLabel';
import { COMPONENTS_MESSAGES } from '../messages';
import type { PanelWorkspaceSelectionDrop } from './PanelWorkspace';
import { useWorkspaceQueryHead, useWorkspaceQuerySlot } from './WorkspaceQueryHeads';

const ICON = 'size-7';

/**
 * Header-right content of a panel group (chrome C of the board's strip, ADR-0067 decision 16): the maximize toggle and one `⋯` menu for the
 * group's active panel. Collapse and float are absent for primary panels. Floating headers offer pin, close and keyboard geometry.
 */
export function WorkspaceGroupActions({ panelId, title, titleOf, menu, closeFocus, onMaximize, onSplit, onMove, onMoveBelow, onHide, onRemove, hideBlocked, pin, edgeActions, menuItems, recipeItem, onOpenSettings, selectionDrop }: {
  panelId?: string;
  onOpenSettings?: (trigger: HTMLButtonElement) => void;
  selectionDrop?: PanelWorkspaceSelectionDrop;
  menuItems?: readonly { id: string; label: string; onSelect: () => void }[];
  recipeItem?: { label: string; onSelect: () => void };
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
  const menuContent = useRef<HTMLDivElement>(null);
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
  const separator = <DockMenuSeparator />;
  const signal = useWorkspaceQuerySlot(panelId, 'signal');
  const items = <>
    <WorkspaceQueryMenuItems panelId={panelId} closeFocus={closeFocus} />
    {edgeActions && <>
      {edgeActions.left && <DockMenuItem onSelect={edgeActions.left}>{m('workspaceCollapseLeft')}</DockMenuItem>}
      {edgeActions.top && <DockMenuItem onSelect={edgeActions.top}>{m('workspaceCollapseTop')}</DockMenuItem>}
      {edgeActions.float && <DockMenuItem onSelect={edgeActions.float}>{m('workspaceFloat')}</DockMenuItem>}
      {edgeActions.overlay?.position && <>
        {separator}
        <DockMenuItem onSelect={() => { edgeActions.overlay?.position?.('top-left'); }}>{m('workspaceFloatTopLeft')}</DockMenuItem>
        <DockMenuItem onSelect={() => { edgeActions.overlay?.position?.('center'); }}>{m('workspaceFloatCenter')}</DockMenuItem>
      </>}
      {edgeActions.overlay?.size && <>
        {separator}
        <DockMenuItem onSelect={() => { edgeActions.overlay?.size?.('small'); }}>{m('workspaceFloatSmall')}</DockMenuItem>
        <DockMenuItem onSelect={() => { edgeActions.overlay?.size?.('large'); }}>{m('workspaceFloatLarge')}</DockMenuItem>
      </>}
    </>}
    {!edgeActions?.overlay && <>
      {menu.maximized
        ? <DockMenuItem onSelect={() => { onMaximize(false, true); }}>{m('workspaceRestore')}</DockMenuItem>
        : <>
          <DockMenuItem onSelect={() => { onMaximize(true); }}>{m('workspaceMaximize', { title })}</DockMenuItem>
          {menu.split !== null && <>
            {separator}
            <DockMenuItem onSelect={() => { onSplit('right'); }}>{m('workspaceSplitRight')}</DockMenuItem>
            <DockMenuItem onSelect={() => { onSplit('bottom'); }}>{m('workspaceSplitDown')}</DockMenuItem>
          </>}
          {onMoveBelow && <>
            {menu.split === null && separator}
            <DockMenuItem onSelect={onMoveBelow}>{m('workspaceMoveBelow')}</DockMenuItem>
          </>}
          {menu.moves.length > 0 && separator}
          {menu.moves.map(move => <DockMenuItem key={move.target} onSelect={() => { onMove(move.target); }}>{m('workspaceMoveToGroup', { title: titleOf(move.target) })}</DockMenuItem>)}
          {onHide && <>
            {separator}
            {hideBlocked
              // Named by the action and described by the visible reason, as a disabled «다음 분석» item (#2862 R C4).
              ? <DockMenuItem aria-label={m('workspaceHide')} aria-disabled aria-describedby={hideDescription}>
                <span className="flex min-w-0 flex-col break-keep"><span>{m('workspaceHide')}</span>{hideBlocked.reason && <span id={hideReasonId} className="text-xs text-text-muted">{hideBlocked.reason}</span>}</span>
              </DockMenuItem>
              : <DockMenuItem onSelect={onHide}>{m('workspaceHide')}</DockMenuItem>}
            {onRemove && <DockMenuItem aria-disabled={hideBlocked ? true : undefined} aria-describedby={hideDescription} onSelect={onRemove}>{m('workspaceDelete')}</DockMenuItem>}
          </>}
        </>}
    </>}
    {(onOpenSettings || selectionDrop || !!menuItems?.length || recipeItem) && separator}
    {onOpenSettings && <DockMenuItem onSelect={() => {
      closeFocus.current = opener => { if (opener) onOpenSettings(opener); };
    }}>{m('panelSettings')}</DockMenuItem>}
    {selectionDrop && <SelectionHoldItems drop={selectionDrop} />}
    {menuItems?.map(item => <DockMenuItem key={item.id} onSelect={item.onSelect}>{item.label}</DockMenuItem>)}
    {recipeItem && <DockMenuItem onSelect={recipeItem.onSelect}>{recipeItem.label}</DockMenuItem>}
  </>;
  const takeCloseFocus = () => {
    const next = closeFocus.current;
    closeFocus.current = null;
    return next;
  };
  // The pane trigger unmounts when a single chart merges its ⋯ into the head; focus held there passes to the merged ⋯ (#3095).
  const focusHandoff = useRef(false);
  const claimFocus = () => {
    const held = focusHandoff.current;
    focusHandoff.current = false;
    return held;
  };
  return <div data-workspace-group-actions className="flex shrink-0 items-center gap-1 pr-1">
    <div ref={signal} className="contents" />
    {pin && !maximized && <Button type="button" variant={pin.pinned ? 'secondary' : 'ghost'} size="icon-sm" className={ICON} data-workspace-pin aria-label={pinLabel} title={pin.pinned ? m('panelPinned', { title }) : pinLabel} aria-pressed={pin.pinned} onClick={pin.onToggle}>
      <Pin className={pin.pinned ? 'size-3.5 fill-current' : 'size-3.5'} aria-hidden />
    </Button>}
    {edgeActions?.overlay && <>
      <Button type="button" variant="ghost" size="toolbar" onClick={edgeActions.overlay.pin}>{m('workspacePinOpen')}</Button>
      <Button type="button" variant="ghost" size="icon-sm" className={ICON} aria-label={m('workspaceCollapse')} title={m('workspaceCollapse')} onClick={edgeActions.overlay.close}><X className="size-3.5" aria-hidden /></Button>
    </>}
    {maximizeTarget ? createPortal(maximizeButton, maximizeTarget) : maximizeButton}
    {layoutActionsSlot && <MergedLayoutActions register={layoutActionsSlot} takeCloseFocus={takeCloseFocus} claimFocus={claimFocus}>
      <div role="group" aria-label={m('workspaceLayout')} className="w-full border-t border-border-subtle pt-2">{items}</div>
    </MergedLayoutActions>}
    {!layoutActionsSlot && <DropdownMenu>
      <FocusOnUnmount trigger={trigger} menu={menuContent} held={focusHandoff} />
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="icon-sm" className={ICON} ref={trigger} data-dock-group-menu aria-label={actions} title={actions}><MoreHorizontal className="size-3.5" aria-hidden /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent ref={menuContent} align="end" onCloseAutoFocus={event => {
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

function SelectionHoldItems({ drop }: { drop: PanelWorkspaceSelectionDrop }) {
  const { chips } = useAnalysisSelectionChips();
  const { lang, tx } = useI18n();
  const m = useMessages(COMPONENTS_MESSAGES);
  if (!chips.length) {
    return <SelectionHoldItem label={m('workspaceHoldSelection')} reason={COMPONENTS_MESSAGES.workspaceNoSelectionToHold} />;
  }
  const summaries = chips.map(chip => analysisSelectionChipLabel(chip, lang));
  const names = chips.map((chip, index) => {
    const { text, source } = summaries[index]!;
    if (!summaries.some((other, i) => i !== index && other.text === text)) return text;
    const arrival = chip.arrival?.origin?.menuLabel;
    const origin = arrival && tx(arrival);
    return m('workspaceSelectionWithSource', { chip: text, source: source ?? chip.source?.panelId ?? origin ?? chip.key });
  });
  return chips.map((chip, index) => {
    const name = names[index]!;
    const distinct = names.some((other, i) => i !== index && other === name)
      ? m('workspaceSelectionWithSource', { chip: name, source: chip.key })
      : name;
    return <SelectionHoldItem key={chip.key} label={m('workspaceHoldNamedSelection', { chip: distinct })}
      reason={drop.reason?.(chip)} onSelect={() => drop.onDrop(chip)} />;
  });
}

function SelectionHoldItem({ label, reason, onSelect }: { label: string; reason?: Text; onSelect?: () => void }) {
  const { tx } = useI18n();
  const reasonId = useId();
  return <DockMenuItem aria-label={label} aria-disabled={reason ? true : undefined} aria-describedby={reason ? reasonId : undefined} onSelect={onSelect}>
    <span className="flex min-w-0 flex-col break-keep wrap-anywhere">
      <span>{label}</span>
      {reason && <span id={reasonId} className="text-xs text-text-muted">{tx(reason)}</span>}
    </span>
  </DockMenuItem>;
}

// Only this menu child subscribes, so query recovery cannot republish the chart's layout actions.
function WorkspaceQueryMenuItems({ panelId, closeFocus }: { panelId: string | undefined; closeFocus: RefObject<DockChartCloseFocus | null> }) {
  const overflow = useWorkspaceQueryHead(panelId, 'overflow');
  const extras = useWorkspaceQuerySlot(panelId, 'extras');
  return <>
    {overflow?.((label, run) => <DockMenuItem key={label} onSelect={() => {
      closeFocus.current = opener => { opener?.focus(); run(); };
    }}>{label}</DockMenuItem>)}
    <div ref={extras} className="contents" />
  </>;
}

function MergedLayoutActions({ register, takeCloseFocus, claimFocus, children }: {
  register: (actions: DockChartLayoutActions | undefined) => void;
  takeCloseFocus: DockChartLayoutActions['takeCloseFocus'];
  claimFocus: NonNullable<DockChartLayoutActions['claimFocus']>;
  children: ReactNode;
}) {
  useLayoutEffect(() => () => { register(undefined); }, [register]);
  useLayoutEffect(() => { register({ content: children, takeCloseFocus, claimFocus }); }, [register, children, takeCloseFocus, claimFocus]);
  return null;
}

/** Records whether the trigger or its open menu still held focus as they unmount; layout cleanups run before the nodes leave the document. */
function FocusOnUnmount({ trigger, menu, held }: { trigger: RefObject<HTMLElement | null>; menu: RefObject<HTMLElement | null>; held: RefObject<boolean> }) {
  useLayoutEffect(() => () => {
    const active = document.activeElement;
    held.current = !!active && (!!trigger.current?.contains(active) || !!menu.current?.contains(active));
  }, [trigger, menu, held]);
  return null;
}
