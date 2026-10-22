import { addPanel, isValidDockTree, removePanel } from '@ap/components/dock';
import type { PaneScreen } from '@ap/kernel';
import { activateInTree, defaultTree, effectiveTree, fromDockTree, largestGroup, reconcileSelection, reinsertPane, toDockTree, treeShape } from './boardDockTree';
import { defaultLayoutFor, gridOf, memoryOf, withGrid, withGridMemory } from './boardGrid';
import {
  MAX_PANES, MAX_SHEETS, columnPanes, isRatioVector, isRecord, layoutShape, makeId, paneCount, parseArrangementEntry, parseGridMemory, parsePane,
  type Arrangement, type Board, type BoardLayout, type LayoutNode, type PaneSlot, type Sheet,
} from './boardTypes';

export { BOARD_LAYOUTS, MAX_SHEETS, columnPanes, defaultArrangement, layoutShape, paneCount } from './boardTypes';
export type { Arrangement, Board, BoardLayout, GridMemory, LayoutNode, PaneSlot, Sheet } from './boardTypes';
export { gridOf, withGrid, type GridView } from './boardGrid';

const newSlot = (taken: ReadonlySet<string>): PaneSlot => ({ id: makeId('p', taken), screen: null, previous: null });

export function newSheet(name: string, taken: ReadonlySet<string>): Sheet {
  const slot = newSlot(new Set());
  return { id: makeId('s', taken), name, panes: [slot], selectedPaneId: slot.id, tree: { type: 'group', panes: [slot.id], active: slot.id } };
}

/** The sheet name `시트 N`/`Sheet N` with the smallest N no sheet uses yet. */
export function nextSheetName(sheets: readonly Sheet[], prefix: string): string {
  const names = new Set(sheets.map(s => s.name));
  for (let n = 1; ; n++) if (!names.has(`${prefix} ${n}`)) return `${prefix} ${n}`;
}

export function freshBoard(prefix: string): Board {
  const sheet = newSheet(`${prefix} 1`, new Set());
  return { v: 2, activeSheetId: sheet.id, sheets: [sheet] };
}

/** What each pane shows, by pane number. */
export const screens = (sheet: Sheet): (PaneScreen | null)[] => sheet.panes.map(p => p.screen);
export const paneIdAt = (sheet: Sheet, index: number): string | null => sheet.panes[index]?.id ?? null;
export const indexOfPane = (sheet: Sheet, id: string): number => sheet.panes.findIndex(p => p.id === id);
/** The selected pane's index (pane number − 1). */
export const selectedIndex = (sheet: Sheet): number => Math.max(0, indexOfPane(sheet, sheet.selectedPaneId));
export const layoutOf = (sheet: Sheet): BoardLayout => gridOf(sheet).layout;

/** The arrangement the grid shows for `layout` (default: the sheet's own layout); another layout reads its remembered one. */
export const getArrangement = (sheet: Sheet, layout?: BoardLayout): Arrangement => {
  const grid = gridOf(sheet);
  return layout === undefined || layout === grid.layout ? grid.arrangement : memoryOf(sheet, layout);
};
export const canCollapse = (layout: BoardLayout, collapsed: readonly number[], index: number): boolean =>
  columnPanes(layout, index % layoutShape(layout).columns).some(i => i !== index && !collapsed.includes(i));

/** Invalid input is ignored; defaults remove only this layout's saved entry. The sheet's own layout also rewrites the tree. */
export function setArrangement(board: Board, sheetId: string, layout: BoardLayout, value: Arrangement): Board {
  const entry = parseArrangementEntry(value, layout);
  if (!entry) return board;
  return mapSheet(board, sheetId, sheet => (gridOf(sheet).layout === layout && sheet.panes.length === paneCount(layout) ? withGrid(sheet, layout, entry) : withGridMemory(sheet, layout, entry)));
}

export const previousAt = (sheet: Sheet, index: number): PaneScreen | null => sheet.panes[index]?.previous ?? null;

