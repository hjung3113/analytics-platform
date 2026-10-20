import type { PaneScreen } from '@ap/kernel';

/** `rows x columns`; panes are numbered row by row, so `1x2` is two side by side and `2x1` two stacked. */
export type BoardLayout = '1x1' | '1x2' | '2x1' | '2x2';
export const BOARD_LAYOUTS: readonly BoardLayout[] = ['1x1', '1x2', '2x1', '2x2'];
export const MAX_SHEETS = 20;

/**
 * `previous` (optional, missing in boards stored before 497b) holds, per pane, the screen it showed before it moved to another menu —
 * the one step `이전 화면` goes back (docs/16 §4). When present it is as long as `panes`.
 */
export type Arrangement = { columns: number[]; rows: number[][]; collapsed: number[] };
export type Sheet = { arrangement?: Partial<Record<BoardLayout, Arrangement>>; id: string; name: string; layout: BoardLayout; selected: number; panes: (PaneScreen | null)[]; previous?: (PaneScreen | null)[] };
export type Board = { v: 1; activeSheetId: string; sheets: Sheet[] };

export const paneCount = (layout: BoardLayout) => ({ '1x1': 1, '1x2': 2, '2x1': 2, '2x2': 4 })[layout];
export const layoutShape = (layout: BoardLayout) => ({ rows: Number(layout[0]), columns: Number(layout[2]) });

function makeId(prefix: string, taken: ReadonlySet<string>): string {
  for (;;) {
    let id: string;
    try { id = `${prefix}${crypto.randomUUID().slice(0, 8)}`; } catch { id = `${prefix}${Math.random().toString(36).slice(2, 10)}`; }
    if (!taken.has(id)) return id;
  }
}

export function newSheet(name: string, taken: ReadonlySet<string>): Sheet {
  return { id: makeId('s', taken), name, layout: '1x1', selected: 0, panes: [null] };
}

/** The sheet name `시트 N`/`Sheet N` with the smallest N no sheet uses yet. */
export function nextSheetName(sheets: readonly Sheet[], prefix: string): string {
  const names = new Set(sheets.map(s => s.name));
  for (let n = 1; ; n++) if (!names.has(`${prefix} ${n}`)) return `${prefix} ${n}`;
}

