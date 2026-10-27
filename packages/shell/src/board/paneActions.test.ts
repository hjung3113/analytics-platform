import { admitPaneScreen, canMountPaneScreen } from './boardMenus';
import { House } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { parseQuery, groupId, spaceId } from '@ap/contracts';
import { createRegistry } from '@ap/kernel';
import { type PaneScreen } from '@ap/kernel/host';
import { noContext, testSpace } from '@ap/kernel/testing';
import { applyContextToSheet, contextValues, defaultQuery, copyContextToSheet, paneSignals, replacementScreen } from './paneActions';
import { boardText, hasFinalConsonant } from './text';
import { v2Sheet } from './__fixtures__/legacyBoard';

const features = { export: false, savedView: false, annotate: false, compare: false, board: true };
const entry = (id: string, path: string, over: Record<string, unknown> = {}) => ({
  id, group: groupId('equipment'), label: { ko: id, en: id }, description: { ko: '', en: '' }, path, icon: House, permission: 'platform:view' as const,
  requiresScope: false, context: { ...noContext, time: 'apply' as const, condition: 'apply' as const, lot: 'apply' as const }, pageType: 'analysis' as const,
  features, pageKeys: ['tab'], ...over,
});
const registry = createRegistry({
  spaces: [testSpace({ homeMenuId: 'home' })],
  groups: [{ id: groupId('equipment'), label: { ko: '그룹', en: 'Group' }, icon: House, space: spaceId('mars') }],
  menus: [
    { ...entry('home', '/', { features: { ...features, board: false } }), primary: true },
    entry('alpha', '/alpha'),
    entry('beta', '/beta'),
    entry('locked', '/locked', { permission: 'console:access' }),
  ],
});
const canOpen = (menuId: string) => menuId !== 'locked';
const pane = (query: string, menuId = 'alpha') => ({ menuId, params: {}, query });
const sheet = (panes: (PaneScreen | null)[]) => v2Sheet('s', { layout: '1x2', panes });
const condition = (axis: string) => `?equipmentGroup=${encodeURIComponent(JSON.stringify({ axis, id: 'X' }))}`;
const differing = (panes: (PaneScreen | null)[]) => paneSignals(registry, canOpen, panes, '없음').map(signal => signal?.differing.map(row => row.key) ?? null);

describe('paneSignals compares the Context itself, not its displayed text', () => {
  it('a Condition on another axis with the same id differs', () => {
    expect(differing([pane(condition('stgroup')), pane(condition('team'))])).toEqual([['condition'], ['condition']]);
    expect(differing([pane(condition('team')), pane(condition('team'))])).toEqual([[], []]);
  });

  it('periods that differ only by seconds differ', () => {
    const at = (second: string) => pane(`?from=2026-09-01T00:00:${second}&to=2026-09-02T00:00:00`);
    expect(differing([at('01'), at('59')])).toEqual([['time'], ['time']]);
    expect(differing([at('01'), at('01')])).toEqual([[], []]);
  });

  it('periods that differ only by year differ although the display drops the year', () => {
    const year = (y: string) => pane(`?from=${y}-09-25T09:00:00&to=${y}-09-26T09:00:00`);
    expect(differing([year('2025'), year('2026')])).toEqual([['time'], ['time']]);
    expect(differing([year('2026'), year('2026')])).toEqual([[], []]);
  });

  it('shows the period in the one display rule', () => {
    const { global } = parseQuery('?from=2026-09-25T09:00:00&to=2026-09-26T09:00:00');
    expect(contextValues(global, '없음').find(e => e.key === 'time')?.value).toBe('09-25 09:00 → 09-26 09:00 (24h)');
  });
});

describe('paneCleared particle', () => {
  it('follows the final consonant of the Korean number reading', () => {
    const particle = (n: number) => boardText('ko').paneCleared(n).replace(/^칸 \d+/, '').slice(0, 1);
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(particle)).toEqual(['을', '를', '을', '를', '를', '을', '을', '을', '를', '을']);
    expect(hasFinalConsonant(10)).toBe(true);
    expect(boardText('en').paneCleared(2)).toBe('Cleared pane 2');
  });
});

