import { describe, expect, it } from 'vitest';
import type { PaneScreen } from '@ap/kernel';
import { MAX_SHEETS, gridOf, layoutShape, paneCount, parseBoardV2, screens, selectedIndex, type Arrangement, type BoardLayout } from './boardModel';
import { migrateV1, parseBoardV1 } from './boardMigrate';
import { legacyBoard, legacySheet, toLegacy } from './__fixtures__/legacyBoard';

const LAYOUTS: BoardLayout[] = ['1x1', '1x2', '2x1', '2x2'];
const shot = (menuId: string, query = ''): PaneScreen => ({ menuId, params: { k: menuId }, query });

describe('parseBoardV1 (the stored shape before the Dockview board)', () => {
  const fresh = () => legacyBoard([legacySheet('a', { name: '시트 1' })]);
  const sheetWith = (over: Record<string, unknown>) => ({ ...fresh(), sheets: [{ ...fresh().sheets[0], ...over }] });

  it('round-trips a board through JSON', () => {
    const board = legacyBoard([legacySheet('a', { layout: '1x2', panes: [null, { menuId: 'a', params: { id: 'x y' }, query: '?tab=2' }] }), legacySheet('b')]);
    expect(parseBoardV1(JSON.parse(JSON.stringify(board)))).toEqual(board);
  });

  it.each([
    ['non-object', 'x'],
    ['a newer version', { ...fresh(), v: 2 }],
    ['no sheets', { ...fresh(), sheets: [] }],
    ['unknown active sheet', { ...fresh(), activeSheetId: 'nope' }],
    ['unknown layout', sheetWith({ layout: '3x3' })],
    ['pane count off', sheetWith({ layout: '1x2' })],
    ['selected out of range', sheetWith({ selected: 3 })],
    ['bad pane', sheetWith({ panes: [{ menuId: 1, params: {}, query: '' }] })],
    ['query without ?', sheetWith({ panes: [{ menuId: 'a', params: {}, query: 'x=1' }] })],
  ])('rejects %s', (_name, value) => {
    expect(parseBoardV1(value)).toBeNull();
    expect(migrateV1(value)).toBeNull();
  });

  it('rejects duplicate sheet ids and more than 20 sheets', () => {
    const board = fresh();
    expect(parseBoardV1({ ...board, sheets: [board.sheets[0], board.sheets[0]] })).toBeNull();
    const full = legacyBoard(Array.from({ length: MAX_SHEETS }, (_, i) => legacySheet(`s${i}`)));
    expect(parseBoardV1(full)).not.toBeNull();
    expect(parseBoardV1({ ...full, sheets: [...full.sheets, legacySheet('extra')] })).toBeNull();
  });

  it('drops a malformed or wrong-length previous and an all-empty one, keeping the board', () => {
    const board = legacyBoard([legacySheet('a', { layout: '1x2', panes: [shot('a'), null] })]);
    for (const previous of [[{ menuId: 1 }, null], [null], [null, null]]) {
      expect(parseBoardV1({ ...board, sheets: [{ ...board.sheets[0], previous }] })?.sheets[0].previous).toBeUndefined();
    }
  });
});

/** A V1 arrangement for `layout` with distinguishable ratios, and `collapsed` panes. */
function custom(layout: BoardLayout, collapsed: number[]): Arrangement {
  const { rows, columns } = layoutShape(layout);
  return {
    columns: columns === 2 ? [30, 70] : [100],
    rows: Array.from({ length: columns }, (_, c) => (rows === 2 ? (c === 0 ? [25, 75] : [60, 40]) : [100])),
    collapsed,
  };
}

/** Every legal collapse set: collapse exists only inside a column and at least one pane of each column stays open. */
function collapseSets(layout: BoardLayout): number[][] {
  const { rows, columns } = layoutShape(layout);
  if (rows === 1) return [[]];
  const perColumn = Array.from({ length: columns }, (_, c) => [null, c, c + columns]);
  return perColumn.reduce<number[][]>((sets, options) => sets.flatMap(set => options.map(o => (o === null ? set : [...set, o]))), [[]]);
}

