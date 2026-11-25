import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDrill, type DrillState } from '../drill';
import { I18nProvider } from '../../i18n';
import { PlatformProvider, useHostPlatform, type ReturnOrigin } from '../../platform/platform';
import { createRegistry, type MenuEntry, type PlatformMenuEntry } from '../../registry/registry';
import { createFakeSavedViewStore, memoryStorage, noContext, testAdapter, testSavedView, testSession, testSpace } from '../../testing';
import { defineEndpoint, groupId, spaceId, type MenuQuery, type SavedViewSupport } from '@ap/contracts';
import { canonicalHistoryQuery } from '../../query/query-history';
import { useMenuQuery } from '../../query/query';
import { buildShareLink } from '../shareLink';
import { captureApplied } from '../../saved-view/capture';
import { restoreSavedView } from '../../saved-view/restore';
import { useSavedViews } from '../../saved-view/useSavedViews';

const features = { export: false, savedView: false, annotate: false, compare: false };
const drillKeys = ['drillRoom', 'drillStgroup', 'drillEquipment'] as const;
const level = (key: string, ko: string, en: string) => ({ key, label: { ko, en } });

function entry(partial: Pick<PlatformMenuEntry, 'id' | 'path'> & Partial<PlatformMenuEntry>): MenuEntry {
  return {
    group: groupId('overview'), label: { ko: partial.id, en: partial.id }, description: { ko: '', en: '' }, icon: House,
    permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'overview', features, pageKeys: [],
    ...partial,
  };
}

const registry = createRegistry({
  spaces: [testSpace()],
  groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('mars') }],
  menus: [
    entry({ id: 'home', path: '/', primary: true, label: { ko: '홈', en: 'Home' } }),
    entry({
      id: 'source', path: '/source', label: { ko: '생산성 개요', en: 'Productivity overview' },
      pageKeys: [...drillKeys, 'sort'], contextResetKeys: [...drillKeys],
      drill: { levels: [
        level('drillRoom', '공정', 'Process'),
        level('drillStgroup', 'StGroup', 'StGroup'),
        level('drillEquipment', '설비', 'Equipment'),
      ] },
    }),
    entry({
      // `row` is a reset key only — NOT a contextResetKey, so a Context change must leave it alone.
      id: 'rows', path: '/rows', label: { ko: '행 드릴', en: 'Row drill' },
      pageKeys: ['drillRoom', 'drillStgroup', 'row', 'sort'], contextResetKeys: ['drillRoom', 'drillStgroup'],
      drill: { levels: [level('drillRoom', '공정', 'Process'), level('drillStgroup', 'StGroup', 'StGroup')], resetKeys: ['row'] },
    }),
    entry({
      id: 'labeled', path: '/labeled', pageKeys: [...drillKeys], contextResetKeys: [...drillKeys],
      drill: { levels: [
        { ...level('drillRoom', '공정', 'Process'), valueLabel: (value, lang) => `${lang}: ${value}` },
        { ...level('drillStgroup', 'StGroup', 'StGroup'), valueLabel: () => '' },
        { ...level('drillEquipment', '설비', 'Equipment'), valueLabel: value => {
          if (value === 'E') throw new Error('No display label');
          return `Equipment ${value}`;
        } },
      ] },
    }),
    entry({ id: 'plain', path: '/plain', label: { ko: '사이클타임 상세', en: 'Cycle time detail' } }),
    entry({ id: 'detail', path: '/detail', parent: 'source', navHidden: true, pageKeys: ['returnTo'], label: { ko: '실행 상세', en: 'Execution detail' } }),
  ],
});

const session = testSession(['platform:view']);
const adapter = testAdapter({ session: () => session });

let drill: DrillState | null = null;
let origin: ReturnOrigin | null = null;
let target = '';
let host: ReturnType<typeof useHostPlatform> | null = null;

function Probe() {
  drill = useDrill();
  const platform = useHostPlatform();
  host = platform;
  origin = platform.returnOrigin();
  target = platform.returnTarget();
  return <button type="button" onClick={() => platform.setGlobal({ scopeId: 'FDRY' })}>scope</button>;
}

function mount(url: string) {
  window.history.replaceState(null, '', url);
  return render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><Probe /></PlatformProvider></I18nProvider>);
}

function url() { return window.location.pathname + window.location.search; }

