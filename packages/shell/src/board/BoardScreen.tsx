import { useEffect, useLayoutEffect, useRef, useState, type ComponentType, type CSSProperties, type RefObject } from 'react';
import { HardDrive, Info } from 'lucide-react';
import { pathFor, useI18n, usePlatform, type MenuEntry, type PaneScreen, type Registry } from '@ap/kernel';
import { buildQuery, parseQuery } from '@ap/contracts';
import { cn, AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, Button, isProductionEnv, Popover, PopoverContent, PopoverTrigger, Toaster, ToggleGroup, ToggleGroupItem, UndoToast, toast } from '@ap/ui';
import { BoardContextBar } from './BoardContextBar';
import { BoardPane } from './BoardPane';
import { SheetTabs } from './SheetTabs';
import {
  BOARD_LAYOUTS, addSheet, applyPaneEdits, droppedPaneCount, editPane, goBackPane, layoutShape, moveSheet, previousOf, removeSheet, renameSheet,
  restoreLayout, restorePane, restoreSheet, revertPaneEdits, selectPane, setActiveSheet, setLayout, setPane, type Board, type BoardLayout, type LayoutChange, type PaneEdit,
} from './boardModel';
import { canMountPaneScreen } from './boardMenus';
import { applyContextToSheet, copyContextToSheet, firstEmptyPane, paneNumbers, paneSignals, replacementScreen } from './paneActions';
import { useBoardStore } from './boardStore';
import { GRID_GAP, GRID_GAP_CLASS, PANE_MIN_HEIGHT, drawnColumns, useElementWidth } from './layout';
import { boardText, type BoardText } from './text';
import { BoardPrototypeSwitcher } from './BoardPrototypeSwitcher';
import {
  boardPrototypeCopy, boardPrototypeHref, prototypeSheetName, readBoardPrototype, seedBoardPrototype, useBoardPrototypePanelHeight,
  type BoardPrototype, type BoardPrototypeQuestion, type BoardPrototypeVariant,
} from './boardPrototype';

const PANEL_ID = 'board-panel';
const paneIdOf = (sheetId: string, index: number) => `${sheetId}.${index}`;
type SplitAxis = 'columns' | 'rows';
type SplitWeights = { columns: number[]; rows: number[] };
type BoardGridVariables = { '--board-row'?: string; '--board-grid-columns'?: string; '--board-grid-rows'?: string; '--board-grid-height'?: string };
const SPLIT_PANE_PLACEMENTS = {
  narrow: ['row-start-1 col-start-1', 'row-start-3 col-start-1', 'row-start-5 col-start-1', 'row-start-7 col-start-1'],
  wide: ['row-start-1 col-start-1', 'row-start-1 col-start-3', 'row-start-3 col-start-1', 'row-start-3 col-start-3'],
} as const;

function normalizedWeights(values: number[], count: number): number[] {
  return Array.from({ length: count }, (_, index) => values[index] ?? 1);
}

function splitTrackTemplate(values: number[]): string {
  return values.flatMap((value, index) => index === values.length - 1 ? [`minmax(0, ${value}fr)`] : [`minmax(0, ${value}fr)`, `${GRID_GAP}px`]).join(' ');
}

function BoardLayoutIcon({ layout }: { layout: BoardLayout }) {
  const classes: Record<BoardLayout, string> = {
    '1x1': 'grid-cols-1 grid-rows-1', '1x2': 'grid-cols-2 grid-rows-1',
    '2x1': 'grid-cols-1 grid-rows-2', '2x2': 'grid-cols-2 grid-rows-2',
  };
  const { rows, columns } = layoutShape(layout);
  return <span aria-hidden className={cn('grid size-5 gap-0.5', classes[layout])}>
    {Array.from({ length: rows * columns }, (_, index) => <span key={index} className="rounded-xs border border-current" />)}
  </span>;
}

