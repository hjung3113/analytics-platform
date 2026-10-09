import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDrill, type DrillState } from './drill';
import { I18nProvider } from './i18n';
import { PlatformProvider, usePlatform, type ReturnOrigin } from './platform';
import { createRegistry, type MenuEntry } from './registry';
import { noContext, testAdapter, testSession, testSpace } from './test-support';

const features = { export: false, savedView: false, annotate: false, compare: false };
const drillKeys = ['drillRoom', 'drillStgroup', 'drillEquipment'] as const;
const level = (key: string, ko: string, en: string) => ({ key, label: { ko, en } });

function entry(partial: Pick<MenuEntry, 'id' | 'path'> & Partial<MenuEntry>): MenuEntry {
  return {
    group: 'overview', label: { ko: partial.id, en: partial.id }, description: { ko: '', en: '' }, icon: House,
    permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'overview', features, pageKeys: [],
    ...partial,
  };
}

const registry = createRegistry({
  spaces: [testSpace()],
  groups: [{ id: 'overview', label: { ko: '개요', en: 'Overview' }, icon: House, space: 'analytics' }],
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
    entry({ id: 'plain', path: '/plain', label: { ko: '사이클타임 상세', en: 'Cycle time detail' } }),
    entry({ id: 'detail', path: '/detail', parent: 'source', navHidden: true, pageKeys: ['returnTo'], label: { ko: '실행 상세', en: 'Execution detail' } }),
  ],
});

const session = testSession(['platform:view']);
const adapter = testAdapter({ session: () => session });

let drill: DrillState | null = null;
let origin: ReturnOrigin | null = null;
let target = '';

function Probe() {
  drill = useDrill();
  const platform = usePlatform();
  origin = platform.returnOrigin();
  target = platform.returnTarget();
  return <button type="button" onClick={() => platform.setGlobal({ scopeId: 'CJU' })}>scope</button>;
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
  const data = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
    removeItem: (key: string) => { data.delete(key); },
    clear: () => data.clear(),
    key: () => null,
    get length() { return data.size; },
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('useDrill (06 §6.4, ADR-0025)', () => {
  it('reads depth, trail and the first gap as invalid; an empty string is absent', () => {
    mount('/source?v=1&drillStgroup=A&drillEquipment=E');
    expect(drill!.depth).toBe(0);
    expect(drill!.trail).toEqual([]);
    expect(drill!.invalid).toEqual({ key: 'drillStgroup', value: 'A' });

    cleanup();
    mount('/source?v=1&drillRoom=PHOTO&drillEquipment=E');
    expect(drill!.depth).toBe(1);
    expect(drill!.trail.map(step => step.value)).toEqual(['PHOTO']);
    expect(drill!.invalid).toEqual({ key: 'drillEquipment', value: 'E' });

    cleanup();
    mount('/source?v=1&drillRoom=&drillStgroup=A');
    expect(drill!.levels[0]?.value).toBeNull();
    expect(drill!.depth).toBe(0);
    expect(drill!.invalid).toEqual({ key: 'drillStgroup', value: 'A' });
  });

  it('enter pushes once, writes the step and clears later keys', () => {
    mount('/source?v=1&drillRoom=PHOTO&sort=name');
    const start = window.history.length;
    act(() => { drill!.enter('drillStgroup', 'A'); });
    expect(window.history.length).toBe(start + 1);
    expect(url()).toBe('/source?v=1&drillRoom=PHOTO&sort=name&drillStgroup=A');
    expect(drill!.depth).toBe(2);

    act(() => { drill!.enter('drillRoom', 'ETCH'); });
    expect(window.history.length).toBe(start + 2);
    expect(url()).toBe('/source?v=1&sort=name&drillRoom=ETCH');
    expect(drill!.trail.map(step => step.value)).toEqual(['ETCH']);
  });

  it('enter past the next level throws and does not push', () => {
    mount('/source?v=1');
    const start = window.history.length;
    expect(() => drill!.enter('drillEquipment', 'E')).toThrow(/drill enter "drillEquipment" is past the next level/);
    expect(window.history.length).toBe(start);
    expect(url()).toBe('/source?v=1');
  });

  it('goTo pushes once and drops every later key, including the summary', () => {
    mount('/source?v=1&drillRoom=PHOTO&drillStgroup=A&drillEquipment=E');
    const start = window.history.length;
    act(() => { drill!.goTo(1); });
    expect(window.history.length).toBe(start + 1);
    expect(url()).toBe('/source?v=1&drillRoom=PHOTO');
    act(() => { drill!.goTo(0); });
    expect(window.history.length).toBe(start + 2);
    expect(url()).toBe('/source?v=1');
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
    const originUrl = '/source?v=1&scopeId=ICH&sort=name&drillRoom=PHOTO&drillStgroup=A';
    mount(originUrl);
    const start = window.history.length;
    act(() => { screen.getByRole('button', { name: 'scope' }).click(); });
    expect(window.history.length).toBe(start + 1);
    expect(url()).toBe('/source?v=1&scopeId=CJU&sort=name');
    expect(drill!.depth).toBe(0);

    await act(async () => {
      window.history.back();
      await waitFor(() => expect(url()).toBe(originUrl));
    });
    expect(drill!.trail.map(step => step.value)).toEqual(['PHOTO', 'A']);
  });
});

describe('returnOrigin (06 §22, ADR-0025)', () => {
  it('reads the accepted returnTo menu label and the leading drill values', () => {
    const accepted = '/source?v=1&drillRoom=PHOTO&drillStgroup=A&drillEquipment=E';
    mount(`/detail?v=1&returnTo=${encodeURIComponent(accepted)}`);
    expect(origin!.href).toBe(target);
    expect(origin!.href).toBe(accepted);
    expect(origin!.menuLabel).toEqual({ ko: '생산성 개요', en: 'Productivity overview' });
    expect(origin!.trail.map(step => step.value)).toEqual(['PHOTO', 'A', 'E']);

    cleanup();
    const gap = '/source?v=1&drillRoom=PHOTO&drillEquipment=E';
    mount(`/detail?v=1&returnTo=${encodeURIComponent(gap)}`);
    expect(origin!.href).toBe(gap);
    expect(origin!.trail.map(step => step.value)).toEqual(['PHOTO']);
  });

  it('uses the parent menu and an empty trail when returnTo is rejected or absent', () => {
    mount(`/detail?v=1&returnTo=${encodeURIComponent('https://example.com/phish')}`);
    expect(origin!.href).toBe(target);
    expect(origin!.href).toBe('/source?v=1');
    expect(origin!.menuLabel.ko).toBe('생산성 개요');
    expect(origin!.trail).toEqual([]);

    cleanup();
    mount('/detail?v=1');
    expect(origin!.href).toBe('/source?v=1');
    expect(origin!.menuLabel.ko).toBe('생산성 개요');
    expect(origin!.trail).toEqual([]);
  });

  it('keeps an accepted origin that declares no drill, with an empty trail', () => {
    const plain = '/plain?v=1';
    mount(`/detail?v=1&returnTo=${encodeURIComponent(plain)}`);
    expect(origin!.href).toBe(plain);
    expect(origin!.menuLabel).toEqual({ ko: '사이클타임 상세', en: 'Cycle time detail' });
    expect(origin!.trail).toEqual([]);
  });
});
