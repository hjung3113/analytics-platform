import { describe, expect, it } from 'vitest';
import { emptyGlobal, parseQuery, validateSavedView, type SavedViewSupport } from '@ap/contracts';
import { captureApplied, stateKey, viewState } from '../capture';
import { hasExplicitContext, overwritePatch, restoreSavedView, savedStateOf, siteBoundDropped, unsupportedOf } from '../restore';
import { resolveContext } from '../capture';
import { createSupportRegistry } from '../useSavedViewSupport';
import { testSavedView as viewOf } from '../../testing';

const support: SavedViewSupport = { menuId: 'home', menuSchemaVersion: 2, contextKeys: ['time', 'line'], pageKeys: ['filter', 'sort'] };
const anchor = '2026-09-02T00:00:00';
const bare = { global: emptyGlobal, page: [] };
const applied = { global: { ...emptyGlobal, from: '2026-09-01T00:00:00', to: anchor, lineNames: ['L1'], selection: ['E1'] }, page: [['filter', 'a'], ['hover', 'x'], ['returnTo', '/x'], ['other', 'y']] as [string, string][] };
const run = (over: Partial<Parameters<typeof restoreSavedView>[0]>) => restoreSavedView({ view: viewOf({ id: 'v' }), support, current: bare, extras: [], pathname: '/home', anchor, source: 'selected', ...over });

describe('hidden and repeated page pairs (ADR-0105)', () => {
  const hiddenSupport = { ...support, pageKeys: ['filter', 'sort'] };
  const withHidden = { global: { ...emptyGlobal, from: '2026-09-01T00:00:00', to: anchor }, page: [['sort', 'a'], ['filter', 'x'], ['filter', 'y']] as [string, string][] };
  it('a saved menu view stores the page pairs the address omits and restores them in order', () => {
    const state = captureApplied(withHidden, hiddenSupport);
    expect(state.page).toEqual([['filter', 'x'], ['filter', 'y'], ['sort', 'a']]);
    const result = run({ view: viewOf({ id: 'v', kind: 'menu-view', menuId: 'home', menuSchemaVersion: 2, context: state.context, page: state.page }), current: bare });
    expect(result.ok && result.applied && result.href).toContain('filter=x&filter=y&sort=a');
  });
});

describe('repeated values keep their order (F6)', () => {
  const orderSupport = { ...support, pageKeys: ['filter'] };
  const order = (values: string[]) => ({ global: { ...emptyGlobal, from: '2026-09-01T00:00:00', to: anchor }, page: values.map((v): [string, string] => ['filter', v]) });
  it('capture stores z,a as z,a and the two orders are different states', () => {
    expect(captureApplied(order(['z', 'a']), orderSupport).page).toEqual([['filter', 'z'], ['filter', 'a']]);
    expect(stateKey(captureApplied(order(['z', 'a']), orderSupport))).not.toBe(stateKey(captureApplied(order(['a', 'z']), orderSupport)));
  });
});

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
    expect(savedStateOf(view, support, null, null).context).toEqual({ lineNames: ['L1'] });
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


describe('KER-26 declared applied names', () => {
  it.each(['zoomFrom', 'draftId', 'rows', 'dockSide', 'hoverSeries', 'rawData', 'engineState', 'modalOpen', 'openModal'])('round-trips declared page key and Condition axis %s', key => {
    const declared: SavedViewSupport = { ...support, contextKeys: ['condition'], pageKeys: [key, 'returnTo'] };
    const current = { global: { ...emptyGlobal, condition: { [key]: ['E1'] } }, page: [[key, 'applied'], ['returnTo', '/back'], ['draftUndeclared', 'ignored']] as [string, string][] };
    const state = captureApplied(current, declared);
    expect(state).toEqual({ context: { condition: { [key]: ['E1'] } }, page: [[key, 'applied']] });
    const view = viewOf({ id: 'names', kind: 'menu-view', menuId: 'home', menuSchemaVersion: 2, chartOptions: {}, layout: null, panels: null, ...state });
    expect(validateSavedView(view).ok).toBe(true);
    const restored = run({ view, support: declared });
    if (!restored.ok || !restored.applied) throw new Error('view was not restored');
    expect(captureApplied(restored.next, declared)).toEqual(state);
    const decoded = parseQuery(restored.href.slice(restored.href.indexOf('?')), [key]);
    expect(captureApplied(decoded, declared)).toEqual(state);
    expect(viewState({ applied: captureApplied(restored.next, declared), saved: state, draftDirty: [] }).modified).toBe(false);
  });
});