const mapSlot = (sheet: Sheet, index: number, change: (slot: PaneSlot) => PaneSlot): Sheet =>
  (index < 0 || index >= sheet.panes.length ? sheet : { ...sheet, panes: sheet.panes.map((p, i) => (i === index ? change(p) : p)) });

/** Every pane id appears in exactly one group exactly once; `active` is in its group; sizes are finite positives summing to 100, one per child. Returns a clean copy. */
function cleanTree(node: unknown, ids: ReadonlySet<string>, seen: Set<string>): LayoutNode | null {
  if (!isRecord(node)) return null;
  if (node.type === 'group') {
    if (!Array.isArray(node.panes) || node.panes.length === 0 || typeof node.active !== 'string' || !node.panes.includes(node.active)) return null;
    for (const id of node.panes) {
      if (typeof id !== 'string' || !ids.has(id) || seen.has(id)) return null;
      seen.add(id);
    }
    return { type: 'group', panes: [...node.panes as string[]], active: node.active };
  }
  if (node.type !== 'branch' || (node.dir !== 'row' && node.dir !== 'column') || !Array.isArray(node.children) || node.children.length < 2
    || !isRatioVector(node.sizes, node.children.length)) return null;
  const children: LayoutNode[] = [];
  for (const child of node.children) {
    const clean = cleanTree(child, ids, seen);
    if (!clean) return null;
    children.push(clean);
  }
  return { type: 'branch', dir: node.dir, sizes: [...node.sizes], children };
}

function parseSlots(value: unknown): PaneSlot[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_PANES) return null;
  const ids = new Set<string>();
  const slots: PaneSlot[] = [];
  for (const item of value) {
    if (!isRecord(item) || typeof item.id !== 'string' || item.id.length === 0 || ids.has(item.id)) return null;
    const screen = parsePane(item.screen);
    const previous = parsePane(item.previous);
    if (screen === undefined || previous === undefined) return null;
    ids.add(item.id);
    slots.push({ id: item.id, screen, previous });
  }
  return slots;
}

function parseSheet(item: unknown): Sheet | null {
  if (!isRecord(item) || typeof item.id !== 'string' || item.id.length === 0 || typeof item.name !== 'string') return null;
  const panes = parseSlots(item.panes);
  if (!panes || typeof item.selectedPaneId !== 'string' || !panes.some(p => p.id === item.selectedPaneId)) return null;
  const ids = new Set(panes.map(p => p.id));
  const seen = new Set<string>();
  const tree = cleanTree(item.tree, ids, seen);
  if (!tree || seen.size !== ids.size) return null;
  const sheet: Sheet = { id: item.id, name: item.name, panes, selectedPaneId: item.selectedPaneId, tree };
  const gridMemory = parseGridMemory(item.gridMemory);
  return gridMemory ? { ...sheet, gridMemory } : sheet;
}

/**
 * Validates a stored V2 value. Anything off — shape, version, pane ids, tree, duplicate sheet ids — is null, never a partial board. Only
 * `gridMemory` (the grid renderer's remembered sizes) drops an unreadable entry instead of rejecting the board.
 */
export function parseBoardV2(raw: unknown): Board | null {
  if (!isRecord(raw) || raw.v !== 2 || typeof raw.activeSheetId !== 'string' || !Array.isArray(raw.sheets)) return null;
  if (raw.sheets.length < 1 || raw.sheets.length > MAX_SHEETS) return null;
  const ids = new Set<string>();
  const sheets: Sheet[] = [];
  for (const item of raw.sheets) {
    const sheet = parseSheet(item);
    if (!sheet || ids.has(sheet.id)) return null;
    ids.add(sheet.id);
    sheets.push(sheet);
  }
  if (!ids.has(raw.activeSheetId)) return null;
  return { v: 2, activeSheetId: raw.activeSheetId, sheets };
}

const mapSheet = (board: Board, id: string, change: (sheet: Sheet) => Sheet): Board => {
  const index = board.sheets.findIndex(s => s.id === id);
  if (index === -1) return board;
  const next = change(board.sheets[index]);
  return next === board.sheets[index] ? board : { ...board, sheets: board.sheets.map((s, i) => (i === index ? next : s)) };
};