beforeEach(() => {
  drill = null;
  origin = null;
  target = '';
  vi.stubGlobal('localStorage', memoryStorage());
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('useDrill (06 §6.4, ADR-0025)', () => {
  it('exposes localized value labels alongside raw page values', () => {
    const href = '/mars/labeled?v=1&drillRoom=PHOTO';
    mount(href);
    const step = { value: 'PHOTO', valueLabel: 'ko: PHOTO' };
    expect(drill!.levels[0]).toMatchObject(step);
    expect(drill!.trail[0]).toMatchObject(step);
    expect(url()).toBe(href);
  });

  it('labels an invalid step without changing its value or URL', () => {
    const href = '/mars/labeled?v=1&drillRoom=PHOTO&drillEquipment=F';
    mount(href);
    expect(drill!.invalid).toMatchObject({ value: 'F', valueLabel: 'Equipment F' });
    expect(url()).toBe(href);
  });

  it.each([
    ['missing', '/mars/source', 'drillStgroup', 'A'],
    ['empty', '/mars/labeled', 'drillStgroup', 'A'],
    ['throwing', '/mars/labeled', 'drillEquipment', 'E'],
  ])('uses the raw value when the formatter is %s', (kind, path, key, value) => {
    mount(`${path}?v=1&drillRoom=PHOTO&drillStgroup=A&drillEquipment=E`);
    const step = drill!.trail.find(candidate => candidate.key === key)!;
    expect(step.value).toBe(value);
    expect(step.valueLabel ?? step.value).toBe(value);
    if (kind !== 'missing') expect(step.valueLabel).toBe(value);
  });

  it('reads depth, trail and the first gap as invalid; an empty string is absent', () => {
    mount('/mars/source?v=1&drillStgroup=A&drillEquipment=E');
    expect(drill!.depth).toBe(0);
    expect(drill!.trail).toEqual([]);
    expect(drill!.invalid).toEqual({ key: 'drillStgroup', label: { ko: 'StGroup', en: 'StGroup' }, value: 'A' });

    cleanup();
    mount('/mars/source?v=1&drillRoom=PHOTO&drillEquipment=E');
    expect(drill!.depth).toBe(1);
    expect(drill!.trail.map(step => step.value)).toEqual(['PHOTO']);
    expect(drill!.invalid).toEqual({ key: 'drillEquipment', label: { ko: '설비', en: 'Equipment' }, value: 'E' });

    cleanup();
    mount('/mars/source?v=1&drillRoom=&drillStgroup=A');
    expect(drill!.levels[0]?.value).toBeNull();
    expect(drill!.depth).toBe(0);
    expect(drill!.invalid).toEqual({ key: 'drillStgroup', label: { ko: 'StGroup', en: 'StGroup' }, value: 'A' });
  });

  it('enter pushes once, writes the step and clears later keys', () => {
    mount('/mars/source?v=1&drillRoom=PHOTO&sort=name');
    const start = window.history.length;
    act(() => { drill!.enter('drillStgroup', 'A'); });
    expect(window.history.length).toBe(start + 1);
    expect(url()).toBe('/mars/source?v=1&drillRoom=PHOTO&sort=name&drillStgroup=A');
    expect(drill!.depth).toBe(2);

    act(() => { drill!.enter('drillRoom', 'ETCH'); });
    expect(window.history.length).toBe(start + 2);
    expect(url()).toBe('/mars/source?v=1&sort=name&drillRoom=ETCH');
    expect(drill!.trail.map(step => step.value)).toEqual(['ETCH']);
  });

  it('enter past the next level throws and does not push', () => {
    mount('/mars/source?v=1');
    const start = window.history.length;
    expect(() => drill!.enter('drillEquipment', 'E')).toThrow(/drill enter "drillEquipment" is past the next level/);
    expect(window.history.length).toBe(start);
    expect(url()).toBe('/mars/source?v=1');
  });

  it('goTo pushes once and drops every later key, including the summary', () => {
    mount('/mars/source?v=1&drillRoom=PHOTO&drillStgroup=A&drillEquipment=E');
    const start = window.history.length;
    act(() => { drill!.goTo(1); });
    expect(window.history.length).toBe(start + 1);
    expect(url()).toBe('/mars/source?v=1&drillRoom=PHOTO');
    act(() => { drill!.goTo(0); });
    expect(window.history.length).toBe(start + 2);
    expect(url()).toBe('/mars/source?v=1');
    expect(drill!.depth).toBe(0);
  });

  it('a menu without drill reports no levels and rejects enter', () => {
    mount('/?v=1');
    expect(drill!.levels).toEqual([]);
    expect(drill!.depth).toBe(0);
    expect(drill!.invalid).toBeNull();
    expect(() => drill!.enter('drillRoom', 'PHOTO')).toThrow(/drill enter "drillRoom" is not a declared level/);
  });

  it('a context change clears drill keys in the same navigation and Back restores them', async () => {
    const originUrl = '/mars/source?v=1&scopeId=MEM&sort=name&drillRoom=PHOTO&drillStgroup=A';
    mount(originUrl);
    const start = window.history.length;
    act(() => { screen.getByRole('button', { name: 'scope' }).click(); });
    expect(window.history.length).toBe(start + 1);
    expect(url()).toBe('/mars/source?v=1&scopeId=FDRY&sort=name');
    expect(drill!.depth).toBe(0);

    await act(async () => {
      window.history.back();
      await waitFor(() => expect(url()).toBe(originUrl));
    });
    expect(drill!.trail.map(step => step.value)).toEqual(['PHOTO', 'A']);
  });
});

describe('alternative drill bases', () => {
  const path = '/mars/bases';
  const keys = ['drillRoom', 'roomBasis', 'drillStgroup', 'groupBasis'];
  const support: SavedViewSupport = { menuId: 'bases', menuSchemaVersion: 1, contextKeys: [], pageKeys: keys };
  const endpoint = defineEndpoint<{ room: string | null; basis?: string }, null>({ id: 'fixture.bases', menuId: 'bases', permission: 'platform:view', requiresScope: false, context: {}, paramKeys: { room: true, basis: true }, kinds: [], mergeTimeDomain: false });
  const from = `${path}?v=1&drillRoom=PHOTO&roomBasis=alt&drillStgroup=A&groupBasis=alt&row=r1`;
  function mountBases(href: string, { queryProbe, savedViews, removedBases, legacySelector }: { queryProbe?: boolean; savedViews?: ReturnType<typeof createFakeSavedViewStore>; removedBases?: boolean; legacySelector?: boolean } = {}) {
    const bases = [{ id: 'alt', label: 'Alternative' }, { id: 'other', label: 'Other' }, { id: 'denied', label: 'Denied' }];
    const menu = entry({
      id: 'bases', path: '/bases', pageKeys: [...keys, 'row'], contextResetKeys: keys,
      ...(savedViews ? { context: { ...noContext, time: 'apply' }, features: { ...features, savedView: true }, savedViewSupport: { ...support, contextKeys: ['time'] }, query: { mode: 'apply', ...(legacySelector ? {} : { autoApplyDefault: true }) } } : {}),
      drill: { levels: [
        { ...level('drillRoom', '공정', 'Process'), basisKey: 'roomBasis', bases: removedBases ? [] : bases },
        { ...level('drillStgroup', 'StGroup', 'StGroup'), basisKey: 'groupBasis', bases },
      ], resetKeys: ['row'], isBasisAvailable: (_key, id) => id !== 'denied' },
    });
    const withBases = createRegistry({ spaces: registry.spaces, groups: registry.groups, menus: [...registry.menus, menu] });
    window.history.replaceState(null, '', href);
    const originalReplace = window.history.replaceState.bind(window.history);
    const dispatchUrls: string[] = [];
    const send = vi.fn(async (_request: MenuQuery) => {
      dispatchUrls.push(url());
      return { outcome: 'empty' as const, data: null, assessments: [], trust: null, correlationId: 'test' };
    });
    const callsAtReplace: number[] = [];
    const replace = vi.spyOn(window.history, 'replaceState').mockImplementation((...args) => {
      callsAtReplace.push(send.mock.calls.length);
      originalReplace(...args);
    });
    function QueryProbe() {
      const step = useDrill().trail[0];
      useMenuQuery(endpoint, { room: step?.value ?? null, basis: step?.basis });
      return null;
    }
    function SavedViewSelector() {
      const views = useSavedViews();
      return <output aria-label="Saved Views">{views.status}:{views.defaultId}</output>;
    }
    render(<I18nProvider><PlatformProvider adapter={queryProbe ? testAdapter({ session: () => session, menuQuery: send }) : adapter} registry={withBases} savedViews={savedViews}><Probe />{queryProbe && <QueryProbe />}{legacySelector && <SavedViewSelector />}</PlatformProvider></I18nProvider>);
    return { replace, send, dispatchUrls, callsAtReplace };
  }

  it('pushes a basis-only change once and clears later value and basis keys and drill resets', async () => {
    const { send } = mountBases(from, { queryProbe: true });
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(send.mock.calls[0]?.[0]).toMatchObject({ params: { room: 'PHOTO', basis: 'alt' } });
    const push = vi.spyOn(window.history, 'pushState');
    act(() => { drill!.enter('drillRoom', 'PHOTO', { basis: 'other' }); });
    const pushes = push.mock.calls.length;
    push.mockRestore();
    expect(url()).toBe(`${path}?v=1&drillRoom=PHOTO&roomBasis=other`);
    expect(pushes).toBe(1);
    expect(drill!.trail[0]?.basis).toBe('other');
    await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
    expect(send.mock.calls[1]?.[0]).toMatchObject({ params: { room: 'PHOTO', basis: 'other' } });

    act(() => { host!.setPage({ row: 'r2' }); });
    act(() => { drill!.enter('drillRoom', 'PHOTO', { basis: 'alt' }); });
    expect(url()).toBe(`${path}?v=1&drillRoom=PHOTO&roomBasis=alt`);
  });

  it('keeps the basis for a sibling and removes it for an explicit default', () => {
    mountBases(from);
    act(() => { drill!.enter('drillRoom', 'ETCH'); });
    expect(drill!.trail[0]?.basis).toBe('alt');
    act(() => { drill!.enter('drillRoom', 'ETCH', { basis: undefined }); });
    expect(url()).toBe(`${path}?v=1&drillRoom=ETCH`);
  });

  it('preserves the basis when a JavaScript caller supplies an empty options bag', () => {
    mountBases(from);
    act(() => { Reflect.apply(drill!.enter, undefined, ['drillRoom', 'ETCH', {}]); });
    expect(drill!.trail[0]?.basis).toBe('alt');
  });

  it('drops later basis keys when going up', () => {
    mountBases(from);
    act(() => { drill!.goTo(1); });
    expect(url()).toBe(`${path}?v=1&drillRoom=PHOTO&roomBasis=alt`);
  });

  it('clears declared basis and step keys on Context change', () => {
    mountBases(from);
    act(() => { screen.getByRole('button', { name: 'scope' }).click(); });
    expect(url()).toBe(`${path}?v=1&scopeId=FDRY&row=r1`);
  });

  it('reports a basis without a step as a format error and closes the query gate', () => {
    const href = `${path}?v=1&roomBasis=alt`;
    mountBases(href);
    expect(drill!.invalid?.key).toBe('drillRoom');
    expect(host!.queryPolicy.drillGap).toBe(true);
    expect(url()).toBe(href);
  });

  it.each(['unknown', 'denied', ''])('replaces a rejected basis (%j) with its parent and reports only the level key', async id => {
    const start = window.history.length;
    const { replace, send, dispatchUrls, callsAtReplace } = mountBases(from.replace('groupBasis=alt', `groupBasis=${id}`), { queryProbe: true });
    expect(drill!.depth).toBe(1);
    expect(drill!.rejectedBasis).toEqual({ levelKey: 'drillStgroup' });
    expect(url()).toBe(`${path}?v=1&drillRoom=PHOTO&roomBasis=alt`);
    expect(window.history.length).toBe(start);
    expect(replace).toHaveBeenCalledTimes(1);
    expect(callsAtReplace).toEqual([0]);
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(dispatchUrls).toEqual([`${path}?v=1&drillRoom=PHOTO&roomBasis=alt`]);
    act(() => { drill!.enter('drillStgroup', 'B'); });
    expect(drill!.rejectedBasis).toBeNull();
  });

  it('recovers the first rejected basis before reporting a later orphan basis', () => {
    mountBases(`${path}?v=1&drillRoom=PHOTO&roomBasis=denied&groupBasis=alt`);
    expect(url()).toBe(`${path}?v=1`);
    expect(drill!.depth).toBe(0);
    expect(drill!.rejectedBasis).toEqual({ levelKey: 'drillRoom' });
    expect(drill!.invalid).toBeNull();
  });

  it('recovers an old link after removal of the last alternative', () => {
    mountBases(from, { removedBases: true });
    expect(url()).toBe(`${path}?v=1`);
    expect(drill!.rejectedBasis).toEqual({ levelKey: 'drillRoom' });
  });

  it('keeps first-step basis recovery when an auto Apply menu has a personal default', async () => {
    const view = testSavedView({ id: 'personal', kind: 'menu-view', menuId: 'bases', menuSchemaVersion: 1, context: { from: '2026-09-01T00:00:00', to: '2026-09-02T00:00:00' }, page: [['drillRoom', 'ETCH']] });
    const savedViews = createFakeSavedViewStore([view], { 'u1:bases': view.id });
    const { replace } = mountBases(`${path}?v=1&drillRoom=PHOTO&roomBasis=denied`, { savedViews });
    await act(async () => {});
    expect(url()).toBe(`${path}?v=1`);
    expect(drill!.rejectedBasis).toEqual({ levelKey: 'drillRoom' });
    expect(replace).toHaveBeenCalledTimes(1);
  });

  it('keeps first-step basis recovery when the legacy selector loads a personal default', async () => {
    const view = testSavedView({ id: 'personal', kind: 'menu-view', menuId: 'bases', menuSchemaVersion: 1, context: {}, page: [['drillRoom', 'ETCH']] });
    const savedViews = createFakeSavedViewStore([view], { 'u1:bases': view.id });
    const { replace } = mountBases(`${path}?v=1&drillRoom=PHOTO&roomBasis=denied`, { savedViews, legacySelector: true });
    await waitFor(() => expect(screen.getByLabelText('Saved Views').textContent).toBe('ready:personal'));
    await act(async () => {});
    expect(url()).toBe(`${path}?v=1`);
    expect(drill!.rejectedBasis).toEqual({ levelKey: 'drillRoom' });
    expect(replace).toHaveBeenCalledTimes(1);
  });

  it('round-trips a basis key through a share link and a saved view', () => {
    mountBases(`${path}?v=1`);
    act(() => { drill!.enter('drillRoom', 'A+', { basis: 'alt' }); });
    const current = host!;
    const captured = captureApplied(current, support);
    expect(buildShareLink({ ...current, kind: 'conditions', absoluteUrl: href => href })).toEqual({
      ok: true, href: `${path}?v=1&drillRoom=A%2B&roomBasis=alt`,
    });
    const view = testSavedView({ id: 'alt', kind: 'menu-view', menuId: support.menuId, menuSchemaVersion: 1, ...captured });
    expect(restoreSavedView({ view, support, current: { global: current.global, page: [] }, extras: [], pathname: path, anchor: null, source: 'selected' }))
      .toMatchObject({ href: `${path}?v=1&drillRoom=A%2B&roomBasis=alt` });
  });

  it('preserves the no-bases URL, share link and serialized saved page through drill transitions', async () => {
    const path = '/mars/rows';
    mount(`${path}?v=1&scopeId=MEM&drillRoom=A%2BB`);
    const start = window.history.length;
    const golden = (query: string, page: string, pushes: number) => {
      expect(url()).toBe(path + query);
      expect(buildShareLink({ ...host!, kind: 'conditions', absoluteUrl: href => href })).toEqual({ ok: true, href: path + query });
      expect(JSON.stringify(captureApplied(host!, { pageKeys: ['drillRoom', 'drillStgroup'], contextKeys: [] }).page)).toBe(page);
      expect(canonicalHistoryQuery(host!, drillKeys)).toBe(query);
      expect(window.history.length).toBe(start + pushes);
    };
    act(() => { drill!.enter('drillStgroup', 'x y'); });
    golden('?v=1&scopeId=MEM&drillRoom=A%2BB&drillStgroup=x+y', '[["drillRoom","A+B"],["drillStgroup","x y"]]', 1);
    act(() => { host!.setPage({ drillStgroup: 'direct' }); });
    golden('?v=1&scopeId=MEM&drillRoom=A%2BB&drillStgroup=direct', '[["drillRoom","A+B"],["drillStgroup","direct"]]', 2);
    act(() => { drill!.enter('drillStgroup', 'Z'); });
    golden('?v=1&scopeId=MEM&drillRoom=A%2BB&drillStgroup=Z', '[["drillRoom","A+B"],["drillStgroup","Z"]]', 3);
    act(() => { drill!.goTo(1); });
    golden('?v=1&scopeId=MEM&drillRoom=A%2BB', '[["drillRoom","A+B"]]', 4);
    act(() => { screen.getByRole('button', { name: 'scope' }).click(); });
    golden('?v=1&scopeId=FDRY', '[]', 5);
    await act(async () => {
      window.history.back();
      await waitFor(() => expect(url()).toBe(path + '?v=1&scopeId=MEM&drillRoom=A%2BB'));
    });
    golden('?v=1&scopeId=MEM&drillRoom=A%2BB', '[["drillRoom","A+B"]]', 5);
    await act(async () => {
      window.history.forward();
      await waitFor(() => expect(url()).toBe(path + '?v=1&scopeId=FDRY'));
    });
    golden('?v=1&scopeId=FDRY', '[]', 5);
  });
});

describe('drill.resetKeys (06 §6.4)', () => {
  it('a drill step through useDrill clears the reset key in one history entry and Back restores the URL', async () => {
    const originUrl = '/mars/rows?v=1&drillRoom=PHOTO&row=r1&sort=name';
    mount(originUrl);
    act(() => { drill!.goTo(0); });
    expect(url()).toBe('/mars/rows?v=1&sort=name');

    // One Back returns to the origin URL exactly, so the step and the reset were a single history entry.
    await act(async () => {
      window.history.back();
      await waitFor(() => expect(url()).toBe(originUrl));
    });
    expect(drill!.trail.map(step => step.value)).toEqual(['PHOTO']);
  });

  it('a direct setPage that changes a level value drops the reset key; an unchanged level keeps it', () => {
    mount('/mars/rows?v=1&drillRoom=PHOTO&row=r1');
    act(() => { host!.setPage({ drillRoom: 'PHOTO', sort: 'name' }); });
    expect(url()).toBe('/mars/rows?v=1&row=r1&drillRoom=PHOTO&sort=name');
    act(() => { host!.setPage({ drillRoom: 'ETCH' }); });
    expect(url()).toBe('/mars/rows?v=1&sort=name&drillRoom=ETCH');
  });

  it('a menu without resetKeys keeps unrelated keys on a drill step', () => {
    mount('/mars/source?v=1&drillRoom=PHOTO&sort=name');
    act(() => { drill!.goTo(0); });
    expect(url()).toBe('/mars/source?v=1&sort=name');
  });

  it('a Context change does not apply the drill rule (row is not a contextResetKey)', () => {
    mount('/mars/rows?v=1&scopeId=MEM&drillRoom=PHOTO&row=r1');
    act(() => { screen.getByRole('button', { name: 'scope' }).click(); });
    expect(url()).toBe('/mars/rows?v=1&scopeId=FDRY&row=r1');
  });
});

describe('returnOrigin (06 §22, ADR-0025)', () => {
  it('carries drill display labels on an accepted return trail', () => {
    const href = '/mars/labeled?v=1&drillRoom=PHOTO';
    mount(`/mars/detail?v=1&returnTo=${encodeURIComponent(href)}`);
    expect(origin).toMatchObject({ href, trail: [{ value: 'PHOTO', valueLabel: 'ko: PHOTO' }] });
  });

  it('reads the accepted returnTo menu label and the leading drill values', () => {
    const accepted = '/mars/source?v=1&drillRoom=PHOTO&drillStgroup=A&drillEquipment=E';
    mount(`/mars/detail?v=1&returnTo=${encodeURIComponent(accepted)}`);
    expect(origin!.href).toBe(target);
    expect(origin!.href).toBe(accepted);
    expect(origin!.menuLabel).toEqual({ ko: '생산성 개요', en: 'Productivity overview' });
    expect(origin!.trail.map(step => step.value)).toEqual(['PHOTO', 'A', 'E']);

    cleanup();
    const gap = '/mars/source?v=1&drillRoom=PHOTO&drillEquipment=E';
    mount(`/mars/detail?v=1&returnTo=${encodeURIComponent(gap)}`);
    expect(origin!.href).toBe(gap);
    expect(origin!.trail.map(step => step.value)).toEqual(['PHOTO']);
  });

  it('uses the parent menu and an empty trail when returnTo is rejected or absent', () => {
    mount(`/mars/detail?v=1&returnTo=${encodeURIComponent('https://example.com/phish')}`);
    expect(origin!.href).toBe(target);
    expect(origin!.href).toBe('/mars/source?v=1');
    expect(origin!.menuLabel.ko).toBe('생산성 개요');
    expect(origin!.trail).toEqual([]);

    cleanup();
    mount('/mars/detail?v=1');
    expect(origin!.href).toBe('/mars/source?v=1');
    expect(origin!.menuLabel.ko).toBe('생산성 개요');
    expect(origin!.trail).toEqual([]);
  });

  it('keeps an accepted origin that declares no drill, with an empty trail', () => {
    const plain = '/mars/plain?v=1';
    mount(`/mars/detail?v=1&returnTo=${encodeURIComponent(plain)}`);
    expect(origin!.href).toBe(plain);
    expect(origin!.menuLabel).toEqual({ ko: '사이클타임 상세', en: 'Cycle time detail' });
    expect(origin!.trail).toEqual([]);
  });
});