// #2175: a view records the Scope its content was saved in; opened in another Scope it leaves the Site-bound values out. One pure function of the view and the CURRENT Scope.
describe('saved Scope rule (#2175)', () => {
  const siteSupport: SavedViewSupport = { menuId: 'home', menuSchemaVersion: 2, contextKeys: ['time', 'roomNames', 'line', 'prcGroup', 'condition', 'selection'], pageKeys: ['filter'] };
  const context = { from: '2026-08-01T00:00:00', to: '2026-08-02T00:00:00', roomNames: ['PHOTO'], lineNames: ['L1'], prcGroups: ['G1'], selection: ['E1'], membershipBasis: 'asOf' as const };
  const menuView = (over: Record<string, unknown> = {}) => viewOf({ id: 'v', kind: 'menu-view', menuId: 'home', menuSchemaVersion: 2, context, page: [['filter', 'saved']], savedScopeId: 'MEM', ...over } as never);
  const at = (scopeId: string | null) => ({ global: { ...emptyGlobal, scopeId }, page: [] as [string, string][] });
  const restore = (view: ReturnType<typeof menuView>, scopeId: string | null) => {
    const result = restoreSavedView({ view, support: siteSupport, current: at(scopeId), extras: [], pathname: '/home', anchor, source: 'selected' });
    if (!result.ok || !result.applied) throw new Error('unreachable');
    return result;
  };

  it('opened in another Scope it leaves the Site-bound values out and keeps time and page keys', () => {
    const result = restore(menuView(), 'FDRY');
    expect(result.next.global).toMatchObject({ scopeId: 'FDRY', from: '2026-08-01T00:00:00', to: '2026-08-02T00:00:00', roomNames: null, lineNames: null, prcGroups: null, selection: null, membershipBasis: null });
    expect(result.next.page).toEqual([['filter', 'saved']]);
    expect(result.href).not.toMatch(/roomNames|lineNames|prcGroups|selection|membershipBasis/);
    expect(result.excludedByScope.sort()).toEqual(['condition', 'line', 'prcGroup', 'roomNames', 'selection']);
    expect(result.unsupported).toEqual([]);
  });

  it('the same Scope, an old view (no recorded Scope) and a condition set with nothing Site-bound apply as before', () => {
    expect(restore(menuView(), 'MEM').next.global).toMatchObject({ roomNames: ['PHOTO'], lineNames: ['L1'], selection: ['E1'] });
    expect(restore(menuView({ savedScopeId: undefined }), 'FDRY').next.global).toMatchObject({ roomNames: ['PHOTO'], lineNames: ['L1'] });
    expect(restore(menuView({ context: { from: context.from, to: context.to } }), 'FDRY').excludedByScope).toEqual([]);
  });

  it('no current Scope against a recorded one counts as another Scope', () => {
    expect(siteBoundDropped(menuView(), null).length).toBeGreaterThan(0);
    expect(siteBoundDropped(menuView(), 'MEM')).toEqual([]);
    expect(siteBoundDropped(menuView({ savedScopeId: undefined }), null)).toEqual([]);
  });

  it('the dropped set is the Kernel Site-bound list: a field a menu does not support is listed as unsupported, not as excluded', () => {
    const narrow: SavedViewSupport = { ...siteSupport, contextKeys: ['time', 'line'] };
    const result = restoreSavedView({ view: menuView(), support: narrow, current: at('FDRY'), extras: [], pathname: '/home', anchor, source: 'selected' });
    if (!result.ok || !result.applied) throw new Error('unreachable');
    expect(result.excludedByScope).toEqual(['line']);
    expect(result.unsupported.map(u => u.key).sort()).toEqual(['condition', 'prcGroup', 'roomNames', 'selection']);
  });

  it('수정됨 is clear after the drop, and set after the user sets a Site-bound value in the new Scope', () => {
    const view = menuView();
    const restored = restore(view, 'FDRY');
    const saved = savedStateOf(view, siteSupport, anchor, 'FDRY');
    expect(saved.context.lineNames).toBeUndefined();
    expect(viewState({ applied: captureApplied(restored.next, siteSupport), saved, draftDirty: [] }).modified).toBe(false);
    const edited = { global: { ...restored.next.global, lineNames: ['L7'] }, page: restored.next.page };
    expect(viewState({ applied: captureApplied(edited, siteSupport), saved, draftDirty: [] }).modified).toBe(true);
    // Switching the Scope back while the view is selected compares against the full copy again (the same function of the current Scope).
    expect(savedStateOf(view, siteSupport, anchor, 'MEM').context.lineNames).toEqual(['L1']);
  });

  describe('현재 뷰에 저장 across Scopes', () => {
    const narrow: SavedViewSupport = { ...siteSupport, contextKeys: ['time', 'line'] };
    const appliedIn = (scopeId: string) => captureApplied({ global: { ...emptyGlobal, scopeId, from: '2026-08-01T00:00:00', to: '2026-08-02T00:00:00', lineNames: ['L7'] }, page: [] }, narrow);
    it('does not keep the stored Site-bound fields of the other Scope, supported or not, and records the current Scope', () => {
      const patch = overwritePatch(menuView(), appliedIn('FDRY'), narrow, anchor, 'FDRY');
      expect(patch.context).toEqual({ from: '2026-08-01T00:00:00', to: '2026-08-02T00:00:00', lineNames: ['L7'] });
      expect(patch.savedScopeId).toBe('FDRY');
    });
    it('a same-Scope save still keeps what the menu does not support (06 §21.1) and keeps the Scope', () => {
      const patch = overwritePatch(menuView(), appliedIn('MEM'), narrow, anchor, 'MEM');
      expect(patch.context).toMatchObject({ roomNames: ['PHOTO'], prcGroups: ['G1'], selection: ['E1'], lineNames: ['L7'] });
      expect(patch.savedScopeId).toBe('MEM');
    });
    it('an old view records the current Scope on its first save, and no current Scope clears it', () => {
      expect(overwritePatch(menuView({ savedScopeId: undefined }), appliedIn('FDRY'), narrow, anchor, 'FDRY').savedScopeId).toBe('FDRY');
      expect(overwritePatch(menuView(), captureApplied({ global: emptyGlobal, page: [] }, narrow), narrow, anchor, null).savedScopeId).toBeNull();
    });
  });
});