export function setActiveSheet(board: Board, id: string): Board {
  return board.activeSheetId === id || !board.sheets.some(s => s.id === id) ? board : { ...board, activeSheetId: id };
}

export function addSheet(board: Board, prefix: string): Board {
  if (board.sheets.length >= MAX_SHEETS) return board;
  const sheet = newSheet(nextSheetName(board.sheets, prefix), new Set(board.sheets.map(s => s.id)));
  return { ...board, activeSheetId: sheet.id, sheets: [...board.sheets, sheet] };
}

export function renameSheet(board: Board, id: string, name: string): Board {
  const next = name.trim();
  return next === '' ? board : mapSheet(board, id, s => (s.name === next ? s : { ...s, name: next }));
}

/** Moves a sheet to `toIndex` (clamped). */
export function moveSheet(board: Board, id: string, toIndex: number): Board {
  const from = board.sheets.findIndex(s => s.id === id);
  if (from === -1) return board;
  const to = Math.max(0, Math.min(board.sheets.length - 1, toIndex));
  if (to === from) return board;
  const sheets = board.sheets.slice();
  const [moved] = sheets.splice(from, 1);
  sheets.splice(to, 0, moved);
  return { ...board, sheets };
}

/** `replacement` is the empty sheet that took the place of a deleted last sheet, as created (the undo compares against it). */
export type RemovedSheet = { sheet: Sheet; index: number; wasActive: boolean; replacement: Sheet | null };

/** Removes a sheet. The last sheet is replaced by an empty one (`replacement`) so a board always has a sheet. */
export function removeSheet(board: Board, id: string, prefix: string): { board: Board; removed: RemovedSheet } | null {
  const index = board.sheets.findIndex(s => s.id === id);
  if (index === -1) return null;
  const sheet = board.sheets[index];
  const wasActive = board.activeSheetId === id;
  if (board.sheets.length === 1) {
    const blank = newSheet(`${prefix} 1`, new Set([id]));
    return { board: { ...board, activeSheetId: blank.id, sheets: [blank] }, removed: { sheet, index, wasActive, replacement: blank } };
  }
  const sheets = board.sheets.filter(s => s.id !== id);
  const activeSheetId = wasActive ? sheets[Math.min(index, sheets.length - 1)].id : board.activeSheetId;
  return { board: { ...board, activeSheetId, sheets }, removed: { sheet, index, wasActive, replacement: null } };
}

export const samePane = (a: PaneScreen | null, b: PaneScreen | null) => a === b
  || (a !== null && b !== null && a.menuId === b.menuId && a.query === b.query
    && Object.keys(a.params).length === Object.keys(b.params).length && Object.entries(a.params).every(([k, v]) => b.params[k] === v));
const samePanes = (a: Sheet, b: Sheet) => layoutOf(a) === layoutOf(b) && a.panes.length === b.panes.length && a.panes.every((p, i) => samePane(p.screen, b.panes[i].screen));
const sameSheet = (a: Sheet, b: Sheet) => a.name === b.name && a.selectedPaneId === b.selectedPaneId && samePanes(a, b)
  && JSON.stringify(a.tree) === JSON.stringify(b.tree) && JSON.stringify(a.gridMemory) === JSON.stringify(b.gridMemory);