export function freshBoard(prefix: string): Board {
  const sheet = newSheet(`${prefix} 1`, new Set());
  return { v: 1, activeSheetId: sheet.id, sheets: [sheet] };
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** Row-major indices belonging to a logical column, independent of responsive stacking. */
export function columnPanes(layout: BoardLayout, column: number): number[] {
  const { rows, columns } = layoutShape(layout);
  return Array.from({ length: rows }, (_, row) => row * columns + column);
}

export function defaultArrangement(layout: BoardLayout): Arrangement {
  const { rows, columns } = layoutShape(layout);
  return { columns: Array(columns).fill(100 / columns), rows: Array.from({ length: columns }, () => Array(rows).fill(100 / rows)), collapsed: [] };
}
export const getArrangement = (sheet: Sheet, layout = sheet.layout): Arrangement => sheet.arrangement?.[layout] ?? defaultArrangement(layout);
export const canCollapse = (layout: BoardLayout, collapsed: readonly number[], index: number): boolean =>
  columnPanes(layout, index % layoutShape(layout).columns).some(i => i !== index && !collapsed.includes(i));

function parseArrangementEntry(value: unknown, layout: BoardLayout): Arrangement | null {
  if (!isRecord(value)) return null;
  const { rows, columns } = layoutShape(layout);
  const vector = (v: unknown, count: number): v is number[] => Array.isArray(v) && v.length === count
    && v.every(n => typeof n === 'number' && Number.isFinite(n) && n > 0)
    && Math.abs(v.reduce((a: number, b: number) => a + b, 0) - 100) <= 0.01
    && (count !== 1 || v[0] === 100);
  if (!vector(value.columns, columns) || !Array.isArray(value.rows) || value.rows.length !== columns
    || !value.rows.every(v => vector(v, rows)) || !Array.isArray(value.collapsed)) return null;
  const collapsed: number[] = value.collapsed;
  if (collapsed.some(i => !Number.isInteger(i) || i < 0 || i >= paneCount(layout)) || new Set(collapsed).size !== collapsed.length
    || Array.from({ length: columns }, (_, c) => columnPanes(layout, c)).some(indices => indices.every(i => collapsed.includes(i)))) return null;
  return { columns: [...value.columns], rows: value.rows.map(v => [...v]), collapsed: [...collapsed].sort((a, b) => a - b) };
}

function parseArrangement(value: unknown): Sheet['arrangement'] {
  if (!isRecord(value)) return undefined;
  const entries: Sheet['arrangement'] = {};
  for (const layout of BOARD_LAYOUTS) {
    const entry = parseArrangementEntry(value[layout], layout);
    if (entry && JSON.stringify(entry) !== JSON.stringify(defaultArrangement(layout))) entries[layout] = entry;
  }
  return Object.keys(entries).length ? entries : undefined;
}
function withArrangement(sheet: Sheet, value: unknown): Sheet {
  const rest = { ...sheet };
  delete rest.arrangement;
  const arrangement = parseArrangement(value);
  return arrangement ? { ...rest, arrangement } : rest;
}

/** Invalid input is ignored; defaults remove only this layout's saved entry. */
export function setArrangement(board: Board, sheetId: string, layout: BoardLayout, value: Arrangement): Board {
  if (!parseArrangementEntry(value, layout)) return board;
  return mapSheet(board, sheetId, sheet => withArrangement(sheet, { ...sheet.arrangement, [layout]: value }));
}

function parsePane(value: unknown): PaneScreen | null | undefined {
  if (value === null) return null;
  if (!isRecord(value) || typeof value.menuId !== 'string' || typeof value.query !== 'string' || !isRecord(value.params)) return undefined;
  if (value.query !== '' && !value.query.startsWith('?')) return undefined;
  const params: Record<string, string> = {};
  for (const [key, v] of Object.entries(value.params)) {
    if (typeof v !== 'string') return undefined;
    params[key] = v;
  }
  return { menuId: value.menuId, params, query: value.query };
}

function parsePrevious(value: unknown, count: number): (PaneScreen | null)[] | undefined {
  if (!Array.isArray(value) || value.length !== count) return undefined;
  const previous: (PaneScreen | null)[] = [];
  for (const item of value) {
    const parsed = parsePane(item);
    if (parsed === undefined) return undefined;
    previous.push(parsed);
  }
  return previous;
}

/** The sheet with `previous` set, or without the field when nothing is stored in it. */
function withPrevious(sheet: Sheet, previous: (PaneScreen | null)[] | undefined): Sheet {
  const rest = { ...sheet };
  delete rest.previous;
  return previous && previous.some(p => p !== null) ? { ...rest, previous } : rest;
}

export const previousAt = (sheet: Sheet, index: number): PaneScreen | null => sheet.previous?.[index] ?? null;
const setPreviousAt = (sheet: Sheet, index: number, screen: PaneScreen | null): Sheet =>
  withPrevious(sheet, sheet.panes.map((_, i) => (i === index ? screen : previousAt(sheet, i))));

/** Validates a stored value. Anything off — shape, version, counts, duplicate ids — is null, never a partial board. */
export function parseBoard(raw: unknown): Board | null {
  if (!isRecord(raw) || raw.v !== 1 || typeof raw.activeSheetId !== 'string' || !Array.isArray(raw.sheets)) return null;
  if (raw.sheets.length < 1 || raw.sheets.length > MAX_SHEETS) return null;
  const ids = new Set<string>();
  const sheets: Sheet[] = [];
  for (const item of raw.sheets) {
    if (!isRecord(item) || typeof item.id !== 'string' || item.id.length === 0 || ids.has(item.id) || typeof item.name !== 'string') return null;
    if (typeof item.layout !== 'string' || !BOARD_LAYOUTS.includes(item.layout as BoardLayout)) return null;
    const layout = item.layout as BoardLayout;
    if (!Array.isArray(item.panes) || item.panes.length !== paneCount(layout)) return null;
    const panes: (PaneScreen | null)[] = [];
    for (const pane of item.panes) {
      const parsed = parsePane(pane);
      if (parsed === undefined) return null;
      panes.push(parsed);
    }
    if (typeof item.selected !== 'number' || !Number.isInteger(item.selected) || item.selected < 0 || item.selected >= panes.length) return null;
    ids.add(item.id);
    sheets.push(withArrangement(withPrevious({ id: item.id, name: item.name, layout, selected: item.selected, panes }, parsePrevious(item.previous, panes.length)), item.arrangement));
  }
  if (!ids.has(raw.activeSheetId)) return null;
  return { v: 1, activeSheetId: raw.activeSheetId, sheets };
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
const samePanes = (a: Sheet, b: Sheet) => a.layout === b.layout && a.panes.length === b.panes.length && a.panes.every((p, i) => samePane(p, b.panes[i]));
const sameSheet = (a: Sheet, b: Sheet) => a.name === b.name && a.selected === b.selected && samePanes(a, b) && JSON.stringify(a.arrangement) === JSON.stringify(b.arrangement);

/**
 * The one place the board's invariants are enforced after an undo: 1–20 sheets, every sheet's pane array matching its layout, `selected`
 * inside it, and an active sheet that exists. Returns the same object when nothing needed repair, and null for a board with no sheets
 * (nothing to repair it from).
 */
export function normalizeBoard(board: Board): Board | null {
  if (board.sheets.length === 0) return null;
  let changed = false;
  const sheets = board.sheets.slice(0, MAX_SHEETS).map(sheet => {
    const count = paneCount(sheet.layout);
    const fits = sheet.panes.length === count && Number.isInteger(sheet.selected) && sheet.selected >= 0 && sheet.selected < count
      && (sheet.previous === undefined || sheet.previous.length === count);
    const canonical = withArrangement(sheet, sheet.arrangement);
    const arrangementFits = JSON.stringify(canonical.arrangement) === JSON.stringify(sheet.arrangement);
    if (fits && arrangementFits) return sheet;
    if (fits) { changed = true; return canonical; }
    changed = true;
    const fitted = { ...canonical, panes: Array.from({ length: count }, (_, i) => sheet.panes[i] ?? null), selected: Number.isInteger(sheet.selected) && sheet.selected >= 0 && sheet.selected < count ? sheet.selected : 0 };
    return withPrevious(fitted, sheet.previous && Array.from({ length: count }, (_, i) => sheet.previous![i] ?? null));
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
  return mapSheet(board, sheetId, s => (index < 0 || index >= s.panes.length || s.selected === index ? s : { ...s, selected: index }));
}

/** Puts a whole new screen (or nothing) in a pane: a clear, an insert or a replace, so the pane's `이전 화면` goes. */
export function setPane(board: Board, sheetId: string, index: number, screen: PaneScreen | null): Board {
  return mapSheet(board, sheetId, s => (index < 0 || index >= s.panes.length ? s
    : setPreviousAt({ ...s, panes: s.panes.map((p, i) => (i === index ? screen : p)) }, index, null)));
}

/**
 * A pane edits its own screen (`PaneScreenProvider.onChange`). A `push` to another menu keeps the screen it leaves as the pane's one
 * `이전 화면`; a replace or a write inside the same menu leaves `previous` alone (docs/16 §4).
 */
export function editPane(board: Board, sheetId: string, index: number, next: PaneScreen, how: 'push' | 'replace'): Board {
  return mapSheet(board, sheetId, s => {
    if (index < 0 || index >= s.panes.length) return s;
    const old = s.panes[index];
    const moved = how === 'push' && old !== null && old.menuId !== next.menuId;
    const edited = { ...s, panes: s.panes.map((p, i) => (i === index ? next : p)) };
    return moved ? setPreviousAt(edited, index, old) : edited;
  });
}

/** `이전 화면`: the pane shows its previous screen again and forgets it. No-op without one. */
export function goBackPane(board: Board, sheetId: string, index: number): Board {
  return mapSheet(board, sheetId, s => {
    const back = index >= 0 && index < s.panes.length ? previousAt(s, index) : null;
    return back === null ? s : setPreviousAt({ ...s, panes: s.panes.map((p, i) => (i === index ? back : p)) }, index, null);
  });
}


/**
 * One pane an action changed: what it held and what the action left. `fresh` marks a whole new screen (replace, duplicate), which
 * also drops the pane's `이전 화면`; without it only the pane's own Context changed and `previous` stays.
 */
export type PaneEdit = { index: number; before: PaneScreen | null; after: PaneScreen | null; fresh?: boolean };

/** Writes one edit's pane. A Context-only edit leaves the pane's `previous` alone; a whole new screen (or none) goes through `setPane`. */
function writeEdit(board: Board, sheetId: string, edit: PaneEdit, screen: PaneScreen | null): Board {
  return edit.fresh || edit.before === null || edit.after === null
    ? setPane(board, sheetId, edit.index, screen)
    : mapSheet(board, sheetId, s => (edit.index >= s.panes.length ? s : { ...s, panes: s.panes.map((p, i) => (i === edit.index ? screen : p)) }));
}

export function applyPaneEdits(board: Board, sheetId: string, edits: readonly PaneEdit[]): Board {
  return edits.reduce((b, edit) => writeEdit(b, sheetId, edit, edit.after), board);
}

/** Undo of `applyPaneEdits`. Null — nothing restored — unless every edited pane still holds what the action left. */
export function revertPaneEdits(board: Board, sheetId: string, edits: readonly PaneEdit[]): Board | null {
  const sheet = board.sheets.find(s => s.id === sheetId);
  if (!sheet || edits.some(e => e.index >= sheet.panes.length || !samePane(sheet.panes[e.index], e.after))) return null;
  return normalizeBoard(edits.reduce((b, edit) => writeEdit(b, sheetId, edit, edit.before), board));
}

/** A new sheet holding one screen, active. Null at the 20-sheet limit. */
export function openScreenInNewSheet(board: Board, prefix: string, screen: PaneScreen): Board | null {
  if (board.sheets.length >= MAX_SHEETS) return null;
  const added = addSheet(board, prefix);
  return setPane(added, added.activeSheetId, 0, screen);
}

/** Undo of a pane clear. Null — nothing restored — unless the slot is still there and still empty. */
export function restorePane(board: Board, sheetId: string, index: number, screen: PaneScreen): Board | null {
  const sheet = board.sheets.find(s => s.id === sheetId);
  if (!sheet || index >= sheet.panes.length || sheet.panes[index] !== null) return null;
  return normalizeBoard(setPane(board, sheetId, index, screen));
}

/** How many panes with a screen a layout change would drop. Empty overflow panes cost nothing. */
export function droppedPaneCount(sheet: Sheet, layout: BoardLayout): number {
  return sheet.panes.slice(paneCount(layout)).filter(p => p !== null).length;
}

/** `before` is the sheet as it was, `after` as the change left it; the undo applies only while the sheet still is `after`. */
export type LayoutChange = { sheetId: string; before: Sheet; after: Sheet; layout: BoardLayout };

export function setLayout(board: Board, sheetId: string, layout: BoardLayout): Board {
  return mapSheet(board, sheetId, s => {
    if (s.layout === layout) return s;
    const count = paneCount(layout);
    const panes = Array.from({ length: count }, (_, i) => s.panes[i] ?? null);
    return withPrevious({ ...s, layout, panes, selected: s.selected < count ? s.selected : 0 }, s.previous && Array.from({ length: count }, (_, i) => s.previous![i] ?? null));
  });
}

/**
 * Undo of a layout shrink: brings back the layout and the dropped panes. Null — nothing restored — unless the sheet's layout and panes
 * are still what the shrink left, so nothing edited since is overwritten. The selection returns only if nothing moved it since.
 */
export function restoreLayout(board: Board, change: LayoutChange): Board | null {
  const sheet = board.sheets.find(s => s.id === change.sheetId);
  if (!sheet || !samePanes(sheet, change.after)) return null;
  const selected = sheet.selected === change.after.selected ? change.before.selected : sheet.selected;
  return normalizeBoard(mapSheet(board, change.sheetId, s => withPrevious({ ...s, layout: change.before.layout, panes: change.before.panes, selected }, change.before.previous)));
}

/** A board as it is opened: the first pane of every sheet selected (docs/16 §4). The stored selection is never used for arrival. */
export const atFirstPanes = (board: Board): Board => (board.sheets.every(s => s.selected === 0) ? board : { ...board, sheets: board.sheets.map(s => (s.selected === 0 ? s : { ...s, selected: 0 })) });
