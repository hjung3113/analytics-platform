import { MoreHorizontal, X } from 'lucide-react';
import { useEffect, useRef, type RefObject } from 'react';
import { DockLayout, movePanel, type DockPanel } from '@ap/components/dock';
import { useI18n, usePlatform, type PaneScreen } from '@ap/kernel';
import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@ap/ui';
import { effectiveTree, fromDockTree, groupHolding, groupsOf, toDockTree } from './boardDockTree';
import { indexOfPane, selectedIndex, setTree, type Board, type Sheet } from './boardModel';
import { BoardPane, type BoardPaneProps } from './BoardPane';
import { GRID_GAP, PANE_BODY_MIN_HEIGHT, PANE_HEADER_HEIGHT, PANE_MIN_WIDTH } from './layout';
import { boardText } from './text';

/** Below this container width every pane sits in one tab group (692px, docs/16 §4): two panes side by side at their minimum width plus the gap. */
const STACK_BELOW = 2 * PANE_MIN_WIDTH + GRID_GAP;
const MIN_PANEL_SIZE = { width: PANE_MIN_WIDTH, height: PANE_HEADER_HEIGHT + PANE_BODY_MIN_HEIGHT };

/** What `BoardScreen` wires for every pane in both renderers; the dock adds its own frame, head variant and close. */
export type DockPaneProps = Omit<BoardPaneProps, 'dock' | 'onClosePane' | 'placement' | 'hidden' | 'collapsed' | 'maximized' | 'sizing' | 'canMaximize' | 'collapseOff' | 'onCollapse' | 'onMaximize'>;

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
  heading: RefObject<HTMLHeadingElement | null>;
};

/**
 * The dock renderer of a sheet (ADR-0067, docs/16 §4): the sheet's layout tree on a `DockLayout`, each pane a `BoardPane` in its panel. The tree
 * is the sheet's own; every change the dock reports or a group command makes goes through `setTree`, which keeps the selection on the active tab.
 */
