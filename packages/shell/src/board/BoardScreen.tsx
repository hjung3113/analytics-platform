import { QueryBarExtensionsProvider } from '@ap/components';
import { PaneQueryDraftProvider, useEquipmentAxes } from '@ap/kernel';
import { useEffect, useLayoutEffect, useRef, useState, type ComponentType, type CSSProperties } from 'react';
import { HardDrive } from 'lucide-react';
import { BOARD_PATH, paneHref, useI18n, usePlatform, type MenuEntry, type PaneScreen } from '@ap/kernel';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, Button, cn, Popover, PopoverContent, PopoverTrigger, Toaster, ToggleGroup, ToggleGroupItem, UndoToast, toast } from '@ap/ui';
import { BoardContextBar } from './BoardContextBar';
import { BoardDock, type DockPaneProps } from './BoardDock';
import { BoardPane } from './BoardPane';
import { SheetTabs } from './SheetTabs';
import {
  BOARD_LAYOUTS, canCollapse, defaultArrangement, getArrangement, setArrangement, addPane, addSheet, applyPaneEdits, closePane, droppedPaneCount, editPane, goBackPane, indexOfPane, layoutOf, layoutShape, moveSheet, previousAt, removeSheet, renameSheet,
  resetTree, restoreClosedPane, restoreLayout, restorePane, restoreSheet, revertPaneEdits, screens, selectedIndex, selectPane, selectPaneActive, setActiveSheet, setLayout, setPane, type Board, type BoardLayout, type LayoutChange, type PaneEdit,
} from './boardModel';
import { MAX_PANES } from './boardTypes';
import { readLayoutEngine } from './layoutEngine';
import { canMountPaneScreen } from './boardMenus';
import { applyContextToSheet, copyContextToSheet, defaultQuery, firstEmptyPane, paneNumbers, paneSignals, replacementScreen } from './paneActions';
import { useBoardStore } from './boardStore';
import { GRID_GAP, PANE_HEADER_HEIGHT, PANE_BODY_MIN_HEIGHT, STACKED_PANE_MIN_HEIGHT, drawnColumns, effectiveTracks, useElementWidth, useGridHeight } from './layout';
import { PaneSplitter } from './PaneSplitter';
import { boardText, type BoardText } from './text';

const PANEL_ID = 'board-panel';
/** The Kernel's id for a pane: the sheet and the pane's slot, so moving or renumbering a pane never changes it. */
const paneIdOf = (sheetId: string, slotId: string) => `${sheetId}.${slotId}`;
const sheetHref = (id: string) => `${BOARD_PATH}?sheet=${encodeURIComponent(id)}`;

function raiseUndo(text: BoardText, message: string, onUndo: () => void) {
  toast.custom(id => <UndoToast message={message} actionLabel={text.undo} duration={8000}
    onAction={() => { onUndo(); toast.dismiss(id); }} onDismiss={() => toast.dismiss(id)} />, { duration: Infinity });
}

/**
 * The analysis board (docs/16): a platform screen at `/board?sheet=<id>`, not a Registry menu. State lives in browser storage per user;
 * the URL carries only the sheet. A pane edits its own screen through `onChange`, never the main screen's Context or last-screen record.
 * `Outlet` renders a pane's menu (the shell's `ScreenOutlet`); it is passed in so this folder does not import the outlet that mounts it.
 */