/** Repairs one sheet that broke an invariant; the same object when nothing needed repair. Panes beyond 4 are dropped, a missing tree becomes the default grid. */
function normalizeSheet(sheet: Sheet): Sheet {
  const memory = parseGridMemory(sheet.gridMemory);
  const memoryFits = JSON.stringify(memory) === JSON.stringify(sheet.gridMemory);
  const unique = sheet.panes.filter((p, i) => sheet.panes.findIndex(q => q.id === p.id) === i).slice(0, MAX_PANES);
  const ids = new Set(unique.map(p => p.id));
  const seen = new Set<string>();
  const treeFits = unique.length === sheet.panes.length && unique.length > 0 && cleanTree(sheet.tree, ids, seen) !== null && seen.size === ids.size;
  const selectedFits = ids.has(sheet.selectedPaneId);
  if (treeFits && selectedFits && memoryFits) return sheet;
  const canonical: Sheet = { ...sheet };
  delete canonical.gridMemory;
  if (memory) canonical.gridMemory = memory;
  let panes = unique.length > 0 ? unique : [newSlot(new Set())];
  if (!treeFits && panes.length === 3) panes = [...panes, newSlot(new Set(panes.map(p => p.id)))];
  const selectedPaneId = panes.some(p => p.id === sheet.selectedPaneId) ? sheet.selectedPaneId : panes[0].id;
  const fitted: Sheet = { ...canonical, panes, selectedPaneId };
  if (treeFits) return fitted;
  const layout = defaultLayoutFor(panes.length);
  return withGrid(fitted, layout, memoryOf(canonical, layout));
}

/**
 * The one place the board's invariants are enforced after an undo: 1–20 sheets, every sheet's panes, tree and selection consistent
 * (1–4 panes with unique ids, every pane in exactly one group, the selected pane one of them), canonical `gridMemory`, and an active sheet
 * that exists. Returns the same object when nothing needed repair, and null for a board with no sheets (nothing to repair it from).
 */
export function normalizeBoard(board: Board): Board | null {
  if (board.sheets.length === 0) return null;
  let changed = false;
  const sheets = board.sheets.slice(0, MAX_SHEETS).map(sheet => {
    const next = normalizeSheet(sheet);
    if (next !== sheet) changed = true;
    return next;
  });
  if (sheets.length !== board.sheets.length) changed = true;
  const active = sheets.some(s => s.id === board.activeSheetId);
  if (!active) changed = true;
  return changed ? { ...board, activeSheetId: active ? board.activeSheetId : sheets[0].id, sheets } : board;
}

/**
 * Undo of `removeSheet`: puts the sheet back where it was. Null — nothing restored — when something changed since: the replacement
 * sheet was edited or removed, the sheet's id is back already, or the board is at 20 sheets again.
 */
export function restoreSheet(board: Board, removed: RemovedSheet): Board | null {
  if (board.sheets.some(s => s.id === removed.sheet.id)) return null;
  let sheets = board.sheets;
  if (removed.replacement !== null) {
    const blank = sheets.find(s => s.id === removed.replacement!.id);
    if (!blank || !sameSheet(blank, removed.replacement)) return null;
    sheets = sheets.filter(s => s !== blank);
  }
  if (sheets.length >= MAX_SHEETS) return null;
  const at = Math.min(removed.index, sheets.length);
  const next = [...sheets.slice(0, at), removed.sheet, ...sheets.slice(at)];
  return normalizeBoard({ ...board, sheets: next, activeSheetId: removed.wasActive ? removed.sheet.id : (next.some(s => s.id === board.activeSheetId) ? board.activeSheetId : removed.sheet.id) });
}

export function selectPane(board: Board, sheetId: string, index: number): Board {
  return mapSheet(board, sheetId, s => {
    const id = paneIdAt(s, index);
    return id === null || s.selectedPaneId === id ? s : { ...s, selectedPaneId: id };
  });
}

/** Puts a whole new screen (or nothing) in a pane: a clear, an insert or a replace, so the pane's `이전 화면` goes. */
export function setPane(board: Board, sheetId: string, index: number, screen: PaneScreen | null): Board {
  return mapSheet(board, sheetId, s => mapSlot(s, index, slot => ({ ...slot, screen, previous: null })));
}

/**
 * A pane edits its own screen (`PaneScreenProvider.onChange`). A `push` to another menu keeps the screen it leaves as the pane's one
 * `이전 화면`; a replace or a write inside the same menu leaves `previous` alone (docs/16 §4).
 */
export function editPane(board: Board, sheetId: string, index: number, next: PaneScreen, how: 'push' | 'replace'): Board {
  return mapSheet(board, sheetId, s => mapSlot(s, index, slot => {
    const moved = how === 'push' && slot.screen !== null && slot.screen.menuId !== next.menuId;
    return { ...slot, screen: next, previous: moved ? slot.screen : slot.previous };
  }));
}

