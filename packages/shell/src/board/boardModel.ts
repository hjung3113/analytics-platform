import type { PaneScreen } from '@ap/kernel';

/** `rows x columns`; panes are numbered row by row, so `1x2` is two side by side and `2x1` two stacked. */
export type BoardLayout = '1x1' | '1x2' | '2x1' | '2x2';
export const BOARD_LAYOUTS: readonly BoardLayout[] = ['1x1', '1x2', '2x1', '2x2'];
export const MAX_SHEETS = 20;

export type Sheet = { id: string; name: string; layout: BoardLayout; selected: number; panes: (PaneScreen | null)[] };
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
    sheets.push({ id: item.id, name: item.name, layout, selected: item.selected, panes });
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

export type RemovedSheet = { sheet: Sheet; index: number; wasActive: boolean; replacement: string | null };

/** Removes a sheet. The last sheet is replaced by an empty one (`replacement` is its id) so a board always has a sheet. */
export function removeSheet(board: Board, id: string, prefix: string): { board: Board; removed: RemovedSheet } | null {
  const index = board.sheets.findIndex(s => s.id === id);
  if (index === -1) return null;
  const sheet = board.sheets[index];
  const wasActive = board.activeSheetId === id;
  if (board.sheets.length === 1) {
    const blank = newSheet(`${prefix} 1`, new Set([id]));
    return { board: { ...board, activeSheetId: blank.id, sheets: [blank] }, removed: { sheet, index, wasActive, replacement: blank.id } };
  }
  const sheets = board.sheets.filter(s => s.id !== id);
  const activeSheetId = wasActive ? sheets[Math.min(index, sheets.length - 1)].id : board.activeSheetId;
  return { board: { ...board, activeSheetId, sheets }, removed: { sheet, index, wasActive, replacement: null } };
}

/** Undo of `removeSheet`: puts the sheet back where it was; a replacement sheet is dropped only if it is still untouched. */
export function restoreSheet(board: Board, removed: RemovedSheet): Board {
  if (board.sheets.some(s => s.id === removed.sheet.id)) return board;
  let sheets = board.sheets;
  if (removed.replacement !== null) {
    const blank = sheets.find(s => s.id === removed.replacement);
    if (blank && blank.panes.every(p => p === null) && blank.layout === '1x1') sheets = sheets.filter(s => s.id !== removed.replacement);
  }
  const at = Math.min(removed.index, sheets.length);
  const next = [...sheets.slice(0, at), removed.sheet, ...sheets.slice(at)];
  return { ...board, sheets: next, activeSheetId: removed.wasActive ? removed.sheet.id : (next.some(s => s.id === board.activeSheetId) ? board.activeSheetId : removed.sheet.id) };
}

export function selectPane(board: Board, sheetId: string, index: number): Board {
  return mapSheet(board, sheetId, s => (index < 0 || index >= s.panes.length || s.selected === index ? s : { ...s, selected: index }));
}

export function setPane(board: Board, sheetId: string, index: number, screen: PaneScreen | null): Board {
  return mapSheet(board, sheetId, s => (index < 0 || index >= s.panes.length ? s : { ...s, panes: s.panes.map((p, i) => (i === index ? screen : p)) }));
}

/** Undo of a pane clear: only a slot that is still empty gets its screen back, so a screen placed meanwhile is never overwritten. */
export function restorePane(board: Board, sheetId: string, index: number, screen: PaneScreen): Board {
  return mapSheet(board, sheetId, s => (index < s.panes.length && s.panes[index] === null ? { ...s, panes: s.panes.map((p, i) => (i === index ? screen : p)) } : s));
}

/** How many panes with a screen a layout change would drop. Empty overflow panes cost nothing. */
export function droppedPaneCount(sheet: Sheet, layout: BoardLayout): number {
  return sheet.panes.slice(paneCount(layout)).filter(p => p !== null).length;
}

export type LayoutChange = { sheetId: string; before: Sheet; layout: BoardLayout };

export function setLayout(board: Board, sheetId: string, layout: BoardLayout): Board {
  return mapSheet(board, sheetId, s => {
    if (s.layout === layout) return s;
    const count = paneCount(layout);
    const panes = Array.from({ length: count }, (_, i) => s.panes[i] ?? null);
    return { ...s, layout, panes, selected: s.selected < count ? s.selected : 0 };
  });
}

/**
 * Undo of a layout shrink: brings back the layout and only the panes the change dropped (indexes past the new count);
 * the panes that stayed keep whatever they hold now. The selection returns only if nothing moved it since.
 */
export function restoreLayout(board: Board, change: LayoutChange): Board {
  return mapSheet(board, change.sheetId, s => {
    const keep = Math.min(paneCount(change.layout), s.panes.length);
    const panes = change.before.panes.map((p, i) => (i < keep ? s.panes[i] : p));
    const movedBack = change.before.selected >= paneCount(change.layout) && s.selected === 0;
    return { ...s, layout: change.before.layout, panes, selected: movedBack ? change.before.selected : s.selected };
  });
}