export function BoardScreen({ Outlet }: { Outlet: ComponentType }) {
  const { user, url, pathname, navigate, registry, recent, pageNavigation, canOpen } = usePlatform();
  const { lang, t } = useI18n();
  const text = boardText(lang);
  const { board, update, storageNotice } = useBoardStore(user.id, text.sheetPrefix);
  // Which renderer draws the panes is a browser setting read once per visit (`board.layoutEngine`, default grid).
  const [engine] = useState(readLayoutEngine);
  const dock = engine === 'dock';
  const heading = useRef<HTMLHeadingElement>(null);
  const [confirmLayout, setConfirmLayout] = useState<BoardLayout | null>(null);

  const requested = new URLSearchParams(url.includes('?') ? url.slice(url.indexOf('?')) : '').get('sheet');
  const matched = board.sheets.find(s => s.id === requested) ?? null;
  const sheet = matched ?? board.sheets.find(s => s.id === board.activeSheetId) ?? board.sheets[0];

  // The URL names the sheet on screen; an unknown or missing one falls back to the stored active sheet (a replace, no history entry).
  useEffect(() => {
    if (matched) { if (board.activeSheetId !== matched.id) update(b => setActiveSheet(b, matched.id)); return; }
    navigate(sheetHref(sheet.id), { replace: true });
  }, [matched, board.activeSheetId, sheet.id, update, navigate]);

  // Arriving at the board takes page-arrival focus like any screen (06 §26); the kernel left the request for it.
  useLayoutEffect(() => {
    const focus = () => { if (pageNavigation.consume(pathname)) heading.current?.focus({ preventScroll: true }); };
    focus();
    return pageNavigation.subscribe(focus);
  }, [url, pathname, pageNavigation]);

  // Undo closures write through `update`, so they must not outlive the user or the screen they were raised on.
  useEffect(() => () => { toast.dismiss(); }, [user.id]);

  // The latest committed board, for undo to check against; closures raised earlier would otherwise see the board of their own render.
  const latest = useRef(board);
  useEffect(() => { latest.current = board; });

  // A stored value this build did not use (newer version, unreadable) is said once per user, in the toast every other board message uses.
  useEffect(() => {
    if (storageNotice !== null) toast.info(storageNotice === 'newer' ? text.storageNewer : text.storageCorrupt, { id: 'board-storage-notice' });
  }, [storageNotice, user.id, text]);

  const sheetId = sheet.id;
  const layout = layoutOf(sheet);
  const paneScreens = screens(sheet);
  const onLeave = (href: string) => { navigate(href, { focus: 'page', via: 'board' }); };
  const writePane = (index: number, screen: PaneScreen | null) => update(b => setPane(b, sheetId, index, screen));
  const paneKey = (index: number) => paneIdOf(sheetId, sheet.panes[index].id);
  /** Selecting also puts the pane in front of its group in the dock renderer only: the grid reads a collapsed column's active tab as the open pane. */
  const select = (index: number) => update(b => (dock ? selectPaneActive : selectPane)(b, sheetId, index));

  /** Runs an undo only if nothing changed what it would restore (the model returns null); otherwise says so and changes nothing. */
  const undo = (restore: (b: Board) => Board | null): boolean => {
    if (restore(latest.current) === null) { toast.info(text.undoStale); return false; }
    update(b => restore(b) ?? b);
    return true;
  };
  const clearPane = (index: number) => {
    const previous = paneScreens[index];
    const slotId = sheet.panes[index].id;
    writePane(index, null);
    // The undo names the slot: a pane closed since renumbers the others, and `index` would then be another pane.
    if (previous) raiseUndo(text, text.paneCleared(index + 1), () => { undo(b => restorePane(b, sheetId, index, previous, slotId)); });
  };
  const applyLayout = (target: BoardLayout) => {
    const after = setLayout(board, sheetId, target).sheets.find(s => s.id === sheetId) ?? sheet;
    const change: LayoutChange = { sheetId, before: sheet, after, layout: target };
    const dropped = droppedPaneCount(sheet, target);
    update(b => setLayout(b, sheetId, target));
    if (dropped > 0) raiseUndo(text, text.shrunk(dropped), () => { undo(b => restoreLayout(b, change)); });
  };
  const requestLayout = (target: BoardLayout) => {
    if (target === layout) return;
    if (droppedPaneCount(sheet, target) > 0) setConfirmLayout(target); else applyLayout(target);
  };
  const deleteSheet = (id: string) => {
    const result = removeSheet(board, id, text.sheetPrefix);
    if (!result) return;
    const { removed } = result;
    update(() => result.board);
    raiseUndo(text, text.sheetDeleted(removed.sheet.name), () => {
      if (undo(b => restoreSheet(b, removed)) && removed.wasActive) navigate(sheetHref(removed.sheet.id), { replace: true });
    });
  };
  const addNewSheet = () => {
    const next = addSheet(board, text.sheetPrefix);
    if (next === board) return;
    update(() => next);
    navigate(sheetHref(next.activeSheetId));
  };
  /** Runs `edits` on this sheet (or `onSheet`) and raises an undo that restores them only while every edited pane still holds what they left. */
  const editPanes = (edits: PaneEdit[], message: string, onSheet = sheetId) => {
    update(b => applyPaneEdits(b, onSheet, edits));
    raiseUndo(text, message, () => { undo(b => revertPaneEdits(b, onSheet, edits)); });
  };
  const applyToAll = (index: number) => {
    const result = applyContextToSheet(registry, canOpen, sheet, index);
    if (!result) return;
    if (result.edits.length === 0) { toast.info(text.appliedNothing); return; }
    editPanes(result.edits, text.applied(index + 1, paneNumbers(result.edits.map(e => e.index))));
  };
  const copyContext = (targetId: string) => {
    const target = board.sheets.find(s => s.id === targetId);
    if (!target) return;
    const edits = copyContextToSheet(registry, canOpen, sheet, target);
    if (edits.length === 0) { toast.info(text.copiedNothing(target.name)); return; }
    editPanes(edits, text.copied(paneNumbers(edits.map(e => e.index)), target.name), targetId);
  };
  const replaceScreen = (index: number, menu: MenuEntry) => {
    const old = paneScreens[index];
    if (!old) return;
    editPanes([{ index, paneId: sheet.panes[index].id, before: old, after: replacementScreen(registry, canOpen, old, menu, defaultQuery(registry, recent)), fresh: true }], text.replaced(index + 1));
  };
  const duplicate = (index: number) => {
    const from = paneScreens[index];
    const to = firstEmptyPane(sheet);
    if (!from || (to === -1 && !canGrow) || !canMountPaneScreen(registry, canOpen, from)) return;
    if (to !== -1) { editPanes([{ index: to, paneId: sheet.panes[to].id, before: null, after: { ...from, params: { ...from.params } }, fresh: true }], text.duplicated(index + 1, to + 1)); return; }
    // No empty pane: the dock renderer makes a new one for the copy, and the undo takes it away again.
    const grown = addPane(board, sheetId, false);
    const slotId = grown.sheets.find(s => s.id === sheetId)!.panes[sheet.panes.length].id;
    const edit: PaneEdit = { index: sheet.panes.length, paneId: slotId, before: null, after: { ...from, params: { ...from.params } }, fresh: true };
    update(() => applyPaneEdits(grown, sheetId, [edit]));
    raiseUndo(text, text.duplicated(index + 1, edit.index + 1), () => {
      undo(b => {
        const reverted = revertPaneEdits(b, sheetId, [edit]);
        const at = reverted?.sheets.find(x => x.id === sheetId)?.panes.findIndex(p => p.id === slotId) ?? -1;
        return reverted && ((at >= 0 ? closePane(reverted, sheetId, at)?.board : null) ?? reverted);
      });
    });
  };
  const closeEmptyPane = (index: number) => {
    const result = closePane(board, sheetId, index);
    if (!result) return;
    update(b => closePane(b, sheetId, index)?.board ?? b);
    raiseUndo(text, text.paneClosed(index + 1, sheet.panes.length), () => { undo(b => restoreClosedPane(b, result.closed)); });
  };
  const openFull = (index: number) => {
    const screen = paneScreens[index];
    const menu = screen ? registry.menus.find(m => m.id === screen.menuId) : null;
    if (screen && menu) navigate(paneHref(registry, screen), { focus: 'page', via: 'board' });
  };
  // `Context 바에서 편집`: the bar row is keyed by the selected pane, so it remounts for the new one; focus its first control afterwards.
  const [editRequest, setEditRequest] = useState(0);
  const editContext = (index: number) => { select(index); setEditRequest(n => n + 1); };
  useEffect(() => {
    if (editRequest === 0) return;
    const timer = setTimeout(() => {
      document.querySelector<HTMLElement>('[data-board-context-row] button:not(:disabled), [data-board-context-row] [tabindex="0"]')?.focus({ preventScroll: true });
    }, 0);
    return () => clearTimeout(timer);
  }, [editRequest, user.id, sheetId, layout]);

  const unavailable = (index: number) => { const own = paneScreens[index]; return own !== null && !canMountPaneScreen(registry, canOpen, own); };
  const applyOff = (index: number) => (unavailable(index) ? text.paneUnavailable : applyContextToSheet(registry, canOpen, sheet, index)?.others ? null : text.applyToAllNone);
  const canGrow = dock && sheet.panes.length < MAX_PANES;
  const duplicateOff = (index: number) => (unavailable(index) ? text.paneUnavailable : emptyIndex === -1 && !canGrow ? text.noEmptyPane : null);
  const axes = useEquipmentAxes();
  const signals = paneSignals(registry, canOpen, paneScreens, text.noneValue, axes, lang, t('membershipAsOf'));
  const emptyIndex = firstEmptyPane(sheet);
  const insert = (index: number, menu: MenuEntry) => writePane(index, { menuId: menu.id, params: {}, query: defaultQuery(registry, recent) });

  const shrinkCount = confirmLayout ? droppedPaneCount(sheet, confirmLayout) : 0;
  const cancelShrink = useRef<HTMLButtonElement>(null);
  const selected = selectedIndex(sheet);
  const { rows, columns } = layoutShape(layout);
  const grid = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const guidance = useRef<HTMLElement>(null);
  const allEmpty = paneScreens.every(screen => screen === null);
  const height = useGridHeight(panel, guidance, allEmpty);
  const width = useElementWidth(grid);
  const drawn = drawnColumns(columns, width);
  const stacked = drawn !== columns;
  const arrangement = getArrangement(sheet);
  const tracks = effectiveTracks(layout, arrangement, width, height);
  const owner = `${user.id}.${sheetId}.${dock ? 'dock' : layout}`;
  const identity = `${owner}.${stacked}`;
  const [presentation, setPresentation] = useState<{ identity: string; maximized: number | null; dockMaximized: string | null }>({ identity, maximized: null, dockMaximized: null });
  // Identity changes cancel transient presentation before children commit; no outgoing focus handoff survives.
  if (presentation.identity !== identity) {
    setPresentation({ identity, maximized: null, dockMaximized: null });
    if (confirmLayout !== null) setConfirmLayout(null);
    if (editRequest !== 0) setEditRequest(0);
  }
  const maximized = presentation.identity === identity ? presentation.maximized : null;
  const dockMaximized = presentation.identity === identity ? presentation.dockMaximized : null;
  const toggleMaximize = (index: number) => {
    select(index);
    setPresentation({ identity, maximized: maximized === index ? null : index, dockMaximized: null });
  };
  /** The dock renderer's maximize is a group command; the maximized pane is the one the user is working in, so it is selected. */
  const maximizeDock = (paneId: string | null) => {
    const index = paneId === null ? -1 : indexOfPane(sheet, paneId);
    if (index >= 0) select(index);
    setPresentation({ identity, maximized: null, dockMaximized: index >= 0 ? paneId : null });
  };
  const lastGridFocus = useRef<EventTarget | null>(null);
  const focusPresentation = useRef<{ identity: string; owner: string; index: number; trigger: HTMLElement | null } | null>(null);
  useLayoutEffect(() => {
    if (dock) return;
    const previous = focusPresentation.current;
    const stackingRestore = stacked && previous?.owner === owner && previous.trigger === lastGridFocus.current
      && document.activeElement === document.body;
    const index = maximized ?? (previous?.identity === identity || stackingRestore ? previous!.index : null);
    if (index !== null) {
      const trigger = grid.current?.querySelector<HTMLElement>(`[data-pane-index="${index}"] [data-pane-maximize]`);
      if (trigger && !trigger.closest('[inert], [hidden]')) trigger.focus({ preventScroll: true });
      else {
        const pane = grid.current?.querySelector<HTMLElement>(`[data-pane-index="${index}"]`);
        if (pane && !pane.closest('[inert], [hidden]')) pane.focus({ preventScroll: true });
        else heading.current?.focus({ preventScroll: true });
      }
    }
    focusPresentation.current = maximized === null ? null : { identity, owner, index: maximized,
      trigger: grid.current?.querySelector<HTMLElement>(`[data-pane-index="${maximized}"] [data-pane-maximize]`) ?? null };
  }, [dock, maximized, identity, owner, stacked]);
  useEffect(() => {
    if (dock || maximized === null) return;
    // Radix handles Escape at document capture; React detail/consumer handlers run before window bubble.
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      setPresentation({ identity, maximized: null, dockMaximized: null });
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [dock, maximized, identity]);
  const saved = (change: Partial<typeof arrangement>) => update(b => {
    const current = b.sheets.find(s => s.id === sheetId);
    return current ? setArrangement(b, sheetId, layout, { ...getArrangement(current), ...change }) : b;
  });
  const collapse = (index: number) => saved({ collapsed: arrangement.collapsed.includes(index)
    ? arrangement.collapsed.filter(i => i !== index) : canCollapse(layout, arrangement.collapsed, index) ? [...arrangement.collapsed, index] : arrangement.collapsed });
  const stackedHeights = paneScreens.map((_, i) => PANE_HEADER_HEIGHT + (arrangement.collapsed.includes(i) ? 0 : STACKED_PANE_MIN_HEIGHT - PANE_HEADER_HEIGHT));
  const gridHeight = maximized !== null ? Math.max(height, PANE_HEADER_HEIGHT + PANE_BODY_MIN_HEIGHT)
    : stacked ? stackedHeights.reduce((a, b) => a + b, 0) + GRID_GAP * (paneScreens.length - 1) : tracks.height;
  const panePlacement = (index: number) => {
    if (maximized !== null) return { left: 0, top: 0, width: '100%', height: gridHeight };
    if (stacked) return { left: 0, width: '100%', top: stackedHeights.slice(0, index).reduce((a, b) => a + b + GRID_GAP, 0), height: stackedHeights[index] };
    const column = index % columns;
    const row = Math.floor(index / columns);
    return { left: column === 0 ? 0 : tracks.widths[0] + GRID_GAP,
      top: row === 0 ? 0 : tracks.heights[column][0] + GRID_GAP, width: tracks.widths[column], height: tracks.heights[column][row] };
  };

  /** What both renderers wire for a pane; each adds its own frame and sizing. */
  const paneProps = (index: number): DockPaneProps => ({
    paneId: paneKey(index), number: index + 1, screen: paneScreens[index], selected: index === selected, Outlet,
    signal: signals[index], hasPrevious: previousAt(sheet, index) !== null, applyAllOff: applyOff(index), duplicateOff: duplicateOff(index),
    onSelect: () => select(index), onChange: (next, how) => update(b => editPane(b, sheetId, index, next, how)), onLeave,
    onInsert: menu => insert(index, menu), onClear: () => clearPane(index), onBack: () => update(b => goBackPane(b, sheetId, index)),
    onApplyAll: () => applyToAll(index), onOpenFull: () => openFull(index), onReplace: menu => replaceScreen(index, menu),
    onDuplicate: () => duplicate(index), onEditContext: () => editContext(index),
  });

  return <div data-board className="flex h-full min-h-0 flex-col">
    <header className="flex h-[50px] shrink-0 items-center justify-between gap-3 overflow-x-auto border-b border-border-subtle bg-surface-canvas px-4">
      <div className="flex min-w-0 items-center gap-3">
        <h1 data-page-heading ref={heading} tabIndex={0} className="min-w-28 truncate text-sm font-semibold text-text-primary">{text.board}</h1>
        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" variant="ghost" size="sm" className="shrink-0" aria-haspopup="dialog">
              <HardDrive className="size-3.5 text-text-muted" aria-hidden />{text.browserOnly}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" role="dialog" aria-label={text.browserOnly} className="w-72">
            <p className="text-xs text-text-secondary">{text.storageDetails}</p>
          </PopoverContent>
        </Popover>
      </div>
      {dock ? <div className="flex shrink-0 items-center gap-2">
        {!canGrow && <span id="board-add-pane-off" className="text-tiny text-text-muted">{text.paneLimit}</span>}
        <Button type="button" variant="ghost" size="sm" disabled={!canGrow} aria-describedby={canGrow ? undefined : 'board-add-pane-off'} onClick={() => { if (dockMaximized !== null) maximizeDock(null); update(b => addPane(b, sheetId)); }}>{text.addPane}</Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => update(b => resetTree(b, sheetId))}>{text.defaultLayout}</Button>
      </div> : <div className="flex shrink-0 items-center gap-2">
      <Button type="button" variant="ghost" size="sm" onClick={() => saved(defaultArrangement(layout))}>{text.resetSize}</Button>
      <ToggleGroup type="single" appearance="filter" aria-label={text.layout} value={layout} onValueChange={value => { if (value) requestLayout(value as BoardLayout); }}>
        {BOARD_LAYOUTS.map(option => <ToggleGroupItem key={option} value={option} size="sm" appearance="selected-filter" aria-label={text.layoutOption(option)}>{option.replace('x', '×')}</ToggleGroupItem>)}
      </ToggleGroup>
      </div>}
    </header>
    <PaneQueryDraftProvider key={sheetId} screens={Object.fromEntries(paneScreens.map((screen, index) => [paneKey(index), screen]))}>
    <QueryBarExtensionsProvider>
    <BoardContextBar key={paneKey(selected)} paneId={paneKey(selected)} number={selected + 1} screen={paneScreens[selected]} onChange={(next, how) => update(b => editPane(b, sheetId, selected, next, how))} onLeave={onLeave} />
    <div ref={panel} id={PANEL_ID} role="tabpanel" aria-labelledby={`board-tab-${sheetId}`} className={cn('min-h-0 flex-1 overflow-auto p-3', dock && 'flex flex-col')}>
      {allEmpty && <section ref={guidance} aria-label={text.emptyGuidanceTitle} className="mb-3 rounded-md border border-border-subtle bg-surface-card px-4 py-3">
        <h2 className="text-sm font-semibold text-text-primary">{text.emptyGuidanceTitle}</h2>
        <p className="mt-1 text-xs text-text-secondary">{text.sheetGuidance}</p>
        <p className="text-xs text-text-secondary">{text.paneGuidance}</p>
      </section>}
      {dock ? <div className="relative min-h-(--dock-min) flex-1" style={{ '--dock-min': `${STACKED_PANE_MIN_HEIGHT}px` } as CSSProperties}>
        <div className="absolute inset-0">
          <BoardDock key={`${user.id}.${sheetId}`} sheet={sheet} update={update} paneProps={paneProps} onSelect={select} onClear={clearPane} onClosePane={closeEmptyPane}
            maximizedPaneId={dockMaximized} onMaximizedChange={maximizeDock} heading={heading} />
        </div>
      </div> : <div ref={grid} onFocusCapture={event => { lastGridFocus.current = event.target; }}
        onBlurCapture={event => { if (event.relatedTarget) lastGridFocus.current = event.relatedTarget; }} data-board-grid data-columns={drawn} data-rows={rows} style={{ '--board-height': `${gridHeight}px` } as CSSProperties} className="relative h-(--board-height)">
        {paneScreens.map((screen, index) => <BoardPane key={`${user.id}.${paneKey(index)}`} {...paneProps(index)}
          placement={panePlacement(index)} hidden={maximized !== null && maximized !== index} collapsed={arrangement.collapsed.includes(index)} maximized={maximized === index}
          sizing={paneScreens.length >= 2} canMaximize={!stacked} collapseOff={maximized !== null ? text.maximizedCollapseOff : !arrangement.collapsed.includes(index) && !canCollapse(layout, arrangement.collapsed, index) ? text.lastExpanded : null}
          onCollapse={() => collapse(index)} onMaximize={() => toggleMaximize(index)} />)}
        {!stacked && maximized === null && columns === 2 && <PaneSplitter key={`${identity}.columns`} label={text.columnSize} controls={`board-pane-${paneKey(0)}`}
          value={tracks.widths[0] / (tracks.widths[0] + tracks.widths[1]) * 100} bounds={tracks.columnBounds} extent={tracks.widths[0] + tracks.widths[1]}
          placement={{ left: tracks.widths[0], top: 0, width: GRID_GAP, height: tracks.height }} onChange={values => saved({ columns: values })} />}
        {!stacked && maximized === null && rows === 2 && Array.from({ length: columns }, (_, c) => !arrangement.collapsed.includes(c) && !arrangement.collapsed.includes(c + columns)
          ? <PaneSplitter key={`${identity}.rows.${c}`} horizontal label={text.rowSize(c + 1, c + columns + 1)} controls={`board-pane-${paneKey(c)}`}
            value={tracks.heights[c][0] / (tracks.height - GRID_GAP) * 100} bounds={tracks.rowBounds[c]} extent={tracks.height - GRID_GAP}
            placement={{ left: c === 0 ? 0 : tracks.widths[0] + GRID_GAP, top: tracks.heights[c][0], width: tracks.widths[c], height: GRID_GAP }}
            onChange={values => saved({ rows: arrangement.rows.map((r, i) => i === c ? values : r) })} /> : null)}
      </div>}
    </div>
    </QueryBarExtensionsProvider>
    </PaneQueryDraftProvider>
    <SheetTabs sheets={board.sheets} activeId={sheetId} panelId={PANEL_ID}
      onSwitch={id => { if (id !== sheetId) navigate(sheetHref(id)); }} onAdd={addNewSheet}
      onCopyContext={copyContext}
      onRename={(id, name) => update(b => renameSheet(b, id, name))} onMove={(id, to) => update(b => moveSheet(b, id, to))} onDelete={deleteSheet} />
    <AlertDialog open={confirmLayout !== null} onOpenChange={open => { if (!open) setConfirmLayout(null); }}>
      <AlertDialogContent role="alertdialog" onOpenAutoFocus={event => { event.preventDefault(); cancelShrink.current?.focus(); }}>
        <AlertDialogHeader>
          <AlertDialogTitle>{text.shrinkTitle(shrinkCount)}</AlertDialogTitle>
          <AlertDialogDescription>{text.shrinkBody}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel ref={cancelShrink} onClick={() => setConfirmLayout(null)}>{text.cancel}</AlertDialogCancel>
          <AlertDialogAction onClick={() => { const next = confirmLayout; setConfirmLayout(null); if (next) applyLayout(next); }}>{text.shrinkConfirm}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    <Toaster position="bottom-center" offset={56} />
  </div>;
}