/** `이전 화면`: the pane shows its previous screen again and forgets it. No-op without one. */
export function goBackPane(board: Board, sheetId: string, index: number): Board {
  return mapSheet(board, sheetId, s => (previousAt(s, index) === null ? s : mapSlot(s, index, slot => ({ ...slot, screen: slot.previous, previous: null }))));
}


/**
 * One pane an action changed: what it held and what the action left. `fresh` marks a whole new screen (replace, duplicate), which
 * also drops the pane's `이전 화면`; without it only the pane's own Context changed and `previous` stays.
 */
export type PaneEdit = { index: number; before: PaneScreen | null; after: PaneScreen | null; fresh?: boolean; paneId?: string };

/** The edit's pane in `sheet`: by slot id when the edit has one (pane numbers shift when a pane closes), else by `index`. -1 when the slot is gone. */
const editIndex = (sheet: Sheet, edit: PaneEdit): number => (edit.paneId === undefined ? edit.index : indexOfPane(sheet, edit.paneId));

/** Writes one edit's pane. A Context-only edit leaves the pane's `previous` alone; a whole new screen (or none) goes through `setPane`. */
function writeEdit(board: Board, sheetId: string, edit: PaneEdit, screen: PaneScreen | null): Board {
  const sheet = board.sheets.find(s => s.id === sheetId);
  if (!sheet) return board;
  const index = editIndex(sheet, edit);
  return edit.fresh || edit.before === null || edit.after === null
    ? setPane(board, sheetId, index, screen)
    : mapSheet(board, sheetId, s => mapSlot(s, index, slot => ({ ...slot, screen })));
}

export function applyPaneEdits(board: Board, sheetId: string, edits: readonly PaneEdit[]): Board {
  return edits.reduce((b, edit) => writeEdit(b, sheetId, edit, edit.after), board);
}

/** Undo of `applyPaneEdits`. Null — nothing restored — unless every edited pane still holds what the action left. */
export function revertPaneEdits(board: Board, sheetId: string, edits: readonly PaneEdit[]): Board | null {
  const sheet = board.sheets.find(s => s.id === sheetId);
  if (!sheet || edits.some(e => { const at = editIndex(sheet, e); return at < 0 || at >= sheet.panes.length || !samePane(sheet.panes[at].screen, e.after); })) return null;
  return normalizeBoard(edits.reduce((b, edit) => writeEdit(b, sheetId, edit, edit.before), board));
}

/** A new sheet holding one screen, active. Null at the 20-sheet limit. */
export function openScreenInNewSheet(board: Board, prefix: string, screen: PaneScreen): Board | null {
  if (board.sheets.length >= MAX_SHEETS) return null;
  const added = addSheet(board, prefix);
  return setPane(added, added.activeSheetId, 0, screen);
}

/** Undo of a pane clear. Null — nothing restored — unless the slot is still there and still empty. `paneId` names the slot when given (a close may have renumbered the panes since), else `index` does. */
export function restorePane(board: Board, sheetId: string, index: number, screen: PaneScreen, paneId?: string): Board | null {
  const sheet = board.sheets.find(s => s.id === sheetId);
  if (!sheet) return null;
  const at = paneId === undefined ? index : indexOfPane(sheet, paneId);
  if (at < 0 || at >= sheet.panes.length || sheet.panes[at].screen !== null) return null;
  return normalizeBoard(setPane(board, sheetId, at, screen));
}

/** How many panes with a screen a layout change would drop. Empty overflow panes cost nothing. */
export function droppedPaneCount(sheet: Sheet, layout: BoardLayout): number {
  return sheet.panes.slice(paneCount(layout)).filter(p => p.screen !== null).length;
}

/** `before` is the sheet as it was, `after` as the change left it; the undo applies only while the sheet still is `after`. */
export type LayoutChange = { sheetId: string; before: Sheet; after: Sheet; layout: BoardLayout };

