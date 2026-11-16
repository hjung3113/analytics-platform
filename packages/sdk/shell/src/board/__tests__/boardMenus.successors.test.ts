import { House } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { groupId, spaceId } from '@ap/contracts';
import { createRegistry } from '@ap/kernel';
import { noContext, testSpace } from '@ap/kernel/testing';
import { boardWithSuccessors, successorScreen } from '../boardMenus';
import { legacyBoard, legacySheet, v2Board } from '../__fixtures__/legacyBoard';

// #2330: a saved pane of a retired menu id opens its successor, with the retired id's page preset.
const features = { export: false, savedView: false, annotate: false, compare: false, board: true };
const entry = (id: string, path: string, over: Record<string, unknown> = {}) => ({
  id, group: groupId('equipment'), label: { ko: id, en: id }, description: { ko: '', en: '' }, path, icon: House, permission: 'platform:view' as const,
  requiresScope: false, context: noContext, pageType: 'analysis' as const, features, pageKeys: ['view', 'tab'], ...over,
});
const declarations = {
  spaces: [testSpace({ homeMenuId: 'hub' })],
  groups: [{ id: groupId('equipment'), label: { ko: '그룹', en: 'Group' }, icon: House, space: spaceId('mars') }],
  menus: [{ ...entry('hub', '/hub'), primary: true }, entry('alpha', '/alpha')],
};
const registry = createRegistry({ ...declarations, retiredMenus: [{ id: 'hub-compare', successor: 'hub', page: { view: 'compare' } }, { id: 'hub-table', successor: 'hub' }] });

describe('board panes of a retired menu id (#2330)', () => {
  it('successorScreen moves the screen to the successor, adds the preset where the query lacks it, and is null otherwise', () => {
    expect(successorScreen(registry, { menuId: 'hub-compare', params: {}, query: '?v=1&tab=a' })).toEqual({ menuId: 'hub', params: {}, query: '?v=1&tab=a&view=compare' });
    expect(successorScreen(registry, { menuId: 'hub-compare', params: {}, query: '?v=1&view=table' })).toEqual({ menuId: 'hub', params: {}, query: '?v=1&view=table' });
    expect(successorScreen(registry, { menuId: 'hub-table', params: {}, query: '?v=1' })).toEqual({ menuId: 'hub', params: {}, query: '?v=1' });
    expect(successorScreen(registry, { menuId: 'alpha', params: {}, query: '?v=1' })).toBeNull();
    expect(successorScreen(registry, { menuId: 'ghost', params: {}, query: '' })).toBeNull();
  });

  it('boardWithSuccessors maps pane screens and the previous screen, and returns the same board when nothing is retired', () => {
    const board = v2Board(legacyBoard([
      legacySheet('a', { layout: '1x2', panes: [{ menuId: 'hub-compare', params: {}, query: '?v=1' }, { menuId: 'alpha', params: {}, query: '?v=1' }], previous: [null, { menuId: 'hub-table', params: {}, query: '?v=2' }] }),
      legacySheet('b', { panes: [null] }),
    ]));
    const mapped = boardWithSuccessors(registry, board);
    expect(mapped.sheets[0]!.panes.map(p => p.screen)).toEqual([{ menuId: 'hub', params: {}, query: '?v=1&view=compare' }, { menuId: 'alpha', params: {}, query: '?v=1' }]);
    expect(mapped.sheets[0]!.panes.map(p => p.previous)).toEqual([null, { menuId: 'hub', params: {}, query: '?v=2' }]);
    expect(mapped.sheets[0]!.panes.map(p => p.id)).toEqual(board.sheets[0]!.panes.map(p => p.id));
    expect(mapped.sheets[1]).toEqual(board.sheets[1]);
    expect(boardWithSuccessors(registry, mapped)).toBe(mapped);
    expect(boardWithSuccessors(createRegistry(declarations), board)).toBe(board);
  });
});
