import { QueryBarExtensionsProvider } from '@ap/components';
import { useEquipmentAxes } from '@ap/kernel';
import { PaneQueryDraftProvider } from '@ap/kernel/host';
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ComponentType, type CSSProperties } from 'react';
import { AppWindow, HardDrive, Minus, X } from 'lucide-react';
import { UNDO_WINDOW_MS, useI18n, type MenuEntry } from '@ap/kernel';
import { paneHref, useHostPlatform, type PaneScreen } from '@ap/kernel/host';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, Button, cn, Popover, PopoverContent, PopoverTrigger, SurfacePauseScope, ToggleGroup, ToggleGroupItem, TransientOverlayScope } from '@ap/ui';
import { BoardContextBar } from './BoardContextBar';
import { BoardDock, type DockPaneProps } from './BoardDock';
import { BoardPane } from './BoardPane';
import { groupHolding } from './boardDockTree';
import { SheetTabs } from './SheetTabs';
import {
  BOARD_LAYOUTS, canCollapse, defaultArrangement, getArrangement, setArrangement, addPane, addPaneInGroup, addSheet, applyPaneEdits, closePane, droppedPaneCount, editPane, goBackPane, indexOfPane, layoutOf, layoutShape, moveSheet, previousAt, removeSheet, renameSheet,
  resetTree, restoreClosedPane, restoreLayout, restorePane, restoreSheet, revertPaneEdits, screens, selectedIndex, selectPane, selectPaneActive, setLayout, setPane, type Board, type BoardLayout, type LayoutChange, type PaneEdit,
} from './boardModel';
import { MAX_PANES, MAX_TABS } from './boardTypes';
import { readLayoutEngine } from './layoutEngine';
import { canMountPaneScreen } from './boardMenus';
import { applyContextToSheet, copyContextToSheet, defaultQuery, firstEmptyPane, paneNumbers, paneSignals, replacementScreen } from './paneActions';
import { recallFocus, rememberFocus, rememberSheet } from './boardPresentation';
import { useBoardSession } from './boardSession';
import { GRID_GAP, PANE_HEADER_HEIGHT, PANE_BODY_MIN_HEIGHT, STACKED_PANE_MIN_HEIGHT, drawnColumns, effectiveTracks, useElementWidth, useGridHeight } from './layout';
import { PanePicker } from './PanePicker';
import { PaneSplitter } from './PaneSplitter';
import { boardText, type BoardText } from './text';

const PANEL_ID = 'board-panel';
/** The Kernel's id for a pane: the sheet and the pane's slot, so moving or renumbering a pane never changes it. */
const paneIdOf = (sheetId: string, slotId: string) => `${sheetId}.${slotId}`;
/** A saved group's panes as one comparable value: who is in it, not in which order its tabs sit. */
const groupKey = (panes: readonly string[]) => [...panes].sort().join('|');

/**
 * The analysis board's surface (docs/16): the sheet named by `sheetId` with its panes, sheet strip and undo notices. It never reads the address:
 * `onSheetChange` is the one command that moves to another sheet (`replace`: no history entry) and the host decides what that means.
 * State lives in the board session store per user. A pane edits its own screen through `onChange`, never the main screen's Context or last-screen record.
 * `Outlet` renders a pane's menu (the shell's `ScreenOutlet`); it is passed in so this folder does not import the outlet that mounts it.
 * `arrivalKey` changes whenever the host's address does, so a page-arrival request left for the board is taken again.
 * `visible` is false while the board is minimized but still mounted (docs/16 §4): it then takes no focus and no size, and shows the last valid
 * layout; becoming visible again re-measures and puts focus back where it was.
 * `windowed` (893d2, ADR-0091) is the board inside the floating window frame: the frame's title bar owns minimize/maximize/close (the host passes no
 * `onMinimize`/`onClose`), the board's own heading is not the page heading and the surface takes no arrival focus — the page behind is the arrival's.
 */