export function setLayout(board: Board, sheetId: string, layout: BoardLayout): Board {
  return mapSheet(board, sheetId, s => {
    const grid = gridOf(s);
    if (grid.layout === layout) return s;
    const count = paneCount(layout);
    // The layout being left keeps its current sizes in `gridMemory`, so switching back restores them.
    const kept = s.panes.length === paneCount(grid.layout) ? withGridMemory(s, grid.layout, grid.arrangement) : s;
    const taken = new Set(kept.panes.map(p => p.id));
    const panes = Array.from({ length: count }, (_, i) => kept.panes[i] ?? (() => { const slot = newSlot(taken); taken.add(slot.id); return slot; })());
    const selectedPaneId = panes.some(p => p.id === kept.selectedPaneId) ? kept.selectedPaneId : panes[0].id;
    return withGrid({ ...kept, panes, selectedPaneId }, layout, memoryOf(kept, layout));
  });
}

/**
 * Undo of a layout shrink: brings back the layout and the dropped panes. Null — nothing restored — unless the sheet's layout and panes
 * are still what the shrink left, so nothing edited since is overwritten. The selection returns only if nothing moved it since.
 */
export function restoreLayout(board: Board, change: LayoutChange): Board | null {
  const sheet = board.sheets.find(s => s.id === change.sheetId);
  if (!sheet || !samePanes(sheet, change.after)) return null;
  // A later selection is kept by pane number: the restored slots may have other ids than the ones now on the sheet.
  const selectedPaneId = sheet.selectedPaneId === change.after.selectedPaneId ? change.before.selectedPaneId : (change.before.panes[selectedIndex(sheet)] ?? change.before.panes[0]).id;
  const layout = layoutOf(change.before);
  return normalizeBoard(mapSheet(board, change.sheetId, s => withGrid({ ...s, panes: change.before.panes, selectedPaneId }, layout, memoryOf(s, layout))));
}

/** A board as it is opened: the first pane of every sheet selected (docs/16 §4). The stored selection is never used for arrival. */
export const atFirstPanes = (board: Board): Board => (board.sheets.every(s => selectedIndex(s) === 0) ? board : { ...board, sheets: board.sheets.map(s => (selectedIndex(s) === 0 ? s : { ...s, selectedPaneId: s.panes[0].id })) });

/** Puts `index`'s pane in front of its group as well as selecting it (dock renderer). Unlike `selectPane` this writes the tree, which the grid reads as which pane of a collapsed column is open. */
export function selectPaneActive(board: Board, sheetId: string, index: number): Board {
  return mapSheet(board, sheetId, s => {
    const id = paneIdAt(s, index);
    if (id === null) return s;
    const tree = activateInTree(s.tree, id);
    return s.selectedPaneId === id && tree === s.tree ? s : { ...s, selectedPaneId: id, tree };
  });
}

/**
 * Stores the layout tree the dock renderer reports or a group command builds. A tree that is not exactly the sheet's panes (each in one group
 * once, sizes that sum to 100) is ignored, and so is one the sheet already has. The selection then follows the tree (`reconcileSelection`).
 */
export function setTree(board: Board, sheetId: string, tree: LayoutNode): Board {
  return mapSheet(board, sheetId, s => {
    if (!isValidDockTree(toDockTree(tree), s.panes.map(p => p.id)) || JSON.stringify(tree) === JSON.stringify(s.tree)) return s;
    return reconcileSelection({ ...s, tree });
  });
}

/** `기본 배치`: the default tree for the sheet's pane count, the selected pane in front of its group. */
export const resetTree = (board: Board, sheetId: string): Board => mapSheet(board, sheetId, s => {
  const tree = activateInTree(defaultTree(s.panes.map(p => p.id)), s.selectedPaneId);
  return JSON.stringify(tree) === JSON.stringify(s.tree) ? s : { ...s, tree };
});