function BoardPrototypeSplitter({ axis, index, weights, primaryPaneId, label, collapsedLabel, onAdjust, onToggle, gridRef, trackCount }: {
  axis: SplitAxis;
  index: number;
  weights: number[];
  primaryPaneId: string;
  label: string;
  collapsedLabel: string;
  onAdjust: (axis: SplitAxis, index: number, amount: number) => void;
  onToggle: (axis: SplitAxis, index: number) => void;
  gridRef: RefObject<HTMLDivElement | null>;
  trackCount: number;
}) {
  const first = weights[index] ?? 1;
  const second = weights[index + 1] ?? 1;
  const total = first + second || 1;
  const value = Math.round(first / total * 100);
  const collapsed = first <= 0.001;
  const horizontal = axis === 'rows';
  const position = index * 2 + 2;
  return <div role="separator" tabIndex={0} aria-orientation={horizontal ? 'horizontal' : 'vertical'} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value}
    aria-valuetext={collapsed ? collapsedLabel : `${value}%`} aria-controls={primaryPaneId} aria-label={label}
    onKeyDown={event => {
      if (event.key === 'Enter') { event.preventDefault(); onToggle(axis, index); return; }
      const direction = horizontal ? (event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0)
        : (event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0);
      if (direction === 0) return;
      event.preventDefault();
      onAdjust(axis, index, direction * total * 0.05);
    }}
    onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); }}
    onPointerMove={event => {
      if (event.buttons !== 1) return;
      const size = horizontal ? gridRef.current?.clientHeight ?? 0 : gridRef.current?.clientWidth ?? 0;
      const delta = horizontal ? event.movementY : event.movementX;
      if (size > 0) onAdjust(axis, index, delta / (size / trackCount));
    }}
    style={{ '--splitter-position': position } as CSSProperties}
    className={cn('group z-20 flex touch-none select-none items-center justify-center bg-transparent hover:bg-surface-row-hover focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-focus-ring',
      horizontal ? 'row-start-(--splitter-position) [grid-column:1/-1] cursor-row-resize' : 'col-start-(--splitter-position) [grid-row:1/-1] cursor-col-resize')}>
    <span aria-hidden className={cn(horizontal ? 'h-px w-8' : 'h-8 w-px', 'bg-border-subtle group-hover:bg-accent-primary')} />
  </div>;
}

