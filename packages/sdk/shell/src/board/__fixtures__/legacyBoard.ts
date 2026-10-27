import { gridOf, parseBoardV2, screens, selectedIndex, type Board, type Sheet } from '../boardModel';
import { dropIdleBoardSessionsForTests } from '../boardSession';
import { migrateV1, type BoardV1, type SheetV1 } from '../boardMigrate';

/**
 * Board tests describe a board the way it was stored before the Dockview board (a grid layout, pane arrays by pane number): `seed` writes
 * that V1 value, so every such test also goes through the migration, and `stored` reads what the screen saved back in the same terms.
 */
export const V1_KEY = 'platform:board:u1';
export const V2_KEY = 'platform:board:v2:u1';

export const legacySheet = (id: string, over: Partial<SheetV1> = {}): SheetV1 => ({ id, name: id, layout: '1x1', selected: 0, panes: [null], ...over });
export const legacyBoard = (sheets: SheetV1[], active = sheets[0].id): BoardV1 => ({ v: 1, activeSheetId: active, sheets });

/** The V2 board a V1 description migrates to. */
export const v2Board = (board: BoardV1): Board => migrateV1(board)!;
/** One V2 sheet from a V1 sheet description. */
export const v2Sheet = (id: string, over: Partial<SheetV1> = {}): Sheet => v2Board(legacyBoard([legacySheet(id, over)])).sheets[0];

export function toLegacySheet(sheet: Sheet): SheetV1 {
  const previous = sheet.panes.map(p => p.previous);
  return {
    ...(sheet.gridMemory ? { arrangement: sheet.gridMemory } : {}), id: sheet.id, name: sheet.name, layout: gridOf(sheet).layout, selected: selectedIndex(sheet), panes: screens(sheet),
    ...(previous.some(p => p !== null) ? { previous } : {}),
  };
}
export const toLegacy = (board: Board): BoardV1 => ({ v: 1, activeSheetId: board.activeSheetId, sheets: board.sheets.map(toLegacySheet) });

/** Makes the stored board exactly `board`: the V1 value is set and any V2 value is gone, so a test can re-seed mid-way as another tab would. */
/** Seeding is a fresh start: a session of the last mount (still held for one tick after its cleanup) must not answer for the new storage. */
export const seedLegacy = (board: unknown) => { dropIdleBoardSessionsForTests(); localStorage.removeItem(V2_KEY); localStorage.setItem(V1_KEY, JSON.stringify(board)); };
/** The board as stored now, as V1 terms: the V2 value if the screen wrote one, else the migrated V1 value. The raw selection is kept (a load resets it to pane 1). */
export function storedLegacy(): BoardV1 {
  const v2 = localStorage.getItem(V2_KEY);
  const board = v2 !== null ? parseBoardV2(JSON.parse(v2)) : migrateV1(JSON.parse(localStorage.getItem(V1_KEY)!));
  return toLegacy(board!);
}