/**
 * `칸 추가` (dock renderer): a new empty pane as the last number. On the default arrangement of the sheet's panes the result is the default
 * arrangement of those panes plus the new one (four panes become 2×2); on any other it splits the largest group along its longer side. Selected
 * unless `select` is false. Unchanged at 4 panes.
 */
export function addPane(board: Board, sheetId: string, select = true): Board {
  return mapSheet(board, sheetId, s => {
    if (s.panes.length >= MAX_PANES) return s;
    const ids = s.panes.map(p => p.id);
    const slot = newSlot(new Set(ids));
    let tree: LayoutNode;
    if (JSON.stringify(s.tree) === JSON.stringify(defaultTree(ids))) tree = defaultTree([...ids, slot.id]);
    else {
      const target = largestGroup(effectiveTree(s));
      tree = fromDockTree(addPanel(toDockTree(effectiveTree(s)), slot.id, { panelId: target.group.active, position: target.width >= target.height ? 'right' : 'bottom' }));
    }
    return reconcileSelection({ ...s, panes: [...s.panes, slot], selectedPaneId: select ? slot.id : s.selectedPaneId, tree });
  });
}

/** What `closePane` removed and the sheet on both sides of it, so the undo can put the pane back where it was and only while nothing else changed the panes. */
export type ClosedPane = { sheetId: string; slot: PaneSlot; index: number; before: Sheet; after: Sheet };

/**
 * `칸 닫기` (dock renderer): removes an empty pane from the sheet and the tree; later panes move down one number. Null for a pane with a
 * screen and for a sheet's only pane. A closed selected pane hands the selection to the pane that takes its number (the last one if it was last).
 */
export function closePane(board: Board, sheetId: string, index: number): { board: Board; closed: ClosedPane } | null {
  const sheet = board.sheets.find(s => s.id === sheetId);
  const slot = sheet?.panes[index];
  if (!sheet || !slot || slot.screen !== null || sheet.panes.length <= 1) return null;
  const panes = sheet.panes.filter((_, i) => i !== index);
  const selectedPaneId = sheet.selectedPaneId === slot.id ? panes[Math.min(index, panes.length - 1)].id : sheet.selectedPaneId;
  const tree = activateInTree(fromDockTree(removePanel(toDockTree(effectiveTree(sheet)), slot.id)), selectedPaneId);
  const after = reconcileSelection({ ...sheet, panes, selectedPaneId, tree });
  return { board: mapSheet(board, sheetId, () => after), closed: { sheetId, slot, index, before: sheet, after } };
}

/**
 * Undo of `closePane`: the pane returns under its old number. Where it sits in the tree is restored while the arrangement is still the one
 * the close left, keeping the sizes the user set since (`reinsertPane`); after a later move it is docked right of the selected pane instead. Null — nothing restored — once the sheet's panes are
 * not the ones the close left or the sheet is back at 4 panes.
 */
export function restoreClosedPane(board: Board, closed: ClosedPane): Board | null {
  const sheet = board.sheets.find(s => s.id === closed.sheetId);
  const ids = (s: Sheet) => s.panes.map(p => p.id).join('\n');
  if (!sheet || sheet.panes.length >= MAX_PANES || ids(sheet) !== ids(closed.after)) return null;
  const { slot, index } = closed;
  const panes = [...sheet.panes.slice(0, index), slot, ...sheet.panes.slice(index)];
  const reselect = closed.before.selectedPaneId === slot.id && sheet.selectedPaneId === closed.after.selectedPaneId;
  const selectedPaneId = reselect ? slot.id : sheet.selectedPaneId;
  const sameArrangement = JSON.stringify(treeShape(sheet.tree)) === JSON.stringify(treeShape(closed.after.tree));
  const tree = sameArrangement ? reinsertPane(closed.before.tree, sheet.tree, slot.id) : fromDockTree(addPanel(toDockTree(effectiveTree(sheet)), slot.id, { panelId: sheet.selectedPaneId, position: 'right' }));
  return normalizeBoard(mapSheet(board, closed.sheetId, s => reconcileSelection({ ...s, panes, selectedPaneId, tree: activateInTree(tree, selectedPaneId) })));
}