describe('Context is inherited only from a pane the role can mount', () => {
  const secret = '?lotIds=SECRET&from=2026-09-01T00:00:00&to=2026-09-02T00:00:00';
  const beta = registry.matchRoute('/beta')!.menu;

  it('a denied pane\'s saved Context never reaches the replacing screen; a fresh screen takes the given default instead', () => {
    const replaced = replacementScreen(registry, canOpen, pane(secret, 'locked'), beta, '?from=2026-01-01T00:00:00&to=2026-01-02T00:00:00');
    expect(replaced.query).not.toContain('SECRET');
    expect(parseQuery(replaced.query, []).global.from).toBe('2026-01-01T00:00:00');
  });

  it('a mountable pane still hands its Context to the replacing screen', () => {
    const replaced = replacementScreen(registry, canOpen, pane(secret), beta, '');
    expect(parseQuery(replaced.query, []).global.lotIds).toEqual(['SECRET']);
  });

  it('a denied pane is neither a source for apply-to-all nor for the sheet copy', () => {
    const denied = sheet([pane(secret, 'locked'), pane('?from=2026-08-01T00:00:00&to=2026-08-02T00:00:00')]);
    expect(applyContextToSheet(registry, canOpen, denied, 0)).toBeNull();
    expect(copyContextToSheet(registry, canOpen, denied, sheet([pane('?from=2026-08-01T00:00:00&to=2026-08-02T00:00:00'), pane('?from=2026-08-01T00:00:00&to=2026-08-02T00:00:00')]))).toEqual([]);
  });
});

describe('board pane admission', () => {
  it('does not mount an admitted pane when canOpen rejects its menu id', () => {
    const screen = pane('');
    expect(admitPaneScreen(registry, screen)).toBe(true);
    expect(canMountPaneScreen(registry, id => id !== 'alpha', screen)).toBe(false);
  });
});

describe('defaultQuery', () => {
  it('returns an empty query for a malformed Context address', () => {
    expect(defaultQuery(registry, [{ menuId: 'alpha', url: '/alpha?from=bad' }])).toBe('');
  });

  it('rethrows unexpected registry errors', () => {
    const broken = { ...registry, get menus(): typeof registry.menus { throw new Error('registry failure'); } };
    expect(() => defaultQuery(broken, [{ menuId: 'alpha', url: '/alpha?lotIds=LOT' }])).toThrow('registry failure');
  });

  it('copies only Context from the latest address and handles no recent query', () => {
    expect(parseQuery(defaultQuery(registry, [{ menuId: 'alpha', url: '/alpha?lotIds=LOT&tab=detail&unknown=x' }]), []).global.lotIds).toEqual(['LOT']);
    expect(defaultQuery(registry, [{ menuId: 'alpha', url: '/alpha?tab=detail' }])).not.toContain('tab');
    expect(defaultQuery(registry, [])).toBe('');
    expect(defaultQuery(registry, [{ menuId: 'alpha', url: '/alpha' }])).toBe('');
  });
});

describe('Condition basis and global Line/PRC copy (#552)', () => {
  it('copies the complete map, basis and site-bound sets without changing Selection', () => {
    const source = pane(`?equipmentGroup=${encodeURIComponent(JSON.stringify({ alpha: ['A', 'B'], beta: ['C'] }))}&membershipBasis=asOf&lineNames=L&prcGroups=P&selectedEquipmentIds=E`);
    const s = sheet([source, pane('?selectedEquipmentIds=OTHER')]);
    const { edits } = applyContextToSheet(registry, canOpen, s, 0)!;
    expect(edits).toHaveLength(1);
    const copied = parseQuery(edits[0].after!.query).global;
    expect(copied).toMatchObject({ condition: { alpha: ['A', 'B'], beta: ['C'] }, membershipBasis: 'asOf', lineNames: ['L'], prcGroups: ['P'], selection: ['E'] });
  });
});