export function BoardDock({ sheet, update, paneProps, onSelect, onClear, onClosePane, maximizedPaneId, onMaximizedChange, heading }: BoardDockProps) {
  const { lang, tx } = useI18n();
  const { registry } = usePlatform();
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

  // After a maximize ends the group `⋯` takes focus, else the pane, else the page heading. Below `DockLayout`'s own effect, which focuses the
  // restored tab first and would overwrite this.
  const wasMaximized = useRef<string | null>(null);
  useEffect(() => {
    const was = wasMaximized.current;
    wasMaximized.current = maximizedPaneId;
    if (was === null || maximizedPaneId !== null) return;
    const usable = (element: HTMLElement | null | undefined): element is HTMLElement => !!element && element.isConnected && !element.closest('[inert], [hidden]');
    const tab = Array.from(wrap.current?.querySelectorAll<HTMLElement>('[role="tab"][data-tab-panel-id]') ?? []).find(item => item.dataset.tabPanelId === was);
    const trigger = tab?.closest('.dv-groupview')?.querySelector<HTMLElement>('[data-dock-group-menu]');
    if (usable(trigger)) { trigger.focus({ preventScroll: true }); return; }
    const pane = Array.from(wrap.current?.querySelectorAll<HTMLElement>('[data-pane-id]') ?? []).find(item => item.dataset.paneIndex === String(numberOf(was) - 1));
    if (usable(pane)) pane.focus({ preventScroll: true }); else heading.current?.focus({ preventScroll: true });
  }, [maximizedPaneId]);

  const panels: DockPanel[] = sheet.panes.map((slot, index) => {
    const props = paneProps(index);
    return {
      id: slot.id,
      title: text.paneTab(index + 1, nameOf(slot.screen)),
      render: () => <BoardPane {...props} dock onClosePane={slot.screen === null && sheet.panes.length > 1 ? () => {
        onClosePane(index);
        // The pane (and the menu that closed it) is gone: focus goes to the selected pane's tab.
        setTimeout(() => {
          Array.from(wrap.current?.querySelectorAll<HTMLElement>('[role="tab"][data-tab-panel-id]') ?? []).find(tab => tab.dataset.tabPanelId === latestSelected.current)?.focus({ preventScroll: true });
        }, 0);
      } : undefined} />,
    };
  });

  const renderTab = (paneId: string) => {
    const index = indexOfPane(sheet, paneId);
    const slot = sheet.panes[index];
    if (!slot) return paneId;
    return <span className="flex min-w-0 items-center gap-1.5">
      {index === selected && <span aria-hidden data-pane-tab-mark className="size-1.5 shrink-0 rounded-full bg-accent-primary" />}
      <span className="truncate">{text.paneTab(index + 1, nameOf(slot.screen))}</span>
      {slot.screen !== null && <button type="button" tabIndex={-1} aria-label={text.clearPane(index + 1)} title={text.clearPane(index + 1)}
        onClick={event => {
          event.stopPropagation();
          event.currentTarget.closest<HTMLElement>('[role="tab"]')?.focus({ preventScroll: true });
          onClear(index);
        }}
        className="grid size-5 shrink-0 place-items-center rounded-xs text-text-muted hover:bg-surface-sunken hover:text-text-primary focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-focus-ring">
        <X className="size-3" aria-hidden />
      </button>}
    </span>;
  };

  const command = (build: (dock: ReturnType<typeof toDockTree>) => ReturnType<typeof toDockTree>) => update(b => {
    const current = b.sheets.find(s => s.id === sheetId);
    if (!current) return b;
    try { return setTree(b, sheetId, fromDockTree(build(toDockTree(effectiveTree(current))))); } catch (error) {
      if (error instanceof RangeError) return b;
      throw error;
    }
  });

  const renderGroupActions = (group: { panels: string[]; active: string }) => {
    const mine = groupHolding(tree, group.active);
    if (!mine) return null;
    const n = numberOf(group.active);
    const restoring = maximizedPaneId !== null;
    const others = groupsOf(tree).filter(candidate => candidate !== mine);
    return <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="icon-xs" data-dock-group-menu aria-label={text.groupActions(n)} title={text.groupActions(n)}>
          <MoreHorizontal className="size-3.5" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {restoring
          ? <DropdownMenuItem onSelect={() => onMaximizedChange(null)}>{text.restoreSize}</DropdownMenuItem>
          : <DropdownMenuItem onSelect={() => onMaximizedChange(group.active)}>{text.maximizePane(n)}</DropdownMenuItem>}
        {!restoring && <>
          {mine.panes.length >= 2 && <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => { const target = mine.panes.find(id => id !== group.active)!; command(dock => movePanel(dock, group.active, { panelId: target, position: 'right' })); }}>{text.splitRight}</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => { const target = mine.panes.find(id => id !== group.active)!; command(dock => movePanel(dock, group.active, { panelId: target, position: 'bottom' })); }}>{text.splitDown}</DropdownMenuItem>
          </>}
          {others.length > 0 && <DropdownMenuSeparator />}
          {others.map(other => {
            const first = Math.min(...other.panes.map(numberOf));
            return <DropdownMenuItem key={other.panes[0]} onSelect={() => command(dock => movePanel(dock, group.active, { panelId: other.active, position: 'center' }))}>{text.moveToGroup(first)}</DropdownMenuItem>;
          })}
        </>}
      </DropdownMenuContent>
    </DropdownMenu>;
  };

  return <div ref={wrap} data-board-dock className="h-full min-h-0">
    <DockLayout
      panels={panels} layout={toDockTree(tree)} label={text.board}
      onLayoutChange={next => update(b => setTree(b, sheetId, fromDockTree(next)))}
      onActivate={id => { const index = indexOfPane(sheet, id); if (index >= 0) onSelect(index); }}
      onPanelDelete={id => { const index = indexOfPane(sheet, id); if (index >= 0 && sheet.panes[index].screen !== null) onClear(index); }}
      maximizedPanelId={maximizedPaneId} onMaximizedChange={onMaximizedChange}
      renderTab={renderTab} renderGroupActions={renderGroupActions}
      separatorLabel={info => (info.dir === 'row' ? text.columnSize : text.rowSize(numberOf(info.before[0]!), numberOf(info.after[0]!)))}
      minPanelSize={MIN_PANEL_SIZE} stackBelow={STACK_BELOW} />
  </div>;
}
