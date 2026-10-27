import type { MenuView, SavedView, SavedViewSupport } from '@ap/contracts';
import { describe, expect, it } from 'vitest';
import { diagnoseSavedView, type DiagnoseContext } from './diagnose.js';

const sharing = { visibility: { kind: 'private' }, approval: 'none' } as const;
const menuView = (over: Partial<MenuView> = {}): SavedView =>
  ({
    id: 'v1',
    schemaVersion: 1,
    kind: 'menu-view',
    name: 'Secret name',
    ownerId: 'u1',
    version: 3,
    updatedAt: 1,
    menuId: 'm',
    menuSchemaVersion: 1,
    context: { condition: { fab: ['F1'] }, selection: ['E1', 'E2'] },
    page: { tab: ['a'] },
    chartOptions: { metricVersion: 2 },
    layout: null,
    panels: null,
    ...sharing,
    ...over,
  }) as SavedView;

const support = (over: Partial<SavedViewSupport> = {}): SavedViewSupport => ({
  menuId: 'm',
  menuSchemaVersion: 1,
  contextKeys: ['condition', 'selection', 'time'],
  pageKeys: ['tab'],
  ...over,
});
const ctx = (over: Partial<DiagnoseContext> = {}): DiagnoseContext => ({
  capabilities: { canView: true },
  knownAxisIds: ['fab'],
  knownSelectionIds: ['E1', 'E2'],
  currentMetricVersion: 2,
  ...over,
});

