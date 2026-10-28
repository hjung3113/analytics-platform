import { describe, expect, it } from 'vitest';
import { emptyGlobal, type SavedViewSupport } from '@ap/contracts';
import { captureApplied, viewState } from '../capture';
import { hasExplicitContext, restoreSavedView, savedStateOf, unsupportedOf } from '../restore';
import { resolveContext } from '../capture';
import { createSupportRegistry } from '../useSavedViewSupport';
import { testSavedView as viewOf } from '../../testing';

const support: SavedViewSupport = { menuId: 'home', menuSchemaVersion: 2, contextKeys: ['time', 'line'], pageKeys: ['filter', 'sort'] };
const anchor = '2026-09-02T00:00:00';
const bare = { global: emptyGlobal, page: [] };
const applied = { global: { ...emptyGlobal, from: '2026-09-01T00:00:00', to: anchor, lineNames: ['L1'], selection: ['E1'] }, page: [['filter', 'a'], ['hover', 'x'], ['returnTo', '/x'], ['other', 'y']] as [string, string][] };
const run = (over: Partial<Parameters<typeof restoreSavedView>[0]>) => restoreSavedView({ view: viewOf({ id: 'v' }), support, current: bare, extras: [], pathname: '/home', anchor, source: 'selected', ...over });

describe('captureApplied', () => {
  it('stores only the supported applied keys, never page keys the menu did not declare, transient keys or returnTo', () => {
    expect(captureApplied(applied, support)).toEqual({ context: { from: '2026-09-01T00:00:00', to: anchor, lineNames: ['L1'] }, page: [['filter', 'a']] });
  });
  it('reads the applied address, so an edited draft cannot reach a saved view', () => {
    const draftLike = { global: { ...applied.global, lineNames: ['DRAFT-ONLY'] }, page: applied.page };
    expect(captureApplied(applied, support).context.lineNames).toEqual(['L1']);
    expect(captureApplied(draftLike, support).context.lineNames).toEqual(['DRAFT-ONLY']);
  });
});

describe('viewState', () => {
  const saved = captureApplied(applied, support);
  it.each([
    ['same as saved, nothing pending', saved, saved, [], { modified: false, unsaved: false, unapplied: false }],
    ['applied differs from the selected view', { ...saved, page: [] }, saved, [], { modified: true, unsaved: true, unapplied: false }],
    ['only the draft differs (not applied yet)', saved, saved, ['lineNames'], { modified: false, unsaved: false, unapplied: true }],
    ['no view selected, applied content', saved, null, [], { modified: false, unsaved: true, unapplied: false }],
    ['no view selected, nothing applied', { context: {}, page: [] }, null, [], { modified: false, unsaved: false, unapplied: false }],
    ['modified and a pending draft are both reported', { ...saved, page: [] }, saved, ['filter'], { modified: true, unsaved: true, unapplied: true }],
  ])('%s', (_name, current, savedState, draftDirty, expected) => {
    expect(viewState({ applied: current, saved: savedState, draftDirty })).toEqual(expected);
  });
});