/** The Context keys (not page keys) of the screen the user saw last, as a query: the starting condition of a new pane (docs/16 §5). */
function defaultQuery(registry: Registry, recent: readonly { menuId: string; url: string }[]): string {
  const latest = recent[0];
  const at = latest?.url.indexOf('?') ?? -1;
  if (!latest || at === -1) return '';
  try {
    const pageKeys = registry.menus.find(m => m.id === latest.menuId)?.pageKeys ?? [];
    return buildQuery(parseQuery(latest.url.slice(at), pageKeys).global);
  } catch { return ''; }
}

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
  const { user, session, url, pathname, navigate, registry, recent, pageNavigation, can } = usePlatform();
  const { lang } = useI18n();
  const text = boardText(lang);
  const devPrototype = !isProductionEnv(import.meta as { env?: { PROD?: boolean } }, globalThis as { process?: { env?: { NODE_ENV?: string } } });
  const prototype = readBoardPrototype(url, devPrototype);
  const prototypeText = boardPrototypeCopy(lang);
  const { board, update } = useBoardStore(user.id, text.sheetPrefix);
  const heading = useRef<HTMLHeadingElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const panelHeight = useBoardPrototypePanelHeight(panel);
  const [confirmLayout, setConfirmLayout] = useState<BoardLayout | null>(null);
  const [splitSizes, setSplitSizes] = useState<SplitWeights>({ columns: [1, 1], rows: [1, 1, 1, 1] });
  const [maximizedPane, setMaximizedPane] = useState<number | null>(null);

  const requested = new URLSearchParams(url.includes('?') ? url.slice(url.indexOf('?') + 1) : '').get('sheet');
  const matched = board.sheets.find(s => s.id === requested) ?? null;
  const sheet = matched ?? board.sheets.find(s => s.id === board.activeSheetId) ?? board.sheets[0];

  // The URL names the sheet on screen; an unknown or missing one falls back to the stored active sheet (a replace, no history entry).
  useEffect(() => {
    if (prototype?.seed && !requested) return;
    if (matched) { if (board.activeSheetId !== matched.id) update(b => setActiveSheet(b, matched.id)); return; }
    navigate(boardPrototypeHref(sheet.id, prototype), { replace: true });
  }, [prototype?.seed, requested, matched, board.activeSheetId, sheet.id, prototype?.question, prototype?.variant, update, navigate]);

  // Seed named review sheets once through the same per-user store the board uses; never replace an existing named or non-empty sheet.
  useEffect(() => {
    if (!prototype?.seed) return;
    const seeded = seedBoardPrototype(board, registry, session.scopes[0]?.id ?? null, text.sheetPrefix);
    const target = seeded.sheets.find(item => item.name === prototypeSheetName(prototype.question));
    let next = seeded;
    if (requested && matched) next = setActiveSheet(next, matched.id);
    else if (target) next = setActiveSheet(next, target.id);
    if (next !== board) update(() => next);
    if (target && (!requested || !matched)) navigate(boardPrototypeHref(target.id, prototype), { replace: true });
  }, [prototype?.seed, prototype?.question, requested, matched, board, registry, session.scopes, text.sheetPrefix, update, navigate]);

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
      if (undo(b => restoreSheet(b, removed)) && removed.wasActive) navigate(boardPrototypeHref(removed.sheet.id, prototype), { replace: true });
    });
  };
  const addNewSheet = () => {
    const next = addSheet(board, text.sheetPrefix);
    if (next === board) return;
    update(() => next);
    navigate(boardPrototypeHref(next.activeSheetId, prototype));
  };
  /** Runs `edits` on this sheet (or `onSheet`) and raises an undo that restores them only while every edited pane still holds what they left. */
  const editPanes = (edits: PaneEdit[], message: string, onSheet = sheetId) => {
    update(b => applyPaneEdits(b, onSheet, edits));
    raiseUndo(text, message, () => { undo(b => revertPaneEdits(b, onSheet, edits)); });
  };
  const applyToAll = (index: number) => {
    const result = applyContextToSheet(registry, can, sheet, index);
    if (!result) return;
    if (result.edits.length === 0) { toast.info(text.appliedNothing); return; }
    editPanes(result.edits, text.applied(index + 1, paneNumbers(result.edits.map(e => e.index))));
  };
  const copyContext = (targetId: string) => {
    const target = board.sheets.find(s => s.id === targetId);
    if (!target) return;
    const edits = copyContextToSheet(registry, can, sheet, target);
    if (edits.length === 0) { toast.info(text.copiedNothing(target.name)); return; }
    editPanes(edits, text.copied(paneNumbers(edits.map(e => e.index)), target.name), targetId);
  };
  const replaceScreen = (index: number, menu: MenuEntry) => {
    const old = sheet.panes[index];
    if (!old) return;
    editPanes([{ index, before: old, after: replacementScreen(registry, can, old, menu, defaultQuery(registry, recent)), fresh: true }], text.replaced(index + 1));
  };
  const duplicate = (index: number) => {
    const from = sheet.panes[index];
    const to = firstEmptyPane(sheet);
    if (!from || to === -1 || !canMountPaneScreen(registry, can, from)) return;
    editPanes([{ index: to, before: null, after: { ...from, params: { ...from.params } }, fresh: true }], text.duplicated(index + 1, to + 1));
  };
  const openFull = (index: number) => {
    const screen = sheet.panes[index];
    const menu = screen ? registry.menus.find(m => m.id === screen.menuId) : null;
    if (screen && menu) navigate(pathFor(menu, screen.params) + screen.query, { focus: 'page' });
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

  const unavailable = (index: number) => { const own = sheet.panes[index]; return own !== null && !canMountPaneScreen(registry, can, own); };
  const applyOff = (index: number) => (unavailable(index) ? text.paneUnavailable : applyContextToSheet(registry, can, sheet, index)?.others ? null : text.applyToAllNone);
  const duplicateOff = (index: number) => (unavailable(index) ? text.paneUnavailable : emptyIndex === -1 ? text.noEmptyPane : null);
  const signals = paneSignals(registry, can, sheet.panes, text.noneValue);
  const emptyIndex = firstEmptyPane(sheet);
  const insert = (index: number, menu: MenuEntry) => writePane(index, { menuId: menu.id, params: {}, query: defaultQuery(registry, recent) });

  const shrinkCount = confirmLayout ? droppedPaneCount(sheet, confirmLayout) : 0;
  const cancelShrink = useRef<HTMLButtonElement>(null);
  const selected = sheet.selected;
  const { rows, columns } = layoutShape(sheet.layout);
  const grid = useRef<HTMLDivElement>(null);
  const width = useElementWidth(grid);
  const drawn = drawnColumns(columns, width);
  const visualRows = Math.ceil(sheet.panes.length / drawn);
  const question = prototype?.question;
  const variant = prototype?.variant;
  const heightQuestion = question === 'height';
  const fixedPanes = heightQuestion && (variant === 'A' || variant === 'B');
  const splitters = heightQuestion && variant === 'B';
  const naturalPanes = heightQuestion && variant === 'C';
  const emptyQuestion = question === 'empty';
  const largeEmpty = emptyQuestion && variant === 'A';
  const emptyCellHint = emptyQuestion && variant !== 'A' ? prototypeText.emptyPaneHint : undefined;
  const chipMode = question === 'chips' ? ({ A: 'priority', B: 'value', C: 'wrap' } as const)[variant!] : undefined;
  const maxIsOpen = naturalPanes && maximizedPane !== null;
  const columnWeights = normalizedWeights(splitSizes.columns, drawn);
  const rowWeights = normalizedWeights(splitSizes.rows, visualRows);
  const rowCap = visualRows > 1 ? Math.max(0, Math.floor((panelHeight - 64 - (visualRows - 1) * GRID_GAP) / (visualRows - 1))) : 0;

  useEffect(() => { setMaximizedPane(null); }, [sheetId]);
  useEffect(() => {
    if (maximizedPane === null) return;
    const restore = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (document.querySelector('[role="dialog"], [role="menu"]')) return;
      event.preventDefault();
      setMaximizedPane(null);
    };
    window.addEventListener('keydown', restore);
    return () => window.removeEventListener('keydown', restore);
  }, [maximizedPane]);

  const adjustSplit = (axis: SplitAxis, index: number, amount: number) => setSplitSizes(previous => {
    const values = normalizedWeights(previous[axis], axis === 'columns' ? drawn : visualRows);
    if (index + 1 >= values.length) return previous;
    const total = values[index] + values[index + 1];
    const first = Math.max(0, Math.min(total, values[index] + amount));
    values[index] = first;
    values[index + 1] = total - first;
    return { ...previous, [axis]: values };
  });
  const toggleSplit = (axis: SplitAxis, index: number) => setSplitSizes(previous => {
    const values = normalizedWeights(previous[axis], axis === 'columns' ? drawn : visualRows);
    if (index + 1 >= values.length) return previous;
    const total = values[index] + values[index + 1];
    const collapsed = values[index] <= 0.001;
    values[index] = collapsed ? total / 2 : 0;
    values[index + 1] = collapsed ? total / 2 : total;
    return { ...previous, [axis]: values };
  });

  const minGridHeight = visualRows * PANE_MIN_HEIGHT + (visualRows - 1) * GRID_GAP;
  let gridStyle: BoardGridVariables = { '--board-row': `minmax(${PANE_MIN_HEIGHT}px, 1fr)` };
  let gridClass = cn('grid min-h-full auto-rows-(--board-row)', GRID_GAP_CLASS, drawn === 1 ? 'grid-cols-1' : 'grid-cols-2');
  if (maxIsOpen) {
    gridStyle = { '--board-grid-columns': 'minmax(0, 1fr)', '--board-grid-rows': 'minmax(0, 1fr)' };
    gridClass = 'relative grid h-full min-h-0 [grid-template-columns:var(--board-grid-columns)] [grid-template-rows:var(--board-grid-rows)]';
  } else if (splitters) {
    gridStyle = {
      '--board-grid-columns': splitTrackTemplate(columnWeights),
      '--board-grid-rows': splitTrackTemplate(rowWeights),
      '--board-grid-height': `max(100%, ${minGridHeight}px)`,
    };
    gridClass = 'grid h-(--board-grid-height) min-h-full [grid-template-columns:var(--board-grid-columns)] [grid-template-rows:var(--board-grid-rows)]';
  } else if (fixedPanes) {
    gridStyle = {
      '--board-grid-columns': `repeat(${drawn}, minmax(0, 1fr))`,
      '--board-grid-rows': `repeat(${visualRows}, minmax(${PANE_MIN_HEIGHT}px, 1fr))`,
      '--board-grid-height': `max(100%, ${minGridHeight}px)`,
    };
    gridClass = 'grid h-(--board-grid-height) min-h-full gap-3 [grid-template-columns:var(--board-grid-columns)] [grid-template-rows:var(--board-grid-rows)]';
  } else if (naturalPanes) {
    gridStyle = {
      '--board-grid-columns': `repeat(${drawn}, minmax(0, 1fr))`,
      '--board-grid-rows': Array.from({ length: visualRows }, (_, index) => index < visualRows - 1 ? `minmax(0, ${rowCap}px)` : 'max-content').join(' '),
      '--board-grid-height': 'max-content',
    };
    gridClass = 'grid h-(--board-grid-height) gap-3 [grid-template-columns:var(--board-grid-columns)] [grid-template-rows:var(--board-grid-rows)]';
  }

  const switchPrototype = (next: BoardPrototype) => {
    const target = board.sheets.find(item => item.name === prototypeSheetName(next.question));
    navigate(boardPrototypeHref(target?.id ?? sheetId, next), { replace: true });
  };
  const chooseQuestion = (nextQuestion: BoardPrototypeQuestion) => {
    if (!prototype) return;
    switchPrototype({ ...prototype, question: nextQuestion, variant: 'A' });
  };
  const chooseVariant = (nextVariant: BoardPrototypeVariant) => {
    if (!prototype) return;
    switchPrototype({ ...prototype, variant: nextVariant });
  };

  return <div data-board data-board-prototype={prototype?.question} data-board-variant={prototype?.variant} className="flex h-full min-h-0 flex-col">
    <header className="flex h-[50px] shrink-0 items-center justify-between gap-3 border-b border-border-subtle bg-surface-canvas px-4">
      <h1 ref={heading} tabIndex={0} className="min-w-28 truncate text-sm font-semibold text-text-primary">{text.board}</h1>
      <div className="flex min-w-0 shrink-0 items-center gap-3">
        {emptyQuestion && variant === 'B' && <span role="status" className="text-xs text-text-secondary">{prototypeText.browserOnly}</span>}
        {emptyQuestion && variant === 'C' && <Popover>
          <PopoverTrigger asChild>
            <Button type="button" variant="ghost" size="sm" aria-haspopup="dialog" aria-label={prototypeText.browserOnly}>
              <HardDrive className="mr-1.5 size-3.5" aria-hidden />{prototypeText.browserOnly}<Info className="ml-1.5 size-3.5" aria-hidden />
            </Button>
          </PopoverTrigger>
          <PopoverContent role="dialog" aria-label={prototypeText.browserOnly} align="end" className="w-72">
            <p className="text-xs text-text-secondary">{prototypeText.storageDetails}</p>
          </PopoverContent>
        </Popover>}
        {!largeEmpty && <ToggleGroup type="single" appearance="filter" aria-label={text.layout} value={sheet.layout} onValueChange={value => { if (value) requestLayout(value as BoardLayout); }}>
          {BOARD_LAYOUTS.map(layout => <ToggleGroupItem key={layout} value={layout} size="sm" appearance="selected-filter" aria-label={text.layoutOption(layout)}>{layout.replace('x', '×')}</ToggleGroupItem>)}
        </ToggleGroup>}
      </div>
    </header>
    <BoardContextBar key={`${sheetId}.${selected}`} paneId={paneIdOf(sheetId, selected)} number={selected + 1} screen={sheet.panes[selected]} onChange={(next, how) => update(b => editPane(b, sheetId, selected, next, how))} onLeave={onLeave} />
    <div ref={panel} id={PANEL_ID} role="tabpanel" aria-labelledby={`board-tab-${sheetId}`} className="min-h-0 flex-1 overflow-auto p-3">
      {largeEmpty
        ? <div className="grid min-h-full content-center justify-items-center gap-4 px-4 py-8 text-center">
          <div className="grid max-w-2xl justify-items-center gap-2">
            <h2 className="text-lg font-semibold text-text-primary">{prototypeText.emptyTitle}</h2>
            <p className="text-sm text-text-secondary">{prototypeText.emptyIntro}</p>
          </div>
          <div className="grid gap-1 text-xs text-text-secondary">
            <p>{prototypeText.sheetDefinition}</p>
            <p>{prototypeText.paneDefinition}</p>
          </div>
          <p className="text-xs text-text-secondary">{prototypeText.layoutDescription}</p>
          <div className="flex flex-wrap justify-center gap-2">
            {BOARD_LAYOUTS.map(layout => <Button key={layout} type="button" variant={sheet.layout === layout ? 'primary' : 'secondary'} size="sm"
              aria-label={text.layoutOption(layout)} aria-pressed={sheet.layout === layout} onClick={() => requestLayout(layout)} className="min-w-20">
              <span className="grid justify-items-center gap-1.5"><BoardLayoutIcon layout={layout} /><span>{layout.replace('x', '×')}</span></span>
            </Button>)}
          </div>
          <p role="status" className="text-xs text-text-secondary">{prototypeText.autoSave}</p>
        </div>
        : <div ref={grid} data-board-grid data-columns={drawn} data-rows={rows} data-visual-rows={visualRows}
          style={{ '--board-row': gridStyle['--board-row'], '--board-grid-columns': gridStyle['--board-grid-columns'], '--board-grid-rows': gridStyle['--board-grid-rows'], '--board-grid-height': gridStyle['--board-grid-height'] } as CSSProperties} className={gridClass}>
          {sheet.panes.map((screen, index) => {
            const maximized = maximizedPane === index;
            const capped = naturalPanes && visualRows > 1 && Math.floor(index / drawn) < visualRows - 1;
            const contentMode = maxIsOpen ? (maximized ? 'fixed' : 'default') : fixedPanes ? 'fixed' : naturalPanes ? (capped ? 'capped' : 'natural') : 'default';
            const panePlacement = splitters && !maxIsOpen ? SPLIT_PANE_PLACEMENTS[drawn === 1 ? 'narrow' : 'wide'][index] : undefined;
            return <BoardPane key={`${sheetId}.${index}`} paneId={paneIdOf(sheetId, index)} number={index + 1} screen={screen} selected={index === selected} Outlet={Outlet}
              signal={signals[index]} hasPrevious={previousOf(sheet, index) !== null}
              applyAllOff={applyOff(index)} duplicateOff={duplicateOff(index)} contentMode={contentMode} scrollRegion={Boolean(fixedPanes)}
              emptyHint={emptyCellHint} chipMode={chipMode} maximizable={Boolean(naturalPanes)} maximized={maximized}
              hiddenForMax={Boolean(maxIsOpen && !maximized)} gridPlacement={panePlacement} maximizedOverlay={Boolean(maxIsOpen && maximized)}
              onToggleMaximize={() => setMaximizedPane(current => current === index ? null : index)}
              onSelect={() => update(b => selectPane(b, sheetId, index))} onChange={(next, how) => update(b => editPane(b, sheetId, index, next, how))} onLeave={onLeave}
              onInsert={menu => insert(index, menu)} onClear={() => clearPane(index)} onBack={() => update(b => goBackPane(b, sheetId, index))}
              onApplyAll={() => applyToAll(index)} onOpenFull={() => openFull(index)} onReplace={menu => replaceScreen(index, menu)}
              onDuplicate={() => duplicate(index)} onEditContext={() => editContext(index)} />;
          })}
          {splitters && !maxIsOpen && drawn > 1 && columnWeights.slice(0, -1).map((_, index) => <BoardPrototypeSplitter key={`column-${index}`} axis="columns" index={index} weights={columnWeights}
            primaryPaneId={paneIdOf(sheetId, index)} label={prototypeText.splitterColumn} collapsedLabel={prototypeText.collapsed} onAdjust={adjustSplit} onToggle={toggleSplit} gridRef={grid} trackCount={drawn} />)}
          {splitters && !maxIsOpen && rowWeights.slice(0, -1).map((_, index) => <BoardPrototypeSplitter key={`row-${index}`} axis="rows" index={index} weights={rowWeights}
            primaryPaneId={paneIdOf(sheetId, index * drawn)} label={prototypeText.splitterRow} collapsedLabel={prototypeText.collapsed} onAdjust={adjustSplit} onToggle={toggleSplit} gridRef={grid} trackCount={visualRows} />)}
        </div>}
    </div>
    <SheetTabs sheets={board.sheets} activeId={sheetId} panelId={PANEL_ID}
      onSwitch={id => { if (id !== sheetId) navigate(boardPrototypeHref(id, prototype)); }} onAdd={addNewSheet}
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
    {prototype && <BoardPrototypeSwitcher enabled={devPrototype} question={prototype.question} variant={prototype.variant}
      onQuestionChange={chooseQuestion} onVariantChange={chooseVariant} />}
  </div>;
}
