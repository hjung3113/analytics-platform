import { Plus, X } from 'lucide-react';
import { useCallback, useEffect, useEffectEvent, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { DockLayout, dockLayoutMenu, movePanel, type DockPanel } from '@ap/components/dock';
import { useI18n } from '@ap/kernel';
import { useHostPlatform, type PaneScreen } from '@ap/kernel/host';
import { Button, DropdownMenuItem, DropdownMenuSeparator, useSurfacePaused } from '@ap/ui';
import { effectiveTree, fromDockTree, groupHolding, toDockTree } from './boardDockTree';
import { indexOfPane, selectedIndex, setTree, type Board, type Sheet } from './boardModel';
import { BoardPane, type BoardPaneProps } from './BoardPane';
import { PaneBadge } from './PaneBadge';
import { GRID_GAP, PANE_BODY_MIN_HEIGHT, PANE_HEADER_HEIGHT, PANE_MIN_WIDTH } from './layout';
import { boardText } from './text';

/** Below this container width every pane sits in one tab group (692px, docs/16 §4): two panes side by side at their minimum width plus the gap. */
const STACK_BELOW = 2 * PANE_MIN_WIDTH + GRID_GAP;
const MIN_PANEL_SIZE = { width: PANE_MIN_WIDTH, height: PANE_HEADER_HEIGHT + PANE_BODY_MIN_HEIGHT };

const GROUP_ADD_OFF = 'board-group-add-off';

/** What `BoardScreen` wires for every pane in both renderers; the dock adds its own frame, head slot and close. */
export type DockPaneProps = Omit<BoardPaneProps, 'dock' | 'dockHead' | 'onClosePane' | 'placement' | 'hidden' | 'collapsed' | 'maximized' | 'sizing' | 'canMaximize' | 'collapseOff' | 'onCollapse' | 'onMaximize'>;

export type BoardDockProps = {
  sheet: Sheet;
  update: (change: (board: Board) => Board) => void;
  paneProps: (index: number) => DockPaneProps;
  /** Selects the pane and fronts it in its group. */
  onSelect: (index: number) => void;
  onClear: (index: number) => void;
  onClosePane: (index: number) => void;
  maximizedPaneId: string | null;
  onMaximizedChange: (paneId: string | null) => void;
  /** `칸 추가` created this pane: focus goes to its tab once the dock shows it. A request is for one dock (the user's sheet) and is answered once. */
  newPane: { id: string } | null;
  /** The dock has taken the `newPane` request; the owner drops it so a later mount of this dock does not focus a pane added long ago. */
  onNewPaneHandled: () => void;
  heading: RefObject<HTMLHeadingElement | null>;
  /** The `+` after a group's last tab was pressed: `anchorPaneId` is the group's active pane (the stored group holding it is the target), `trigger` the button, for the focus return. */
  onAddInGroup: (anchorPaneId: string, trigger: HTMLElement) => void;
  /** The sheet has 4 panes: the `+` stays pressable and says why nothing can be added (`aria-describedby`). */
  groupAddOff: boolean;
};

/** A group's header slot for its active pane: where that pane draws its head (`BoardPane` `dockHead`). */
type HeadInfo = { slot: HTMLElement; stripWidth: number; tabs: number };

/** The empty element `renderGroupActions` draws; it reports itself (and the strip it sits in) to the dock while the pane is its group's active tab. */
function HeadSlot({ paneId, stripWidth, tabs, setHead }: { paneId: string; stripWidth: number; tabs: number; setHead: (paneId: string, head: HeadInfo | null, slot?: HTMLElement) => void }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => { if (slot) setHead(paneId, { slot, stripWidth, tabs }); }, [slot, paneId, stripWidth, tabs, setHead]);
  useLayoutEffect(() => { if (!slot) return; return () => { setHead(paneId, null, slot); }; }, [slot, paneId, setHead]);
  return <div ref={setSlot} data-pane-head-slot={paneId} className="flex h-full min-w-0 items-center" />;
}

/**
 * The dock renderer of a sheet (ADR-0067, docs/16 §4): the sheet's layout tree on a `DockLayout`, each pane a `BoardPane` in its panel. The tree
 * is the sheet's own; every change the dock reports or a group command makes goes through `setTree`, which keeps the selection on the active tab.
 */
