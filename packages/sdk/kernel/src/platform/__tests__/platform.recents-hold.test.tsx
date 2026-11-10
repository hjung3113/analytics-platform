import { StrictMode } from 'react';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { groupId, type JsonValue, type PlatformAdapter, type Session } from '@ap/contracts';
import { I18nProvider } from '../../i18n';
import { PlatformProvider, useHostPlatform, usePlatform, useRecentVisits } from '../platform';
import { createRegistry } from '../../registry/registry';
import { memoryStorage, noContext, testAdapter, testSession, testSpace } from '../../testing';

// #1671: a URL change inside one menu holds the recents PATCH for 1 s. The held visit is shown at once and is never lost, reordered or
// sent for another account when the controller is replaced, the account switches, the tree unmounts or the user enters another menu.

const features = { export: false, savedView: false, annotate: false, compare: false };
const entry = (id: string, path: string, over: Record<string, unknown> = {}) => ({
  id, group: groupId('equipment'), label: { ko: id, en: id }, description: { ko: '', en: '' }, path, icon: House, permission: 'platform:view' as const,
  requiresScope: false, context: noContext, pageType: 'analysis' as const, features: { ...features, board: true }, pageKeys: ['page', 'returnTo'], ...over,
});
const registry = createRegistry({
  spaces: [testSpace({ homeMenuId: 'main' })],
  groups: [{ id: groupId('equipment'), label: { ko: '그룹', en: 'Group' }, icon: House, space: testSpace().id }],
  menus: [{ ...entry('main', '/main'), primary: true }, entry('plain', '/plain')],
});
const ok = (values: Record<string, JsonValue>) => ({ outcome: 'ok' as const, data: { values, importedAt: '2026-10-29T00:00:00Z' }, assessments: [], trust: null, correlationId: 'c' });
const sessionOf = (id: string): Session => testSession(['platform:view'], { user: { id, name: id, title: { ko: id, en: id } } });

type Sent = { user: string; recents: { menuId: string; url: string }[] };
function fixture() {
  const accounts: Record<string, Record<string, JsonValue>> = { 'user-a': {}, 'user-b': {} };
  const sessions = { 'user-a': sessionOf('user-a'), 'user-b': sessionOf('user-b') };
  let current = sessions['user-a'];
  const listeners = new Set<() => void>();
  const sent: Sent[] = [];
  const adapter: PlatformAdapter = testAdapter({
    session: () => current,
    subscribe: l => { listeners.add(l); return () => { listeners.delete(l); }; },
    readPreferences: async () => ok({ ...accounts[current.user.id]! }),
    patchPreferences: async patch => {
      const id = current.user.id;
      if (patch.set?.recents !== undefined) sent.push({ user: id, recents: patch.set.recents as Sent['recents'] });
      accounts[id] = { ...accounts[id]!, ...(patch.set ?? {}) };
      return ok(accounts[id]!);
    },
  });
  return {
    adapter, sent, accounts,
    switchTo: (id: 'user-a' | 'user-b') => { current = sessions[id]; listeners.forEach(l => l()); },
    notify: () => listeners.forEach(l => l()),
  };
}

let menu: ReturnType<typeof usePlatform>;
let host: ReturnType<typeof useHostPlatform>;
let visits: ReturnType<typeof useRecentVisits>;
function Consumer() { menu = usePlatform(); host = useHostPlatform(); visits = useRecentVisits(); return null; }
const urls = (list: readonly { menuId: string; url: string }[]) => list.map(r => `${r.menuId}${r.url.includes('page=') ? `?${r.url.split('page=')[1]}` : ''}`);

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
  vi.stubGlobal('sessionStorage', memoryStorage());
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

async function mountReady(strict = false) {
  const f = fixture();
  window.history.replaceState(null, '', '/main');
  const tree = <I18nProvider><PlatformProvider serverPreferences adapter={f.adapter} registry={registry}><Consumer /></PlatformProvider></I18nProvider>;
  const view = render(strict ? <StrictMode>{tree}</StrictMode> : tree);
  // The first visit is entered at once (nothing recorded before it); wait until it is stored.
  await waitFor(() => expect(f.sent.length).toBeGreaterThan(0));
  await act(async () => { await new Promise(r => setTimeout(r, 30)); });
  f.sent.length = 0;
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  return { f, view };
}
const pages = (...values: string[]) => { for (const page of values) act(() => { menu.setPage({ page }); }); };
const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

describe('a held recents visit (#1671)', () => {
  it.each([[false], [true]])('shows the latest visit at once and sends one PATCH after the delay (StrictMode %s)', async strict => {
    const { f } = await mountReady(strict);
    pages('2', '3');
    expect(urls(host.readRecent())).toEqual(['main?3']);
    expect(urls(visits)).toEqual(['main?3']);
    expect(f.sent).toHaveLength(0);
    await advance(1100);
    expect(f.sent.map(s => [s.user, urls(s.recents)])).toEqual([['user-a', ['main?3']]]);
  });

  it('entering another menu writes at once with the held visit folded in, in order', async () => {
    const { f } = await mountReady();
    pages('2');
    expect(f.sent).toHaveLength(0);
    act(() => { menu.navigate('/mars/plain'); });
    await advance(0);
    // the held visit of `main` was written before `plain` entered: the stored list is plain first, main (page 2) second
    expect(f.sent.map(s => urls(s.recents))).toEqual([['plain', 'main?2']]);
    expect(urls(host.readRecent())).toEqual(['plain', 'main?2']);
    await advance(1100);
    expect(f.sent).toHaveLength(1);
  });

  it('unmount sends the held visit once, for its own account', async () => {
    const { f, view } = await mountReady();
    pages('2', '3');
    view.unmount();
    await advance(1100);
    expect(f.sent.map(s => [s.user, urls(s.recents)])).toEqual([['user-a', ['main?3']]]);
  });

  it('a controller replacement of the same account keeps the held visit, written once and in order', async () => {
    const { f } = await mountReady();
    pages('2');
    act(() => { f.notify(); });
    await advance(1100);
    await advance(50);
    const stored = f.sent.map(s => [s.user, urls(s.recents)]);
    expect(stored.length).toBeGreaterThan(0);
    expect(stored.every(([user]) => user === 'user-a')).toBe(true);
    expect(stored.at(-1)).toEqual(['user-a', ['main?2']]);
    expect(stored.flatMap(([, list]) => list as string[]).filter(u => u !== 'main?2')).toEqual([]);
  });

  it('an account switch sends nothing of the held visit for the other account; it stays with its own account', async () => {
    const { f } = await mountReady();
    pages('2');
    act(() => { f.switchTo('user-b'); });
    await advance(1100);
    await advance(50);
    // user-b writes only its own entry into the page (the address is still the one user-a left); user-a is not written while the session is user-b's
    expect(f.sent.filter(s => s.user === 'user-a')).toEqual([]);
    expect(f.sent.filter(s => s.user === 'user-b').length).toBeLessThanOrEqual(1);
    expect(JSON.stringify(f.accounts['user-a']!.recents)).not.toContain('page=2');
    act(() => { f.switchTo('user-a'); });
    await advance(50);
    await advance(1100);
    expect(f.sent.filter(s => s.user === 'user-a').map(s => urls(s.recents))).toEqual([['main?2']]);
  });
});