describe('restoreSavedView', () => {
  const menuView = (over = {}) => viewOf({ id: 'v', kind: 'menu-view', menuId: 'home', menuSchemaVersion: 2, context: { from: '2026-08-01T00:00:00', to: '2026-08-02T00:00:00', lineNames: ['L9'] }, page: [['filter', 'saved']], chartOptions: {}, layout: null, panels: null, ...over } as never);
  it('a picked view replaces the supported keys, keeps foreign page keys and extras, and writes one href', () => {
    const result = run({ view: menuView(), current: applied, extras: [['returnTo', '/back']], source: 'selected' });
    expect(result).toMatchObject({ ok: true, applied: true, unsupported: [] });
    if (!result.ok || !result.applied) throw new Error('unreachable');
    expect(result.next.global).toMatchObject({ from: '2026-08-01T00:00:00', lineNames: ['L9'], selection: ['E1'] });
    expect(result.next.page).toEqual([['hover', 'x'], ['returnTo', '/x'], ['other', 'y'], ['filter', 'saved']]);
    expect(result.href).toContain('/home?');
    expect(result.href).toContain('returnTo=%2Fback');
  });
  it('a key the view lacks is cleared, not filled from the current address', () => {
    const result = run({ view: viewOf({ id: 'c', context: {} }), current: applied });
    if (!result.ok || !result.applied) throw new Error('unreachable');
    expect(result.next.global.lineNames).toBeNull();
    expect(result.next.global.from).toBeNull();
  });
  it('Context the menu does not support is left out and listed (06 §6.4)', () => {
    const result = run({ view: viewOf({ id: 'c', context: { lineNames: ['L9'], roomNames: ['R1'], condition: { grp: ['A'] } } }) });
    if (!result.ok || !result.applied) throw new Error('unreachable');
    expect(result.next.global.roomNames).toBeNull();
    expect(result.next.global.condition).toBeNull();
    expect(result.unsupported).toEqual([{ kind: 'context', key: 'roomNames' }, { kind: 'context', key: 'condition' }]);
  });
  it('page keys the menu does not register are listed and not applied', () => {
    const result = run({ view: menuView({ page: [['filter', 'a'], ['gone', 'b']] }) });
    if (!result.ok || !result.applied) throw new Error('unreachable');
    expect(result.unsupported).toEqual([{ kind: 'page', key: 'gone' }]);
    expect(result.href).not.toContain('gone');
  });
  it('a relative period resolves from the server anchor', () => {
    const result = run({ view: viewOf({ id: 'r', context: { relativePeriod: { hours: 24 } } }) });
    if (!result.ok || !result.applied) throw new Error('unreachable');
    expect(result.next.global).toMatchObject({ from: '2026-09-01T00:00:00', to: anchor });
  });
  it('without a server anchor a relative period is left out, never dated from anywhere else', () => {
    const view = viewOf({ id: 'r', context: { relativePeriod: { hours: 24 }, lineNames: ['L1'] } });
    expect(resolveContext(view.context, null)).toEqual({ lineNames: ['L1'] });
    expect(savedStateOf(view, support, null).context).toEqual({ lineNames: ['L1'] });
    expect(unsupportedOf(view, support, null)).toEqual([]);
    const result = run({ view, anchor: null });
    if (!result.ok || !result.applied) throw new Error('unreachable');
    expect(result.next.global.from).toBeNull();
    expect(result.next.global.to).toBeNull();
  });
  it('an absolute view restores the same with or without an anchor', () => {
    const view = menuView();
    expect(run({ view, anchor: null })).toEqual(run({ view }));
  });
  it.each([
    ['another menu', menuView({ menuId: 'other' }), 'wrong-menu'],
    ['an older menu schema', menuView({ menuSchemaVersion: 1 }), 'stale-schema'],
  ])('refuses %s without a patch', (_name, view, reason) => {
    expect(run({ view })).toEqual({ ok: false, reason });
  });
  it.each([
    ['a Context key', { global: { ...emptyGlobal, lineNames: ['L1'] }, page: [] }],
    ['a page key', { global: emptyGlobal, page: [['filter', 'x']] as [string, string][] }],
  ])('the personal default yields to %s in the address and fills nothing', (_name, current) => {
    expect(hasExplicitContext(current)).toBe(true);
    expect(run({ view: viewOf({ id: 'd', context: { lineNames: ['L9'] } }), current, source: 'default' })).toEqual({ ok: true, applied: false, reason: 'explicit-address' });
  });
  it('the personal default applies to a bare route (scope alone is not Context)', () => {
    const current = { global: { ...emptyGlobal, scopeId: 'S1' }, page: [] };
    expect(hasExplicitContext(current)).toBe(false);
    expect(run({ view: viewOf({ id: 'd', context: { lineNames: ['L9'] } }), current, source: 'default' })).toMatchObject({ ok: true, applied: true });
  });
});

describe('PRC group menus keep the membership basis (C1, 06 §6.1)', () => {
  const prc: SavedViewSupport = { menuId: 'home', menuSchemaVersion: 2, contextKeys: ['time', 'prcGroup'], pageKeys: [] };
  const asOf = { global: { ...emptyGlobal, prcGroups: ['G1'], membershipBasis: 'asOf' as const }, page: [] };
  it('stores the basis next to the PRC groups', () => {
    expect(captureApplied(asOf, prc).context).toEqual({ prcGroups: ['G1'], membershipBasis: 'asOf' });
  });
  it('restores the basis with the groups and lists nothing as not applied', () => {
    const result = run({ view: viewOf({ id: 'p', context: { prcGroups: ['G1'], membershipBasis: 'asOf' } }), support: prc });
    if (!result.ok || !result.applied) throw new Error('unreachable');
    expect(result.next.global).toMatchObject({ prcGroups: ['G1'], membershipBasis: 'asOf' });
    expect(result.unsupported).toEqual([]);
  });
  it('a menu with neither Condition nor PRC groups lists the basis instead of applying it', () => {
    const result = run({ view: viewOf({ id: 'p', context: { membershipBasis: 'asOf' } }) });
    if (!result.ok || !result.applied) throw new Error('unreachable');
    expect(result.next.global.membershipBasis).toBeNull();
    expect(result.unsupported).toEqual([{ kind: 'context', key: 'condition' }]);
  });
});

describe('unsupportedOf (C9)', () => {
  it('lists what the menu cannot restore without any address', () => {
    const view = viewOf({ id: 'w', context: { lineNames: ['L1'], roomNames: ['R1'] } });
    expect(unsupportedOf(view, support, anchor)).toEqual([{ kind: 'context', key: 'roomNames' }]);
  });
});

describe('support registry ownership (C8)', () => {
  const a: SavedViewSupport = { ...support };
  const b: SavedViewSupport = { ...support, menuSchemaVersion: 3 };
  it('keeps a declaration while another registration of the same menu is alive', () => {
    const registry = createSupportRegistry();
    const first = registry.register(a);
    const second = registry.register(a);
    first();
    expect(registry.get('home')).toBe(a);
    second();
    expect(registry.get('home')).toBeUndefined();
  });
  it('falls back to the earlier declaration when the latest one is released', () => {
    const registry = createSupportRegistry();
    registry.register(a);
    const latest = registry.register(b);
    expect(registry.get('home')).toBe(b);
    latest();
    expect(registry.get('home')).toBe(a);
  });
});