describe('migrateV1', () => {
  const cases = LAYOUTS.flatMap(layout => collapseSets(layout).flatMap(collapsed => [false, true].flatMap(isCustom => [false, true].map(withPrevious => ({ layout, collapsed, isCustom, withPrevious })))));

  it.each(cases)('keeps everything of a $layout sheet: collapsed $collapsed, custom ratios $isCustom, previous $withPrevious', ({ layout, collapsed, isCustom, withPrevious }) => {
    const count = paneCount(layout);
    const panes = Array.from({ length: count }, (_, i) => (i === 1 && count > 1 ? null : shot(`m${i}`, `?x=${i}`)));
    const arrangement: Arrangement = isCustom ? custom(layout, collapsed) : { ...custom(layout, collapsed), columns: Array(layoutShape(layout).columns).fill(100 / layoutShape(layout).columns), rows: Array.from({ length: layoutShape(layout).columns }, () => Array(layoutShape(layout).rows).fill(100 / layoutShape(layout).rows)) };
    const other = LAYOUTS.find(l => l !== layout && l !== '1x1')!;
    const sheet = legacySheet('a', {
      layout, panes, selected: count - 1, arrangement: { [layout]: arrangement, [other]: custom(other, []) },
      ...(withPrevious ? { previous: panes.map((_, i) => (i % 2 === 0 ? shot(`old${i}`) : null)) } : {}),
    });
    for (const sheets of [1, MAX_SHEETS]) {
      const board = legacyBoard(Array.from({ length: sheets }, (_, i) => ({ ...sheet, id: `s${i}`, name: `시트 ${i + 1}` })), `s${sheets - 1}`);
      const v1 = parseBoardV1(board)!;
      const migrated = migrateV1(board)!;
      // A valid V2 board that survives storage.
      expect(parseBoardV2(JSON.parse(JSON.stringify(migrated)))).toEqual(migrated);
      expect(migrated.v).toBe(2);
      expect(migrated.activeSheetId).toBe(`s${sheets - 1}`);
      const first = migrated.sheets[0];
      // Pane order, screens, previous, selection, layout, ratios and collapsed panes are what V1 held.
      expect(screens(first)).toEqual(panes);
      expect(first.panes.map(p => p.previous)).toEqual(withPrevious ? panes.map((_, i) => (i % 2 === 0 ? shot(`old${i}`) : null)) : panes.map(() => null));
      expect(selectedIndex(first)).toBe(count - 1);
      expect(new Set(first.panes.map(p => p.id)).size).toBe(count);
      const grid = gridOf(first);
      expect(grid.layout).toBe(layout);
      expect(grid.arrangement).toEqual(arrangement);
      // Other layouts' arrangements are remembered, and the whole board reads back as the V1 board it came from.
      expect(first.gridMemory?.[other]).toEqual(custom(other, []));
      expect(toLegacy(migrated)).toEqual(v1);
    }
  });

  it('gives each sheet its own pane ids and keeps sheet names and order', () => {
    const migrated = migrateV1(legacyBoard([legacySheet('a', { layout: '1x2', panes: [null, null] }), legacySheet('b', { layout: '2x2', panes: [null, null, null, null] })]))!;
    expect(migrated.sheets.map(s => s.id)).toEqual(['a', 'b']);
    expect(migrated.sheets.map(s => s.panes.length)).toEqual([2, 4]);
    for (const sheet of migrated.sheets) expect(new Set(sheet.panes.map(p => p.id)).size).toBe(sheet.panes.length);
  });

  it('does not change its input', () => {
    const board = legacyBoard([legacySheet('a', { layout: '2x2', panes: [null, null, null, null], arrangement: { '2x2': custom('2x2', [0, 3]) } })]);
    const copy = JSON.parse(JSON.stringify(board));
    migrateV1(board);
    expect(board).toEqual(copy);
  });
});
