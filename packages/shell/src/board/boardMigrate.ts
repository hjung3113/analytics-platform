import { isRecord } from '@ap/contracts';
import type { PaneScreen } from '@ap/kernel';
import { withGrid, withGridMemory } from './boardGrid';
import {
  BOARD_LAYOUTS, MAX_SHEETS, defaultArrangement, isDefaultArrangement, makeId, paneCount, parseArrangementEntry, parsePane,
  type Arrangement, type Board, type BoardLayout, type PaneSlot, type Sheet,
} from './boardTypes';

/** The stored shape before the Dockview board (`v: 1`): a grid layout, pane arrays by pane number and per-layout arrangements. Read-only; it is only migrated. */
export type SheetV1 = { arrangement?: Partial<Record<BoardLayout, Arrangement>>; id: string; name: string; layout: BoardLayout; selected: number; panes: (PaneScreen | null)[]; previous?: (PaneScreen | null)[] };
export type BoardV1 = { v: 1; activeSheetId: string; sheets: SheetV1[] };

function parseArrangementV1(value: unknown): SheetV1['arrangement'] {
  if (!isRecord(value)) return undefined;
  const entries: NonNullable<SheetV1['arrangement']> = {};
  for (const layout of BOARD_LAYOUTS) {
    const entry = parseArrangementEntry(value[layout], layout);
    if (entry && !isDefaultArrangement(entry, layout)) entries[layout] = entry;
  }
  return Object.keys(entries).length ? entries : undefined;
}

function parsePreviousV1(value: unknown, count: number): (PaneScreen | null)[] | undefined {
  if (!Array.isArray(value) || value.length !== count) return undefined;
  const previous: (PaneScreen | null)[] = [];
  for (const item of value) {
    const parsed = parsePane(item);
    if (parsed === undefined) return undefined;
    previous.push(parsed);
  }
  return previous.some(p => p !== null) ? previous : undefined;
}

/** Validates a stored V1 value. Anything off — shape, version, counts, duplicate ids — is null, never a partial board. */
export function parseBoardV1(raw: unknown): BoardV1 | null {
  if (!isRecord(raw) || raw.v !== 1 || typeof raw.activeSheetId !== 'string' || !Array.isArray(raw.sheets)) return null;
  if (raw.sheets.length < 1 || raw.sheets.length > MAX_SHEETS) return null;
  const ids = new Set<string>();
  const sheets: SheetV1[] = [];
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
    const sheet: SheetV1 = { id: item.id, name: item.name, layout, selected: item.selected, panes };
    const previous = parsePreviousV1(item.previous, panes.length);
    if (previous) sheet.previous = previous;
    const arrangement = parseArrangementV1(item.arrangement);
    sheets.push(arrangement ? { arrangement, ...sheet } : sheet);
  }
  if (!ids.has(raw.activeSheetId)) return null;
  return { v: 1, activeSheetId: raw.activeSheetId, sheets };
}

function migrateSheet(sheet: SheetV1): Sheet {
  const taken = new Set<string>();
  const panes: PaneSlot[] = sheet.panes.map((screen, i) => {
    const id = makeId('p', taken);
    taken.add(id);
    return { id, screen, previous: sheet.previous?.[i] ?? null };
  });
  const ids = panes.map(p => p.id);
  const base: Sheet = { id: sheet.id, name: sheet.name, panes, selectedPaneId: ids[sheet.selected], tree: { type: 'group', panes: ids, active: ids[0] } };
  // The other layouts' arrangements first, then the current one through `withGrid` (which also writes the tree).
  const seeded = BOARD_LAYOUTS.reduce((acc, layout) => (layout === sheet.layout || !sheet.arrangement?.[layout] ? acc : withGridMemory(acc, layout, sheet.arrangement[layout])), base);
  return withGrid(seeded, sheet.layout, sheet.arrangement?.[sheet.layout] ?? defaultArrangement(sheet.layout));
}

/** A stored V1 value as a V2 board: panes row-major with fresh ids, the current layout as the tree, every layout's arrangement in `gridMemory`. Null if it is not a valid V1 board. */
export function migrateV1(raw: unknown): Board | null {
  const board = parseBoardV1(raw);
  return board && { v: 2, activeSheetId: board.activeSheetId, sheets: board.sheets.map(migrateSheet) };
}