export function BoardDock({ sheet, update, paneProps, onSelect, onClear, onClosePane, maximizedPaneId, onMaximizedChange, newPane, onNewPaneHandled, heading, onAddInGroup, groupAddOff }: BoardDockProps) {
  const { lang, tx } = useI18n();
  const { registry } = useHostPlatform();
  const text = boardText(lang);
  const wrap = useRef<HTMLDivElement>(null);
  const sheetId = sheet.id;
  const selected = selectedIndex(sheet);
  const numberOf = (paneId: string) => indexOfPane(sheet, paneId) + 1;
  const nameOf = (screen: PaneScreen | null): string | null => {
    if (screen === null) return null;
    const menu = registry.menus.find(m => m.id === screen.menuId);
    return menu ? tx(menu.label) : screen.menuId;
  };
  const tree = effectiveTree(sheet);
  const latestSelected = useRef(sheet.selectedPaneId);
  useEffect(() => { latestSelected.current = sheet.selectedPaneId; });
  const usable = (element: HTMLElement | null | undefined): element is HTMLElement => !!element && element.isConnected && !element.closest('[inert], [hidden]');
  const tabOfPane = (paneId: string) => Array.from(wrap.current?.querySelectorAll<HTMLElement>('[role="tab"][data-tab-panel-id]') ?? []).find(tab => tab.dataset.tabPanelId === paneId);
  const toggleOfPane = (paneId: string) => Array.from(wrap.current?.querySelectorAll<HTMLElement>('[data-pane-head-slot]') ?? []).find(slot => slot.dataset.paneHeadSlot === paneId)?.querySelector<HTMLElement>('[data-pane-maximize]');
  /** Focus goes to an element once the engine has laid the new tree out: the one it had may have been rebuilt or moved to another group. */
  const paused = useSurfacePaused();
  // Covering the board drops the focus hand-offs still waiting: they would otherwise land on whatever is in front.
  const pending = useRef(new Set<ReturnType<typeof setTimeout>>());
  useEffect(() => {
    if (!paused) return;
    for (const timer of pending.current) clearTimeout(timer);
    pending.current.clear();
  }, [paused]);
  const later = (run: () => void, ms: number) => {
    if (paused) return;
    const timer = setTimeout(() => { pending.current.delete(timer); run(); }, ms);
    pending.current.add(timer);
  };
  const focusSoon = (find: () => HTMLElement | null | undefined, fallback?: () => void) => {
    let tries = 0;
    const attempt = () => {
      const element = find();
      if (usable(element)) { element.focus({ preventScroll: true }); return; }
      if (++tries < 10 && wrap.current?.isConnected) later(attempt, 30); else fallback?.();
    };
    later(attempt, 0);
  };
  const focusTabSoon = (paneId: string) => { focusSoon(() => tabOfPane(paneId)); };

  // The heads of the panes that are their group's active tab, by pane: the slot each draws into and the strip it is fitted against.
  const [heads, setHeads] = useState<Record<string, HeadInfo>>({});
  const setHead = useCallback((paneId: string, head: HeadInfo | null, slot?: HTMLElement) => {
    setHeads(previous => {
      const current = previous[paneId];
      if (head === null) {
        if (!current || (slot && current.slot !== slot)) return previous;
        const { [paneId]: _gone, ...rest } = previous;
        return rest;
      }
      if (current && current.slot === head.slot && current.stripWidth === head.stripWidth && current.tabs === head.tabs) return previous;
      return { ...previous, [paneId]: head };
    });
  }, []);

  // After a maximize ends the toggle of the pane that is now the group's current one takes focus (the same button whichever way the user restored:
  // toggle, Esc, menu), else the pane, else the page heading. Below `DockLayout`'s own effect, which focuses the restored tab first and would overwrite this.
  const wasMaximized = useRef<string | null>(null);
  const settleMaximize = useEffectEvent(() => {
    const was = wasMaximized.current;
    wasMaximized.current = maximizedPaneId;
    if (was === null || maximizedPaneId !== null) return;
    // The group may have changed its active tab while it was maximized: its current pane is the selected one. Not when the selection has moved to
    // another group (`칸 추가` ended the maximize and selected the new pane there): focus stays where the user pressed.
    const current = latestSelected.current;
    if (!groupHolding(tree, was)?.panes.includes(current)) return;
    focusSoon(() => toggleOfPane(current), () => {
      const pane = Array.from(wrap.current?.querySelectorAll<HTMLElement>('[data-pane-id]') ?? []).find(item => item.dataset.paneIndex === String(numberOf(current) - 1));
      if (usable(pane)) pane.focus({ preventScroll: true }); else heading.current?.focus({ preventScroll: true });
    });
  });
  useEffect(() => { settleMaximize(); }, [maximizedPaneId]);

  // `칸 추가` made a pane: its tab takes focus (the button may have just disabled itself at the fourth). The request is answered once.
  const answerNewPane = useEffectEvent(() => {
    if (!newPane) return;
    focusTabSoon(newPane.id);
    onNewPaneHandled();
  });
  useEffect(() => { answerNewPane(); }, [newPane]);

  const maximizedHere = (paneId: string) => maximizedPaneId !== null && !!groupHolding(tree, maximizedPaneId)?.panes.includes(paneId);
  const command = (build: (dock: ReturnType<typeof toDockTree>) => ReturnType<typeof toDockTree>) => update(b => {
    const current = b.sheets.find(s => s.id === sheetId);
    if (!current) return b;
    try { return setTree(b, sheetId, fromDockTree(build(toDockTree(effectiveTree(current))))); } catch (error) {
      if (error instanceof RangeError) return b;
      throw error;
    }
  });

  /** The layout group of a pane's `칸 N 동작` menu: maximize or restore, split a tab group, move into another. A move puts focus back on the pane's tab. */
  const layoutMenu = (paneId: string) => (afterMenuClose: RefObject<(() => void) | null>) => {
    const n = numberOf(paneId);
    // Move targets are numbered by the lowest pane number of the group (a dock tree does not carry it), so the board hands the helper that order.
    const menu = dockLayoutMenu(toDockTree(tree), paneId, { maximized: maximizedHere(paneId), orderOf: group => Math.min(...group.panels.map(numberOf)) });
    if (menu.maximized) {
      return <DropdownMenuItem onSelect={() => { afterMenuClose.current = () => { focusSoon(() => toggleOfPane(paneId)); }; onMaximizedChange(null); }}>{text.restoreSize}</DropdownMenuItem>;
    }
    const move = (build: Parameters<typeof command>[0]) => { afterMenuClose.current = () => { focusTabSoon(paneId); }; command(build); };
    return <>
      <DropdownMenuItem onSelect={() => onMaximizedChange(paneId)}>{text.maximizePane(n)}</DropdownMenuItem>
      {menu.split !== null && <>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => { move(dock => movePanel(dock, paneId, { panelId: menu.split!, position: 'right' })); }}>{text.splitRight}</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => { move(dock => movePanel(dock, paneId, { panelId: menu.split!, position: 'bottom' })); }}>{text.splitDown}</DropdownMenuItem>
      </>}
      {menu.moves.length > 0 && <DropdownMenuSeparator />}
      {menu.moves.map(other => <DropdownMenuItem key={other.group.panels[0]} onSelect={() => { move(dock => movePanel(dock, paneId, { panelId: other.target, position: 'center' })); }}>{text.moveToGroup(other.order)}</DropdownMenuItem>)}
    </>;
  };

  const panels: DockPanel[] = sheet.panes.map((slot, index) => {
    const props = paneProps(index);
    const head = heads[slot.id];
    return {
      id: slot.id,
      title: text.paneTab(index + 1, nameOf(slot.screen)),
      render: () => <BoardPane {...props} dock
        dockHead={head ? { slot: head.slot, strip: { width: head.stripWidth, tabs: head.tabs }, maximized: maximizedHere(slot.id), onMaximize: () => { onMaximizedChange(maximizedHere(slot.id) ? null : slot.id); }, menu: layoutMenu(slot.id) } : undefined}
        onClosePane={slot.screen === null && sheet.panes.length > 1 ? () => {
          onClosePane(index);
          // The pane (and the menu that closed it) is gone: focus goes to the selected pane's tab.
          later(() => { tabOfPane(latestSelected.current)?.focus({ preventScroll: true }); }, 0);
        } : undefined} />,
    };
  });

  const clearFrom = (button: HTMLElement, index: number) => {
    button.closest<HTMLElement>('[role="tab"]')?.focus({ preventScroll: true });
    onSelect(index);
    onClear(index);
  };

  /** `[칸 N] 메뉴명 ✕`: the badge is the Context bar's (filled when selected), the name is cut first and the ✕ (content panes only) clears. */
  const renderTab = (paneId: string) => {
    const index = indexOfPane(sheet, paneId);
    const slot = sheet.panes[index];
    if (!slot) return paneId;
    const name = nameOf(slot.screen);
    return <span className="flex min-w-0 items-center gap-1.5" title={text.paneTab(index + 1, name)}>
      <PaneBadge label={text.pane(index + 1)} selected={index === selected} />
      <span data-dock-tab-shrinkable className="min-w-16 max-w-40 truncate">{name ?? text.emptyTabName}</span>
      {slot.screen !== null && <button type="button" tabIndex={-1} data-dock-tab-action aria-label={text.clearPane(index + 1)} title={text.clearPane(index + 1)}
        // The pointer clears on press: the press also selects the pane and the tab may be rebuilt before the release, so a click would never come.
        // A click without a press (detail 0: keyboard, assistive technology) clears too.
        onPointerDown={event => { if (event.button === 0) { event.stopPropagation(); clearFrom(event.currentTarget, index); } }}
        onClick={event => { event.stopPropagation(); if (event.detail === 0) clearFrom(event.currentTarget, index); }}
        className="grid size-4 shrink-0 place-items-center rounded-xs text-text-muted hover:bg-surface-sunken hover:text-text-primary focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-focus-ring">
        <X className="size-3" aria-hidden />
      </button>}
    </span>;
  };

  const tabA11y = (paneId: string) => {
    const index = indexOfPane(sheet, paneId);
    const slot = sheet.panes[index];
    if (!slot) return undefined;
    return { description: index === selected ? text.paneEditing : undefined, keyShortcuts: slot.screen === null ? 'Shift+F10' : 'Delete Shift+F10' };
  };

  return <div ref={wrap} data-board-dock className="h-full min-h-0">
    {groupAddOff && <span id={GROUP_ADD_OFF} className="sr-only">{text.groupAddLimit}</span>}
    <DockLayout
      panels={panels} layout={toDockTree(tree)} label={text.board}
      onLayoutChange={next => update(b => setTree(b, sheetId, fromDockTree(next)))}
      onActivate={id => { const index = indexOfPane(sheet, id); if (index >= 0) onSelect(index); }}
      onPanelDelete={id => { const index = indexOfPane(sheet, id); if (index >= 0 && sheet.panes[index].screen !== null) onClear(index); }}
      maximizedPanelId={maximizedPaneId} onMaximizedChange={onMaximizedChange}
      renderTab={renderTab}
      renderGroupTabsEnd={group => <Button type="button" variant="ghost" size="icon-sm" data-group-add={group.panels.join(' ')} aria-label={text.addInGroup} title={text.addInGroup}
        aria-describedby={groupAddOff ? GROUP_ADD_OFF : undefined} onClick={event => { onAddInGroup(group.active, event.currentTarget); }}><Plus className="size-3.5" aria-hidden /></Button>}
      renderGroupActions={(group, { stripWidth }) => <HeadSlot key={group.active} paneId={group.active} stripWidth={stripWidth} tabs={group.panels.length} setHead={setHead} />}
      separatorLabel={info => (info.dir === 'row' ? text.columnSizeBetween : text.rowSize)(numberOf(info.before[0]!), numberOf(info.after[0]!))}
      currentPanelId={sheet.selectedPaneId} tabA11y={tabA11y}
      minPanelSize={MIN_PANEL_SIZE} stackBelow={STACK_BELOW} />
  </div>;
}