describe('diagnoseSavedView', () => {
  it('returns ok when nothing is stale', () => {
    expect(diagnoseSavedView(menuView(), support(), ctx())).toEqual({ status: 'ok', reasons: [] });
  });

  it.each([
    ['time', { from: '2026-09-25T09:00:00', to: '2026-09-26T09:00:00' }, ['time']],
    ['time (relative)', { relativePeriod: { hours: 24 } }, ['time']],
    ['line', { lineNames: ['L1'] }, ['line']],
    ['prcGroup + basis', { prcGroups: ['G'], membershipBasis: 'asOf' }, ['prcGroup']],
    ['condition basis', { condition: { fab: ['A'] }, membershipBasis: 'asOf' }, ['condition']],
  ] as const)('accepts a %s context declared once by its menu key', (_n, context, keys) => {
    const d = diagnoseSavedView(menuView({ context: context as never }), support({ contextKeys: keys }), ctx());
    expect(d).toEqual({ status: 'ok', reasons: [] });
  });

  it.each([
    ['stale context key', menuView({ context: { lineNames: ['L'] } }), support(), ctx(), { code: 'stale-context-key', key: 'lineNames' }],
    ['stale page key', menuView({ page: { old: ['x'] } }), support(), ctx(), { code: 'stale-page-key', key: 'old' }],
    ['stale page key in pairs', menuView({ page: [['old', 'x']] }), support(), ctx(), { code: 'stale-page-key', key: 'old' }],
    ['menu schema version', menuView(), support({ menuSchemaVersion: 2 }), ctx(), { code: 'menu-schema-version' }],
    ['metric version', menuView(), support(), ctx({ currentMetricVersion: 3 }), { code: 'metric-version' }],
    ['unknown axis', menuView(), support(), ctx({ knownAxisIds: ['line'] }), { code: 'unknown-axis', key: 'fab' }],
    ['invalid selection', menuView(), support(), ctx({ knownSelectionIds: ['E1'] }), { code: 'invalid-selection', key: 'E2' }],
  ] as const)('reports %s as stale with its reason', (_n, view, sup, c, reason) => {
    const d = diagnoseSavedView(view, sup, c);
    expect(d.status).toBe('stale');
    expect(d.reasons).toContainEqual(reason);
  });

  describe('migration keeps every saved constraint', () => {
    const mv = (context: MenuView['context']) => menuView({ context });
    const run = (view: SavedView, over: Partial<MenuView['context']>, dropKeys: string[] = []) =>
      diagnoseSavedView(view, support({
        menuSchemaVersion: 2,
        contextKeys: ['condition', 'selection', 'time', 'roomNames'],
        migrate: (_f, v) => {
          const context: Record<string, unknown> = { ...v.context, ...over };
          for (const k of dropKeys) delete context[k];
          return { ok: true, view: { ...v, menuSchemaVersion: 2, context: context as MenuView['context'] }, preview: [] };
        },
      }), ctx());

    it.each([
      ['explicit empty selection becomes null', mv({ selection: [] }), { selection: null }, []],
      ['explicit empty selection is dropped', mv({ selection: [] }), {}, ['selection']],
      ['room names are dropped', mv({ roomNames: ['R1'] }), {}, ['roomNames']],
      ['room names are widened', mv({ roomNames: ['R1'] }), { roomNames: ['R1', 'R2'] }, []],
      ['period is changed', mv({ from: '2026-01-01', to: '2026-01-02' }), { to: '2026-02-01' }, []],
    ] as [string, SavedView, Partial<MenuView['context']>, string[]][])('refuses when %s', (_n, view, over, drop) => {
      const d = run(view, over, drop);
      expect(d.status).toBe('stale');
      if (d.status !== 'stale') return;
      expect(d.migration).toBeUndefined();
      expect(d.reselect?.keep).toEqual(view.context);
    });

    it('accepts an explicit empty selection and reordered sets kept as they were', () => {
      const d = run(mv({ selection: [], condition: { fab: ['F1', 'F2'] } }), { condition: { fab: ['F2', 'F1'] } });
      expect(d.status === 'stale' && d.migration?.apply().context.selection).toEqual([]);
    });
  });

  describe('migration', () => {
    const upgrade = (over: Partial<MenuView['context']> = {}): SavedViewSupport['migrate'] => (_from, v) => ({
      ok: true,
      view: { ...v, menuSchemaVersion: 2, context: { ...v.context, ...over } },
      preview: [{ key: 'page.tab', before: 'a', after: 'b' }],
    });

    it('offers a preview and applies without touching sharing, owner or the global selection, even with panels', () => {
      const view = menuView({ panels: { narrow: { selection: ['E1'] } } });
      const d = diagnoseSavedView(view, support({ menuSchemaVersion: 2, migrate: upgrade() }), ctx());
      expect(d.status).toBe('stale');
      if (d.status !== 'stale' || !d.migration) throw new Error('expected a migration');
      expect(d.migration.preview).toEqual([{ key: 'page.tab', before: 'a', after: 'b' }]);
      const next = d.migration.apply();
      expect(next).toMatchObject({ id: 'v1', ownerId: 'u1', version: 3, menuSchemaVersion: 2, visibility: { kind: 'private' }, approval: 'none' });
      expect(next.context.selection).toEqual(['E1', 'E2']);
      expect(next.context.condition).toEqual({ fab: ['F1'] });
      expect(view).toMatchObject({ menuSchemaVersion: 1 });
    });

    it.each([
      ['migrate is not declared', support({ menuSchemaVersion: 2 })],
      ['migrate refuses', support({ menuSchemaVersion: 2, migrate: () => ({ ok: false, reason: 'no' }) })],
      ['migrate leaves the version behind', support({ menuSchemaVersion: 2, migrate: (_f, v) => ({ ok: true, view: v, preview: [] }) })],
      ['migrate drops the condition (unconstrained)', support({ menuSchemaVersion: 2, migrate: upgrade({ condition: null }) })],
      ['migrate drops an axis', support({ menuSchemaVersion: 2, migrate: upgrade({ condition: {} }) })],
      ['migrate empties the selection (all)', support({ menuSchemaVersion: 2, migrate: upgrade({ selection: [] }) })],
      ['migrate nulls the selection', support({ menuSchemaVersion: 2, migrate: upgrade({ selection: null }) })],
      ['migrate narrows the selection', support({ menuSchemaVersion: 2, migrate: upgrade({ selection: ['E1'] }) })],
      ['migrate swaps the selection', support({ menuSchemaVersion: 2, migrate: upgrade({ selection: ['E1', 'E3'] }) })],
      ['migrate widens an axis', support({ menuSchemaVersion: 2, migrate: upgrade({ condition: { fab: ['F1', 'F2'] } }) })],
      ['migrate swaps an axis value', support({ menuSchemaVersion: 2, migrate: upgrade({ condition: { fab: ['F2'] } }) })],
      ['migrate adds an axis', support({ menuSchemaVersion: 2, migrate: upgrade({ condition: { fab: ['F1'], line: ['L'] } }) })],
    ])('keeps the saved conditions and asks to reselect when %s', (_n, sup) => {
      const view = menuView();
      const d = diagnoseSavedView(view, sup, ctx());
      expect(d.status).toBe('stale');
      if (d.status !== 'stale') return;
      expect(d.migration).toBeUndefined();
      expect(d.reselect?.keep).toEqual({ condition: { fab: ['F1'] }, selection: ['E1', 'E2'] });
    });
  });

  it.each([
    ['unknown axis', menuView(), ctx({ knownAxisIds: ['line'] }), 'condition', { fab: ['F1'] }],
    ['unknown selection', menuView(), ctx({ knownSelectionIds: [] }), 'selection', ['E1', 'E2']],
  ])('never drops an invalid %s to widen the view', (_n, view, c, key, saved) => {
    const d = diagnoseSavedView(view, support(), c);
    expect(d.status).toBe('stale');
    if (d.status !== 'stale') return;
    expect(d.migration).toBeUndefined();
    expect(d.reselect?.keep[key as 'condition' | 'selection']).toEqual(saved);
  });

  it('gives only the allowed info when the viewer lacks permission', () => {
    const d = diagnoseSavedView(menuView(), support(), ctx({ capabilities: { canView: false, reason: 'Scope 밖' } }));
    expect(d).toEqual({ status: 'denied', reasons: [{ code: 'denied', message: 'Scope 밖' }] });
    expect(JSON.stringify(d)).not.toContain('Secret name');
  });

  it('keeps denied ahead of staleness', () => {
    const d = diagnoseSavedView(menuView(), support({ menuSchemaVersion: 2 }), ctx({ capabilities: { canView: false } }));
    expect(d).toEqual({ status: 'denied', reasons: [{ code: 'denied' }] });
  });

  it('diagnoses a condition set against the declared context keys', () => {
    const set: SavedView = { id: 's', schemaVersion: 1, kind: 'condition-set', name: 'n', ownerId: 'u', version: 1, updatedAt: 1, context: { roomNames: ['R'] }, ...sharing };
    const d = diagnoseSavedView(set, support(), ctx());
    expect(d.status).toBe('stale');
    expect(d.reasons).toContainEqual({ code: 'stale-context-key', key: 'roomNames' });
  });
});