export function BoardSurface({ sheetId: requestedSheetId, onSheetChange, arrivalKey, Outlet, visible = true, windowed = false, onMinimize, onFloat, onClose }: {
  sheetId: string; onSheetChange: (id: string, options?: { replace?: boolean }) => void; arrivalKey: string; Outlet: ComponentType;
  /** False while the host keeps the board minimized (hidden, inert): no arrival focus, no size taken from the hidden container. */
  visible?: boolean; windowed?: boolean; onMinimize?: () => void; onFloat?: () => void; onClose?: () => void;
}) {
  const { user, pathname, navigate, registry, readRecent, pageNavigation, canOpen, toast, dismissToast } = useHostPlatform();
  const { lang, t } = useI18n();
  const text = useMemo(() => boardText(lang), [lang]);
  const { board, update, storageNotice } = useBoardSession(user.id, text.sheetPrefix);
  // Which renderer draws the panes is a browser setting read once per visit (`board.layoutEngine`, default dock). The grid holds at most four panes:
  // a board with a sheet over that (`v:3`) is drawn by the dock whatever the setting says, and says so once (ADR-0089).
  const [engine] = useState(readLayoutEngine);
  const gridBlocked = board.sheets.some(s => s.panes.length > MAX_PANES);
  // Once the dock has been drawn because of it, it stays for this mounted surface: a sheet shrinking back to four panes must not swap the renderer
  // under the surviving panes (their state would be lost). The next visit reads the setting again.
  const [dockLatched, setDockLatched] = useState(false);
  if (gridBlocked && !dockLatched) setDockLatched(true);
  const dock = engine === 'dock' || gridBlocked || dockLatched;
  const heading = useRef<HTMLHeadingElement>(null);
  const closeHint = useId();
  const [confirmLayout, setConfirmLayout] = useState<BoardLayout | null>(null);

  const sheet = board.sheets.find(s => s.id === requestedSheetId) ?? board.sheets.find(s => s.id === board.activeSheetId) ?? board.sheets[0];

  // Arriving at the board takes page-arrival focus like any screen (06 §26); the kernel left the request for it.
  // Not while minimized: the arrival then belongs to the ordinary screen that the address names.
  const arrived = useRef(false);
  useLayoutEffect(() => {
    if (!visible || windowed) { arrived.current = false; return; }
    const focus = () => { if (pageNavigation.consume(pathname)) { arrived.current = true; heading.current?.focus({ preventScroll: true }); } };
    focus();
    return pageNavigation.subscribe(focus);
  }, [arrivalKey, pathname, pageNavigation, visible, windowed]);

  // The chip names the sheet shown; the focus that was inside the visible board comes back with it (heading when that element is gone).
  useEffect(() => { rememberSheet(user.id, sheet.id, sheet.name); }, [user.id, sheet.id, sheet.name]);
  const root = useRef<HTMLDivElement>(null);
  const wasVisible = useRef(visible);
  useLayoutEffect(() => {
    const returning = visible && !wasVisible.current;
    wasVisible.current = visible;
    // A restore that is also an arrival (`분석 보드에 열기…`) keeps the arrival's title focus.
    if (!returning || arrived.current) { arrived.current = false; return; }
    const before = recallFocus(user.id);
    const usable = before !== null && before.isConnected && root.current?.contains(before) === true && !before.closest('[inert], [hidden]');
    (usable ? before : heading.current)?.focus({ preventScroll: true });
  }, [visible, user.id]);

  // Undo closures write through `update`, so they must not outlive the user or the screen they were raised on.
  const raised = useRef(new Set<number>());
  const notifyRef = useRef<(message: string) => void>(() => {});
  const storageSaid = useRef<string | null>(null);
  const gridSaid = useRef<string | null>(null);
  // The once-markers reset with the toasts they stand for: a re-mount (StrictMode's probe included) says its notices again.
  useEffect(() => () => { for (const id of raised.current) dismissToast(id); raised.current.clear(); storageSaid.current = null; gridSaid.current = null; }, [user.id, dismissToast]);
  // Minimizing does not unmount, so its notices end here: an undo offered on a covered board would write to it unseen (docs/16 §4).
  useEffect(() => {
    if (visible) return;
    for (const id of raised.current) dismissToast(id);
    raised.current.clear();
  }, [visible, dismissToast]);
  /** Board notices go through the shell toast stack; the ids are kept so leaving the board or the user dismisses them. A covered board raises none. */
  const notify = (message: string, onUndo?: () => void) => {
    if (!visible) return;
    const id = onUndo
      ? toast(message, 'info', undefined, { action: { label: text.undo, onAction: onUndo }, durationMs: UNDO_WINDOW_MS })
      : toast(message);
    raised.current.add(id);
  };
  notifyRef.current = message => notify(message);
  const raiseUndo = (message: string, onUndo: () => void) => notify(message, onUndo);

  // The latest committed board, for undo to check against; closures raised earlier would otherwise see the board of their own render.
  const latest = useRef(board);
  useEffect(() => { latest.current = board; });

  // A stored value this build did not use (newer version, unreadable) is said once per user, in the toast every other board message uses.
  // Keyed by user and condition, not by the translated copy: a language switch must not raise it again (#886).
  useEffect(() => {
    const key = storageNotice === null ? null : `${user.id}:${storageNotice}`;
    // A covered board says nothing yet; it is said, once, when it is shown.
    if (key === null || storageSaid.current === key || !visible) return;
    storageSaid.current = key;
    notifyRef.current(storageNotice === 'newer' ? text.storageNewer : text.storageCorrupt);
  }, [storageNotice, user.id, text, visible]);

  // Said once per user, in the board's toast; a covered board says it when shown.
  useEffect(() => {
    if (engine !== 'grid' || !gridBlocked || !visible || gridSaid.current === user.id) return;
    gridSaid.current = user.id;
    notifyRef.current(text.gridNeedsDock);
  }, [engine, gridBlocked, visible, user.id, text]);

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
    if (restore(latest.current) === null) { notify(text.undoStale); return false; }
    update(b => restore(b) ?? b);
    return true;
  };
  const clearPane = (index: number) => {
    const previous = paneScreens[index];
    const slotId = sheet.panes[index].id;
    writePane(index, null);
    // The undo names the slot: a pane closed since renumbers the others, and `index` would then be another pane.
    if (previous) raiseUndo(text.paneCleared(index + 1), () => { undo(b => restorePane(b, sheetId, index, previous, slotId)); });
  };
  const applyLayout = (target: BoardLayout) => {
    const after = setLayout(board, sheetId, target).sheets.find(s => s.id === sheetId) ?? sheet;
    const change: LayoutChange = { sheetId, before: sheet, after, layout: target };
    const dropped = droppedPaneCount(sheet, target);
    update(b => setLayout(b, sheetId, target));
    if (dropped > 0) raiseUndo(text.shrunk(dropped), () => { undo(b => restoreLayout(b, change)); });
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
    raiseUndo(text.sheetDeleted(removed.sheet.name), () => {
      if (undo(b => restoreSheet(b, removed)) && removed.wasActive) onSheetChange(removed.sheet.id, { replace: true });
    });
  };
  const addNewSheet = () => {
    const next = addSheet(board, text.sheetPrefix);
    if (next === board) return;
    update(() => next);
    onSheetChange(next.activeSheetId);
  };
  /** Runs `edits` on this sheet (or `onSheet`) and raises an undo that restores them only while every edited pane still holds what they left. */
  const editPanes = (edits: PaneEdit[], message: string, onSheet = sheetId) => {
    update(b => applyPaneEdits(b, onSheet, edits));
    raiseUndo(message, () => { undo(b => revertPaneEdits(b, onSheet, edits)); });
  };
  const applyToAll = (index: number) => {
    const result = applyContextToSheet(registry, canOpen, sheet, index);
    if (!result) return;
    if (result.edits.length === 0) { notify(text.appliedNothing); return; }
    editPanes(result.edits, text.applied(index + 1, paneNumbers(result.edits.map(e => e.index))));
  };
  const copyContext = (targetId: string) => {
    const target = board.sheets.find(s => s.id === targetId);
    if (!target) return;
    const edits = copyContextToSheet(registry, canOpen, sheet, target);
    if (edits.length === 0) { notify(text.copiedNothing(target.name)); return; }
    editPanes(edits, text.copied(paneNumbers(edits.map(e => e.index)), target.name), targetId);
  };
  const replaceScreen = (index: number, menu: MenuEntry) => {
    const old = paneScreens[index];
    if (!old) return;
    editPanes([{ index, paneId: sheet.panes[index].id, before: old, after: replacementScreen(registry, canOpen, old, menu, defaultQuery(registry, readRecent())), fresh: true }], text.replaced(index + 1));
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
    raiseUndo(text.duplicated(index + 1, edit.index + 1), () => {
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
    raiseUndo(text.paneClosed(index + 1, sheet.panes.length), () => { undo(b => restoreClosedPane(b, result.closed)); });
  };
  const openFull = (index: number) => {
    const screen = paneScreens[index];
    const menu = screen ? registry.menus.find(m => m.id === screen.menuId) : null;
    if (screen && menu) navigate(paneHref(registry, screen), { focus: 'page', via: 'board' });
  };
  // `Context 바에서 편집`: the bar row is keyed by the selected pane, so it remounts for the new one; focus its first control afterwards.
  const [editRequest, setEditRequest] = useState(0);
  const editContext = (index: number) => { select(index); setEditRequest(n => n + 1); };
  // A request is consumed when it runs: a restore (`visible` again) must not replay it over the focus remembered for the restore.
  const editHandled = useRef(0);
  useEffect(() => {
    if (editRequest === 0) { editHandled.current = 0; return; }
    if (!visible || editHandled.current === editRequest) return;
    const timer = setTimeout(() => {
      editHandled.current = editRequest;
      document.querySelector<HTMLElement>('[data-board-context-row] button:not(:disabled), [data-board-context-row] [tabindex="0"]')?.focus({ preventScroll: true });
    }, 0);
    return () => clearTimeout(timer);
  }, [editRequest, user.id, sheetId, layout, visible]);

  const unavailable = (index: number) => { const own = paneScreens[index]; return own !== null && !canMountPaneScreen(registry, canOpen, own); };
  const applyOff = (index: number) => (unavailable(index) ? text.paneUnavailable : applyContextToSheet(registry, canOpen, sheet, index)?.others ? null : text.applyToAllNone);
  const canGrow = dock && sheet.panes.length < MAX_TABS;
  const duplicateOff = (index: number) => (unavailable(index) ? text.paneUnavailable : emptyIndex === -1 && !canGrow ? text.noEmptyPane : null);
  const axes = useEquipmentAxes();
  const signals = paneSignals(registry, canOpen, paneScreens, text.noneValue, axes, lang, t('membershipAsOf'));
  const emptyIndex = firstEmptyPane(sheet);
  const insert = (index: number, menu: MenuEntry) => writePane(index, { menuId: menu.id, params: {}, query: defaultQuery(registry, readRecent()) });

  const shrinkCount = confirmLayout ? droppedPaneCount(sheet, confirmLayout) : 0;
  const cancelShrink = useRef<HTMLButtonElement>(null);
  const selected = selectedIndex(sheet);
  const { rows, columns } = layoutShape(layout);
  const grid = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const guidance = useRef<HTMLElement>(null);
  const allEmpty = paneScreens.every(screen => screen === null);
  // A hidden board measures 0: that is not a narrow window, so neither measurement is taken until it is visible again.
  const height = useGridHeight(panel, guidance, allEmpty, visible);
  const width = useElementWidth(grid, visible);
  const drawn = drawnColumns(columns, width);
  const stacked = drawn !== columns;
  const arrangement = getArrangement(sheet);
  const tracks = effectiveTracks(layout, arrangement, width, height);
  const owner = `${user.id}.${sheetId}.${dock ? 'dock' : layout}`;
  const identity = `${owner}.${stacked}`;
  // The maximize intent belongs to the owner (user, sheet, layout), not to the drawn width: a narrow stacking only hides it, a wide board shows it again.
  const [presentation, setPresentation] = useState<{ identity: string; maximized: number | null; dockMaximized: string | null }>({ identity: owner, maximized: null, dockMaximized: null });
  const [seenIdentity, setSeenIdentity] = useState(identity);
  // Identity changes cancel transient presentation before children commit; no outgoing focus handoff survives.
  if (seenIdentity !== identity) {
    setSeenIdentity(identity);
    if (confirmLayout !== null) setConfirmLayout(null);
    if (editRequest !== 0) setEditRequest(0);
  }
  if (presentation.identity !== owner) setPresentation({ identity: owner, maximized: null, dockMaximized: null });
  const maximized = stacked || presentation.identity !== owner ? null : presentation.maximized;
  const dockMaximized = presentation.identity === owner ? presentation.dockMaximized : null;
  const toggleMaximize = (index: number) => {
    select(index);
    setPresentation({ identity: owner, maximized: maximized === index ? null : index, dockMaximized: null });
  };
  /** The dock renderer's maximize is a group command; the maximized pane is the one the user is working in, so it is selected. */
  const maximizeDock = (paneId: string | null) => {
    const index = paneId === null ? -1 : indexOfPane(sheet, paneId);
    if (index >= 0) select(index);
    setPresentation({ identity: owner, maximized: null, dockMaximized: index >= 0 ? paneId : null });
  };
  /** `칸 추가` (dock): ends a maximize so the new pane, which the model selects, is on screen, and tells the dock which tab to focus. */
  const dockKey = `${user.id}.${sheetId}`;
  const [newPane, setNewPane] = useState<{ id: string; dock: string } | null>(null);
  const addDockPane = () => {
    // The new pane's id is made here, so the dock can be told which tab to focus.
    const grown = addPane(board, sheetId);
    const added = grown === board ? undefined : grown.sheets.find(s => s.id === sheetId)?.panes.at(-1);
    if (dockMaximized !== null) maximizeDock(null);
    update(() => grown);
    if (added) setNewPane({ id: added.id, dock: dockKey });
  };
  /**
   * The `+` after a group's last tab (docs/16 §4): the picker comes first and cancelling changes nothing. The whole target (user, sheet, anchor pane,
   * the panes of the stored group holding it) is recorded at the press and checked again at the pick; the state sits here, not in the dock, which is
   * rebuilt per sheet and per active tab.
   */
  const [groupAdd, setGroupAdd] = useState<{ userId: string; sheetId: string; anchorId: string; members: string; number: number; notice: string | null } | null>(null);
  const groupAddFocus = useRef<{ trigger: HTMLElement; anchorId: string } | null>(null);
  const groupAdded = useRef(false);
  const openGroupAdd = (anchorId: string, trigger: HTMLElement) => {
    if (sheet.panes.length >= MAX_TABS) { notify(text.groupAddLimit); return; }
    const group = groupHolding(sheet.tree, anchorId);
    if (!group) return;
    groupAddFocus.current = { trigger, anchorId };
    groupAdded.current = false;
    // The group's number is its lowest pane number, as in the `칸 N 동작` move targets.
    setGroupAdd({ userId: user.id, sheetId, anchorId, members: groupKey(group.panes), number: Math.min(...group.panes.map(id => indexOfPane(sheet, id) + 1)), notice: null });
  };
  const pickInGroup = (menu: MenuEntry) => {
    const target = groupAdd;
    if (!target) return;
    const holder = groupHolding(sheet.tree, target.anchorId);
    if (target.userId !== user.id || target.sheetId !== sheetId || !holder || groupKey(holder.panes) !== target.members) { setGroupAdd(null); notify(text.groupAddGone); return; }
    if (sheet.panes.length >= MAX_TABS) { setGroupAdd(null); notify(text.groupAddLimit); return; }
    const screen = { menuId: menu.id, params: {}, query: defaultQuery(registry, readRecent()) };
    if (!canMountPaneScreen(registry, canOpen, screen)) { setGroupAdd({ ...target, notice: text.groupAddUnavailable }); return; }
    const grown = addPaneInGroup(board, sheetId, target.anchorId, screen);
    const added = grown === board ? undefined : grown.sheets.find(s => s.id === sheetId)?.panes.at(-1);
    if (!added) { setGroupAdd(null); notify(text.groupAddGone); return; }
    // A maximized group stays maximized with the new tab, active in it, on screen (docs/16 §4); the dock focuses its tab.
    if (dockMaximized !== null) setPresentation({ identity: owner, maximized: null, dockMaximized: holder.panes.includes(dockMaximized) ? added.id : null });
    groupAdded.current = true;
    setGroupAdd(null);
    update(() => grown);
    setNewPane({ id: added.id, dock: dockKey });
  };
  /** A picker closed without adding: focus goes back to the `+` it came from (rebuilt since, then the one of the group holding the anchor), else the heading. */
  const returnToGroupAdd = () => {
    const mark = groupAddFocus.current;
    groupAddFocus.current = null;
    if (groupAdded.current || !mark) return;
    const plus = mark.trigger.isConnected ? mark.trigger
      : Array.from(document.querySelectorAll<HTMLElement>('[data-board-dock] [data-group-add]')).find(button => button.dataset.groupAdd?.split(' ').includes(mark.anchorId));
    (plus ?? heading.current)?.focus({ preventScroll: true });
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
    if (dock || maximized === null || !visible) return;
    // Radix handles Escape at document capture; React detail/consumer handlers run before window bubble.
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      setPresentation({ identity: owner, maximized: null, dockMaximized: null });
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [dock, maximized, owner, visible]);
  const saved = (change: Partial<typeof arrangement>, final = true) => update(b => {
    const current = b.sheets.find(s => s.id === sheetId);
    return current ? setArrangement(b, sheetId, layout, { ...getArrangement(current), ...change }) : b;
  }, { save: final });
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

  // A covered board keeps its state (selection, drafts, drill, scroll) but not its transient UI: menus and dialogs close, and the detail slot is told
  // that the surface owning its registrants is paused (ADR-0088).
  return <SurfacePauseScope paused={!visible}><TransientOverlayScope active={visible}><div ref={root} data-board className="@container relative flex h-full min-h-0 flex-col"
    onFocusCapture={event => { if (visible && event.target instanceof HTMLElement && !event.target.closest('[data-board-leave]')) rememberFocus(user.id, event.target); }}>
    <header className="flex h-[50px] shrink-0 items-center justify-between gap-3 overflow-x-auto border-b border-border-subtle bg-surface-canvas px-4">
      <div className="flex min-w-0 items-center gap-3">
        {windowed
          ? <h2 ref={heading} tabIndex={-1} className="min-w-28 truncate focus:outline-none text-sm font-semibold text-text-primary">{text.board}</h2>
          : <h1 data-page-heading ref={heading} tabIndex={-1} className="min-w-28 truncate focus:outline-none text-sm font-semibold text-text-primary">{text.board}</h1>}
        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" variant="ghost" size="sm" className="shrink-0" aria-haspopup="dialog" title={text.browserOnly}>
              <HardDrive className="size-3.5 text-text-muted" aria-hidden /><span className="@max-[760px]:sr-only">{text.browserOnly}</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" role="dialog" aria-label={text.browserOnly} className="w-72">
            <p className="text-xs text-text-secondary">{text.storageDetails}</p>
          </PopoverContent>
        </Popover>
      </div>
      {dock ? <div className="flex shrink-0 items-center gap-2">
        {!canGrow && <span id="board-add-pane-off" className="text-tiny text-text-muted">{text.paneLimit}</span>}
        <Button type="button" variant="ghost" size="sm" disabled={!canGrow} aria-describedby={canGrow ? undefined : 'board-add-pane-off'} onClick={() => addDockPane()}>{text.addPane}</Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => update(b => resetTree(b, sheetId))}>{text.defaultLayout}</Button>
      </div> : <div className="flex shrink-0 items-center gap-2">
      <Button type="button" variant="ghost" size="sm" onClick={() => saved(defaultArrangement(layout))}>{text.resetSize}</Button>
      <ToggleGroup type="single" appearance="filter" aria-label={text.layout} value={layout} onValueChange={value => { if (value) requestLayout(value as BoardLayout); }}>
        {BOARD_LAYOUTS.map(option => <ToggleGroupItem key={option} value={option} size="sm" appearance="selected-filter" aria-label={text.layoutOption(option)}>{option.replace('x', '×')}</ToggleGroupItem>)}
      </ToggleGroup>
      </div>}
      {(onMinimize || onFloat || onClose) && <div data-board-leave className="flex shrink-0 items-center gap-1 border-l border-border-subtle pl-2">
        {onFloat && <Button type="button" variant="ghost" size="sm" title={text.floatWindow} onClick={onFloat}><AppWindow className="size-3.5" aria-hidden /><span className="@max-[760px]:sr-only">{text.floatWindow}</span></Button>}
        {onMinimize && <Button type="button" variant="ghost" size="sm" title={text.minimize} onClick={onMinimize}><Minus className="size-3.5" aria-hidden /><span className="@max-[760px]:sr-only">{text.minimize}</span></Button>}
        {onClose && <>
          <Button type="button" variant="ghost" size="sm" title={text.closeBoard} aria-describedby={closeHint} onClick={onClose}><X className="size-3.5" aria-hidden /><span className="@max-[760px]:sr-only">{text.closeBoard}</span></Button>
          <span id={closeHint} className="sr-only">{text.closeHint}</span>
        </>}
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
          <BoardDock key={dockKey} sheet={sheet} update={update} paneProps={paneProps} onSelect={select} onClear={clearPane} onClosePane={closeEmptyPane}
            maximizedPaneId={dockMaximized} onMaximizedChange={maximizeDock} newPane={newPane?.dock === dockKey ? newPane : null} onNewPaneHandled={() => { setNewPane(null); }} heading={heading}
            onAddInGroup={openGroupAdd} groupAddOff={!canGrow} />
        </div>
      </div> : <div ref={grid} onFocusCapture={event => { lastGridFocus.current = event.target; }}
        onBlurCapture={event => { if (event.relatedTarget) lastGridFocus.current = event.relatedTarget; }} data-board-grid data-columns={drawn} data-rows={rows} style={{ '--board-height': `${gridHeight}px` } as CSSProperties} className="relative h-(--board-height)">
        {paneScreens.map((screen, index) => <BoardPane key={`${user.id}.${paneKey(index)}`} {...paneProps(index)}
          placement={panePlacement(index)} hidden={maximized !== null && maximized !== index} collapsed={arrangement.collapsed.includes(index)} maximized={maximized === index}
          sizing={paneScreens.length >= 2} canMaximize={!stacked} collapseOff={maximized !== null ? text.maximizedCollapseOff : !arrangement.collapsed.includes(index) && !canCollapse(layout, arrangement.collapsed, index) ? text.lastExpanded : null}
          onCollapse={() => collapse(index)} onMaximize={() => toggleMaximize(index)} />)}
        {!stacked && maximized === null && columns === 2 && <PaneSplitter key={`${identity}.columns`} label={text.columnSize} controls={`board-pane-${paneKey(0)}`}
          value={tracks.widths[0] / (tracks.widths[0] + tracks.widths[1]) * 100} bounds={tracks.columnBounds} extent={tracks.widths[0] + tracks.widths[1]}
          placement={{ left: tracks.widths[0], top: 0, width: GRID_GAP, height: tracks.height }} onChange={(values, final) => saved({ columns: values }, final)} />}
        {!stacked && maximized === null && rows === 2 && Array.from({ length: columns }, (_, c) => !arrangement.collapsed.includes(c) && !arrangement.collapsed.includes(c + columns)
          ? <PaneSplitter key={`${identity}.rows.${c}`} horizontal label={text.rowSize(c + 1, c + columns + 1)} controls={`board-pane-${paneKey(c)}`}
            value={tracks.heights[c][0] / (tracks.height - GRID_GAP) * 100} bounds={tracks.rowBounds[c]} extent={tracks.height - GRID_GAP}
            placement={{ left: c === 0 ? 0 : tracks.widths[0] + GRID_GAP, top: tracks.heights[c][0], width: tracks.widths[c], height: GRID_GAP }}
            onChange={(values, final) => saved({ rows: arrangement.rows.map((r, i) => i === c ? values : r) }, final)} /> : null)}
      </div>}
    </div>
    </QueryBarExtensionsProvider>
    </PaneQueryDraftProvider>
    <SheetTabs sheets={board.sheets} activeId={sheetId} panelId={PANEL_ID}
      onSwitch={id => { if (id !== sheetId) onSheetChange(id); }} onAdd={addNewSheet}
      onCopyContext={copyContext}
      onRename={(id, name) => update(b => renameSheet(b, id, name))} onMove={(id, to) => update(b => moveSheet(b, id, to))} onDelete={deleteSheet} />
    {dock && <PanePicker open={groupAdd !== null} title={text.groupAddTitle(groupAdd?.number ?? 1)} notice={groupAdd?.notice}
      onOpenChange={open => { if (!open) setGroupAdd(null); }} onPick={pickInGroup}
      onCloseAutoFocus={event => { event.preventDefault(); returnToGroupAdd(); }} />}
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
  </div></TransientOverlayScope></SurfacePauseScope>;
}
