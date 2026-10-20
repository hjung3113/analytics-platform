import { useEffect, useLayoutEffect, useRef, useState, type ComponentType, type CSSProperties } from 'react';
import { HardDrive } from 'lucide-react';
import { BOARD_PATH, paneHref, useI18n, usePlatform, type MenuEntry, type PaneScreen } from '@ap/kernel';
import { cn, AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, Button, Popover, PopoverContent, PopoverTrigger, Toaster, ToggleGroup, ToggleGroupItem, UndoToast, toast } from '@ap/ui';
import { BoardContextBar } from './BoardContextBar';
import { BoardPane } from './BoardPane';
import { SheetTabs } from './SheetTabs';
import {
  BOARD_LAYOUTS, addSheet, applyPaneEdits, droppedPaneCount, editPane, goBackPane, layoutShape, moveSheet, previousAt, removeSheet, renameSheet,
  restoreLayout, restorePane, restoreSheet, revertPaneEdits, selectPane, setActiveSheet, setLayout, setPane, type Board, type BoardLayout, type LayoutChange, type PaneEdit,
} from './boardModel';
import { canMountPaneScreen } from './boardMenus';
import { applyContextToSheet, copyContextToSheet, defaultQuery, firstEmptyPane, paneNumbers, paneSignals, replacementScreen } from './paneActions';
import { useBoardStore } from './boardStore';
import { GRID_GAP_CLASS, PANE_MIN_HEIGHT, drawnColumns, useElementWidth } from './layout';
import { boardText, type BoardText } from './text';

