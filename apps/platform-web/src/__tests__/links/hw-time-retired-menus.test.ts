import { describe, expect, it } from 'vitest';
import { registry } from '../../menus';

// #2330: the four HW Time ids the one-screen menu replaced are retired in the app assembly. Every saved reference to them (old
// address, board pane, favorite, recent visit) opens `hw-time`; the ids themselves are no longer registered.
const RETIRED = ['hw-time-steps', 'hw-time-compare', 'hw-time-overview', 'hw-time-table'];

describe('retired HW Time menus (#2330)', () => {
  it('maps each retired id to hw-time and keeps none registered', () => {
    for (const id of RETIRED) {
      expect(registry.has(id)).toBe(false);
      expect(registry.successorOf(id)?.menu.id).toBe('hw-time');
    }
  });

  it('opens hw-time from the old declared and derived addresses with the query kept', () => {
    const q = '?v=1&scopeId=MEM&from=2026-09-19T09:00:00&to=2026-09-26T09:00:00';
    for (const view of ['steps', 'compare', 'overview', 'table']) {
      expect(registry.matchRoute(`/hw-time/${view}`)).toMatchObject({ menu: { id: 'hw-time' }, viaAlias: true });
      expect(registry.canonicalHref(`/hw-time/${view}${q}`)).toBe(`/mars/hw-time${q}`);
      expect(registry.canonicalHref(`/mars/hw-time-${view}${q}`)).toBe(`/mars/hw-time${q}`);
    }
  });
});
