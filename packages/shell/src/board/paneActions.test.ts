import { House } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { parseQuery } from '@ap/contracts';
import { createRegistry } from '@ap/kernel';
import { noContext, testSpace } from '@ap/kernel/testing';
import { applyContextToSheet, copyContextToSheet, paneSignals, replacementScreen } from './paneActions';
import type { Sheet } from './boardModel';

const features = { export: false, savedView: false, annotate: false, compare: false, board: true };
const entry = (id: string, path: string, over: Record<string, unknown> = {}) => ({
  id, group: 'equipment' as const, label: { ko: id, en: id }, description: { ko: '', en: '' }, path, icon: House, permission: 'platform:view' as const,
  requiresScope: false, context: { ...noContext, time: 'apply' as const, condition: 'apply' as const, lot: 'apply' as const }, pageType: 'analysis' as const,
  features, pageKeys: ['tab'], ...over,
});
const registry = createRegistry({
  spaces: [testSpace({ homeMenuId: 'home' })],
  groups: [{ id: 'equipment', label: { ko: '그룹', en: 'Group' }, icon: House, space: 'analytics' }],
  menus: [
    { ...entry('home', '/', { features: { ...features, board: false } }), primary: true },
    entry('alpha', '/alpha'),
    entry('beta', '/beta'),
    entry('locked', '/locked', { permission: 'console:access' }),
  ],
});
const can = (permission: string) => permission === 'platform:view';
const pane = (query: string, menuId = 'alpha') => ({ menuId, params: {}, query });
const sheet = (panes: Sheet['panes']): Sheet => ({ id: 's', name: 's', layout: '1x2', selected: 0, panes });
const condition = (axis: string) => `?equipmentGroup=${encodeURIComponent(JSON.stringify({ axis, id: 'X' }))}`;
const differing = (panes: Sheet['panes']) => paneSignals(registry, can, panes, '없음').map(signal => signal?.differing.map(row => row.key) ?? null);

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
});

describe('Context is inherited only from a pane the role can mount', () => {
  const secret = '?lotIds=SECRET&from=2026-09-01T00:00:00&to=2026-09-02T00:00:00';
  const beta = registry.matchRoute('/beta')!.menu;

  it('a denied pane\'s saved Context never reaches the replacing screen; a fresh screen takes the given default instead', () => {
    const replaced = replacementScreen(registry, can, pane(secret, 'locked'), beta, '?from=2026-01-01T00:00:00&to=2026-01-02T00:00:00');
    expect(replaced.query).not.toContain('SECRET');
    expect(parseQuery(replaced.query, []).global.from).toBe('2026-01-01T00:00:00');
  });

  it('a mountable pane still hands its Context to the replacing screen', () => {
    const replaced = replacementScreen(registry, can, pane(secret), beta, '');
    expect(parseQuery(replaced.query, []).global.lotIds).toEqual(['SECRET']);
  });

  it('a denied pane is neither a source for apply-to-all nor for the sheet copy', () => {
    const denied = sheet([pane(secret, 'locked'), pane('?from=2026-08-01T00:00:00&to=2026-08-02T00:00:00')]);
    expect(applyContextToSheet(registry, can, denied, 0)).toBeNull();
    expect(copyContextToSheet(registry, can, denied, sheet([pane('?from=2026-08-01T00:00:00&to=2026-08-02T00:00:00'), pane('?from=2026-08-01T00:00:00&to=2026-08-02T00:00:00')]))).toEqual([]);
  });
});