const PANEL_ID = 'board-panel';
const paneIdOf = (sheetId: string, index: number) => `${sheetId}.${index}`;
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
  const { lang } = useI18n();
  const text = boardText(lang);
  const { board, update } = useBoardStore(user.id, text.sheetPrefix);
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

  const sheetId = sheet.id;
  const onLeave = (href: string) => { navigate(href, { focus: 'page' }); };
  const writePane = (index: number, screen: PaneScreen | null) => update(b => setPane(b, sheetId, index, screen));

  /** Runs an undo only if nothing changed what it would restore (the model returns null); otherwise says so and changes nothing. */
  const undo = (restore: (b: Board) => Board | null): boolean => {
    if (restore(latest.current) === null) { toast.info(text.undoStale); return false; }
    update(b => restore(b) ?? b);
    return true;
  };
  const clearPane = (index: number) => {
    const previous = sheet.panes[index];
    writePane(index, null);
    if (previous) raiseUndo(text, text.paneCleared(index + 1), () => { undo(b => restorePane(b, sheetId, index, previous)); });
  };
  const applyLayout = (layout: BoardLayout) => {
    const after = setLayout(board, sheetId, layout).sheets.find(s => s.id === sheetId) ?? sheet;
    const change: LayoutChange = { sheetId, before: sheet, after, layout };
    const dropped = droppedPaneCount(sheet, layout);
    update(b => setLayout(b, sheetId, layout));
    if (dropped > 0) raiseUndo(text, text.shrunk(dropped), () => { undo(b => restoreLayout(b, change)); });
  };
  const requestLayout = (layout: BoardLayout) => {
    if (layout === sheet.layout) return;
    if (droppedPaneCount(sheet, layout) > 0) setConfirmLayout(layout); else applyLayout(layout);
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
    const old = sheet.panes[index];
    if (!old) return;
    editPanes([{ index, before: old, after: replacementScreen(registry, canOpen, old, menu, defaultQuery(registry, recent)), fresh: true }], text.replaced(index + 1));
  };
  const duplicate = (index: number) => {
    const from = sheet.panes[index];
    const to = firstEmptyPane(sheet);
    if (!from || to === -1 || !canMountPaneScreen(registry, canOpen, from)) return;
    editPanes([{ index: to, before: null, after: { ...from, params: { ...from.params } }, fresh: true }], text.duplicated(index + 1, to + 1));
  };
  const openFull = (index: number) => {
    const screen = sheet.panes[index];
    const menu = screen ? registry.menus.find(m => m.id === screen.menuId) : null;
    if (screen && menu) navigate(paneHref(registry, screen), { focus: 'page' });
  };
  // `Context 바에서 편집`: the bar row is keyed by the selected pane, so it remounts for the new one; focus its first control afterwards.
  const [editRequest, setEditRequest] = useState(0);
  const editContext = (index: number) => { update(b => selectPane(b, sheetId, index)); setEditRequest(n => n + 1); };
  useEffect(() => {
    if (editRequest === 0) return;
    const timer = setTimeout(() => {
      document.querySelector<HTMLElement>('[data-board-context-row] button:not(:disabled), [data-board-context-row] [tabindex="0"]')?.focus({ preventScroll: true });
    }, 0);
    return () => clearTimeout(timer);
  }, [editRequest]);

  const unavailable = (index: number) => { const own = sheet.panes[index]; return own !== null && !canMountPaneScreen(registry, canOpen, own); };
  const applyOff = (index: number) => (unavailable(index) ? text.paneUnavailable : applyContextToSheet(registry, canOpen, sheet, index)?.others ? null : text.applyToAllNone);
  const duplicateOff = (index: number) => (unavailable(index) ? text.paneUnavailable : emptyIndex === -1 ? text.noEmptyPane : null);
  const signals = paneSignals(registry, canOpen, sheet.panes, text.noneValue);
  const emptyIndex = firstEmptyPane(sheet);
  const insert = (index: number, menu: MenuEntry) => writePane(index, { menuId: menu.id, params: {}, query: defaultQuery(registry, recent) });

  const shrinkCount = confirmLayout ? droppedPaneCount(sheet, confirmLayout) : 0;
  const cancelShrink = useRef<HTMLButtonElement>(null);
  const selected = sheet.selected;
  const { rows, columns } = layoutShape(sheet.layout);
  const grid = useRef<HTMLDivElement>(null);
  const width = useElementWidth(grid);
  const drawn = drawnColumns(columns, width);

  return <div data-board className="flex h-full min-h-0 flex-col">
    <header className="flex h-[50px] shrink-0 items-center justify-between gap-3 border-b border-border-subtle bg-surface-canvas px-4">
      <div className="flex min-w-0 items-center gap-3">
        <h1 ref={heading} tabIndex={0} className="min-w-28 truncate text-sm font-semibold text-text-primary">{text.board}</h1>
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
      <ToggleGroup type="single" appearance="filter" aria-label={text.layout} value={sheet.layout} onValueChange={value => { if (value) requestLayout(value as BoardLayout); }}>
        {BOARD_LAYOUTS.map(layout => <ToggleGroupItem key={layout} value={layout} size="sm" appearance="selected-filter" aria-label={text.layoutOption(layout)}>{layout.replace('x', '×')}</ToggleGroupItem>)}
      </ToggleGroup>
    </header>
    <BoardContextBar key={`${sheetId}.${selected}`} paneId={paneIdOf(sheetId, selected)} number={selected + 1} screen={sheet.panes[selected]} onChange={(next, how) => update(b => editPane(b, sheetId, selected, next, how))} onLeave={onLeave} />
    <div id={PANEL_ID} role="tabpanel" aria-labelledby={`board-tab-${sheetId}`} className="min-h-0 flex-1 overflow-auto p-3">
      {sheet.panes.every(screen => screen === null) && <section aria-label={text.emptyGuidanceTitle} className="mb-3 rounded-md border border-border-subtle bg-surface-card px-4 py-3">
        <h2 className="text-sm font-semibold text-text-primary">{text.emptyGuidanceTitle}</h2>
        <p className="mt-1 text-xs text-text-secondary">{text.sheetGuidance}</p>
        <p className="text-xs text-text-secondary">{text.paneGuidance}</p>
      </section>}
      <div ref={grid} data-board-grid data-columns={drawn} data-rows={rows} style={{ '--board-row': `minmax(${PANE_MIN_HEIGHT}px, 1fr)` } as CSSProperties}
        className={cn('grid min-h-full auto-rows-(--board-row)', GRID_GAP_CLASS, drawn === 1 ? 'grid-cols-1' : 'grid-cols-2')}>
        {sheet.panes.map((screen, index) => <BoardPane key={`${sheetId}.${index}`} paneId={paneIdOf(sheetId, index)} number={index + 1} screen={screen} selected={index === selected} Outlet={Outlet}
          signal={signals[index]} hasPrevious={previousAt(sheet, index) !== null}
          applyAllOff={applyOff(index)} duplicateOff={duplicateOff(index)}
          onSelect={() => update(b => selectPane(b, sheetId, index))} onChange={(next, how) => update(b => editPane(b, sheetId, index, next, how))} onLeave={onLeave}
          onInsert={menu => insert(index, menu)} onClear={() => clearPane(index)} onBack={() => update(b => goBackPane(b, sheetId, index))}
          onApplyAll={() => applyToAll(index)} onOpenFull={() => openFull(index)} onReplace={menu => replaceScreen(index, menu)}
          onDuplicate={() => duplicate(index)} onEditContext={() => editContext(index)} />)}
      </div>
    </div>
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
