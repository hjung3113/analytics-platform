import { act, cleanup, render, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { House } from 'lucide-react';
import { groupId, spaceId, type JsonValue, type PlatformAdapter, type Session } from '@ap/contracts';
import { createRegistry, I18nProvider, PlatformProvider } from '@ap/kernel';
import { memoryStorage, noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { useColumnPreferences } from '../useColumnPreferences';

// The REAL Provider, controller and hook: the lifecycle edges of a width change that has not been written yet.
const registry = createRegistry({ spaces: [testSpace()], groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('mars') }], menus: [{ id: 'home', primary: true, group: groupId('overview'), path: '/', label: { ko: '홈', en: 'Home' }, description: { ko: '', en: '' }, icon: House, permission: 'platform:view', requiresScope: false, context: noContext, features: { export: false, annotate: false, compare: false, savedView: false }, pageType: 'analysis', pageKeys: [] }] });
const ok = (values: Record<string, JsonValue>) => ({ outcome: 'ok' as const, data: { values, importedAt: '2026-10-29T00:00:00Z' }, assessments: [], trust: null, correlationId: 'c' });
const sessionOf = (id: string): Session => testSession(['platform:view'], { user: { id, name: id, title: { ko: id, en: id } } });

function fixture() {
  const accounts: Record<string, Record<string, JsonValue>> = { 'user-a': {}, 'user-b': {} };
  let current = sessionOf('user-a');
  const listeners = new Set<() => void>();
  const adapter: PlatformAdapter = testAdapter({
    session: () => current,
    subscribe: l => { listeners.add(l); return () => { listeners.delete(l); }; },
    readPreferences: async () => ok(accounts[current.user.id]!),
    patchPreferences: async patch => { const actor = current.user.id; accounts[actor] = { ...accounts[actor], ...(patch.set ?? {}) }; return ok(accounts[actor]!); },
  });
  return { adapter, accounts, switchTo: (id: string) => { current = sessionOf(id); listeners.forEach(l => l()); } };
}
const tables = (f: ReturnType<typeof fixture>, actor: string) => Object.entries(f.accounts[actor]!).filter(([k]) => k.startsWith('columns:'));

let widen: (() => void) | null = null;
let shownSizing: unknown = null;
function Table() {
  const { preferences, onColumnSizingChange } = useColumnPreferences('t1');
  widen = () => onColumnSizingChange({ a: 222 });
  shownSizing = preferences.sizing;
  return null;
}
const tree = (f: ReturnType<typeof fixture>, table: boolean) => (
  <StrictMode><I18nProvider><PlatformProvider serverPreferences registry={registry} adapter={f.adapter}>{table ? <Table /> : null}</PlatformProvider></I18nProvider></StrictMode>
);
const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
async function mounted(f: ReturnType<typeof fixture>, table = true) {
  const view = render(tree(f, table));
  await settle();
  await settle();
  return view;
}

describe('column preferences: a width change not yet written survives lifecycle edges', () => {
  beforeEach(() => { vi.stubGlobal('localStorage', memoryStorage()); widen = null; shownSizing = null; });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('table unmount before the 300 ms debounce, Provider stays', async () => {
    const f = fixture();
    const view = await mounted(f);
    act(() => widen!());
    view.rerender(tree(f, false));
    await waitFor(() => expect(tables(f, 'user-a')).toHaveLength(1));
    expect((tables(f, 'user-a')[0]![1] as { sizing: unknown }).sizing).toEqual({ a: 222 });
  });

  it('whole Provider unmount before the debounce', async () => {
    const f = fixture();
    const view = await mounted(f);
    act(() => widen!());
    view.unmount();
    await waitFor(() => expect(tables(f, 'user-a')).toHaveLength(1));
  });

  it('pagehide before the debounce', async () => {
    const f = fixture();
    await mounted(f);
    act(() => widen!());
    act(() => { window.dispatchEvent(new Event('pagehide')); });
    await waitFor(() => expect(tables(f, 'user-a')).toHaveLength(1));
  });

  it('the debounced write still happens once after 300 ms', async () => {
    const f = fixture();
    await mounted(f);
    act(() => widen!());
    expect(tables(f, 'user-a')).toHaveLength(0);
    await waitFor(() => expect(tables(f, 'user-a')).toHaveLength(1), { timeout: 2000 });
  });

  it('account replacement: the old account width is never sent under the new account nor shown to it', async () => {
    const f = fixture();
    await mounted(f);
    act(() => widen!());
    act(() => f.switchTo('user-b'));
    await settle();
    await settle();
    await new Promise(resolve => setTimeout(resolve, 400));
    await settle();
    expect(tables(f, 'user-b')).toEqual([]);
    expect(shownSizing).toEqual({});
  });

  it('account replacement keeps the old account\'s width for that account', async () => {
    const f = fixture();
    await mounted(f);
    act(() => widen!());
    act(() => f.switchTo('user-b'));
    await settle();
    await settle();
    act(() => f.switchTo('user-a'));
    await settle();
    await settle();
    await waitFor(() => expect(tables(f, 'user-a')).toHaveLength(1), { timeout: 2000 });
    expect(tables(f, 'user-b')).toEqual([]);
  });
});
