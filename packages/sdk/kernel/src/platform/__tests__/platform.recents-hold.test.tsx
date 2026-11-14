import { StrictMode } from 'react';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { groupId, type JsonValue, type PlatformAdapter, type Session } from '@ap/contracts';
import { I18nProvider } from '../../i18n';
import { PlatformProvider, useHostPlatform, usePlatform, useRecentVisits } from '../platform';
import { createRegistry } from '../../registry/registry';
import { memoryStorage, noContext, testAdapter, testSession, testSpace, testScreen } from '../../testing';

// #1671: a URL change inside one menu holds the recents PATCH for 1 s. The held visit is shown at once and is never lost, reordered or
// sent for another account when the controller is replaced, the account switches, the tree unmounts or the user enters another menu.

const features = { export: false, savedView: false, annotate: false, compare: false };
const entry = (id: string, path: string, over: Record<string, unknown> = {}) => ({
  id, group: groupId('equipment'), label: { ko: id, en: id }, description: { ko: '', en: '' }, path, icon: House, permission: 'platform:view' as const,
  requiresScope: false, context: noContext, component: testScreen, pageType: 'analysis' as const, features: { ...features, board: true }, pageKeys: ['page', 'returnTo'], ...over,
});
const registry = createRegistry({
  spaces: [testSpace({ homeMenuId: 'main' })],
  groups: [{ id: groupId('equipment'), label: { ko: '그룹', en: 'Group' }, icon: House, space: testSpace().id }],
  menus: [{ ...entry('main', '/main'), primary: true }, entry('plain', '/plain')],
});
const ok = (values: Record<string, JsonValue>) => ({ outcome: 'ok' as const, data: { values, importedAt: '2026-10-29T00:00:00Z' }, assessments: [], trust: null, correlationId: 'c' });
const sessionOf = (id: string): Session => testSession(['platform:view'], { user: { id, name: id, title: { ko: id, en: id } } });

type Sent = { user: string; recents: { menuId: string; url: string; at: number }[] };
function fixture(seedA: Record<string, JsonValue> = {}) {
  const accounts: Record<string, Record<string, JsonValue>> = { 'user-a': { ...seedA }, 'user-b': {} };
  const gate = { current: null as null | Promise<void> };
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
      if (gate.current) await gate.current;
      if (patch.set?.recents !== undefined) sent.push({ user: id, recents: patch.set.recents as Sent['recents'] });
      accounts[id] = { ...accounts[id]!, ...(patch.set ?? {}) };
      return ok(accounts[id]!);
    },
  });
  return {
    adapter, sent, accounts, gate,
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

async function mountReady(strict = false, seedA: Record<string, JsonValue> = {}) {
  const f = fixture(seedA);
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
/** Lets every queued promise step run (an eager writer dispatches its PATCH through a promise) without moving the clock. */
const dispatch = () => act(async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); });

describe('a held recents visit (#1671)', () => {
  it('keeps visits queued before the first read across a same-account controller replacement (#2034 KER-16)', async () => {
    const f = fixture();
    let release = () => {};
    const reading = new Promise<void>(resolve => { release = resolve; });
    const read = vi.spyOn(f.adapter, 'readPreferences').mockImplementationOnce(async () => { await reading; return ok({}); });
    window.history.replaceState(null, '', '/main');
    render(<I18nProvider><PlatformProvider serverPreferences adapter={f.adapter} registry={registry}><Consumer /></PlatformProvider></I18nProvider>);
    await waitFor(() => expect(read).toHaveBeenCalledTimes(1));
    act(() => { menu.navigate('/mars/plain'); });
    act(() => { f.notify(); });
    await waitFor(() => expect(f.accounts['user-a']!.recents).toEqual([
      expect.objectContaining({ menuId: 'plain' }), expect.objectContaining({ menuId: 'main' }),
    ]));
    release();
    await dispatch();
    expect(urls(host.readRecent())).toEqual(['plain', 'main']);
  });

  it('shows visits while the read has failed and retries when another menu is visited (#2034 KER-16)', async () => {
    const f = fixture();
    const read = vi.spyOn(f.adapter, 'readPreferences').mockRejectedValueOnce(new Error('offline'));
    window.history.replaceState(null, '', '/main');
    render(<I18nProvider><PlatformProvider serverPreferences adapter={f.adapter} registry={registry}><Consumer /></PlatformProvider></I18nProvider>);
    await dispatch();
    expect(read).toHaveBeenCalledTimes(1);
    expect(urls(visits)).toEqual(['main']);
    expect(urls(host.readRecent())).toEqual(['main']);
    act(() => { menu.navigate('/mars/plain'); });
    await waitFor(() => expect(read).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(f.accounts['user-a']!.recents).toEqual([
      expect.objectContaining({ menuId: 'plain' }), expect.objectContaining({ menuId: 'main' }),
    ]));
  });

  it.each([[false], [true]])('shows the latest visit at once and sends one PATCH after the delay (StrictMode %s)', async strict => {
    const { f } = await mountReady(strict);
    pages('2');
    await dispatch();
    await advance(300);
    pages('3');
    await dispatch();
    expect(urls(host.readRecent())).toEqual(['main?3']);
    expect(urls(visits)).toEqual(['main?3']);
    // 1299 ms after the first visit but 999 ms after the latest: the delay restarted, and nothing was sent while promises could run
    await advance(999);
    await dispatch();
    expect(f.sent).toHaveLength(0);
    await advance(1);
    await dispatch();
    expect(f.sent.map(s => [s.user, urls(s.recents)])).toEqual([['user-a', ['main?3']]]);
    await advance(5000);
    expect(f.sent).toHaveLength(1);
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

  it('a controller replacement of the same account keeps the held visit, written with its own timestamp, then the fresh visit of the new controller', async () => {
    const { f } = await mountReady();
    pages('2');
    const at = host.readRecent()[0]!.at;
    act(() => { f.notify(); });
    await dispatch();
    await advance(1100);
    await advance(5000);
    // exactly two ordered writes: the handed-over visit with its own timestamp, then the new controller's own (later) visit of the same address
    expect(f.sent.map(s => [s.user, s.recents.map(r => [r.menuId, r.url.includes('page=2')])])).toEqual([['user-a', [['main', true]]], ['user-a', [['main', true]]]]);
    expect(f.sent[0]!.recents[0]!.at).toBe(at);
    expect(f.sent[1]!.recents[0]!.at).toBeGreaterThanOrEqual(at);
  });

  it('a held visit survives an unmount and a StrictMode remount of the same account: stop/start replay writes the carried visit once, then the fresh one', async () => {
    const { f, view } = await mountReady(true);
    pages('2');
    const at = host.readRecent()[0]!.at;
    view.unmount();
    await dispatch();
    // the same account mounts again under StrictMode (stop/start replay) while the carried visit is waiting on the lane
    render(<StrictMode><I18nProvider><PlatformProvider serverPreferences adapter={f.adapter} registry={registry}><Consumer /></PlatformProvider></I18nProvider></StrictMode>);
    await dispatch();
    await advance(1100);
    await dispatch();
    await advance(5000);
    const mainWrites = f.sent.filter(s => s.recents.some(r => r.url.includes('page=2')));
    expect(mainWrites.map(s => [s.user, s.recents.length])).toEqual([['user-a', 1], ['user-a', 1]]);
    expect(mainWrites[0]!.recents[0]!.at).toBe(at);
    expect(mainWrites[1]!.recents[0]!.at).toBeGreaterThanOrEqual(at);
    expect(f.accounts['user-a']!.recents).toEqual([{ menuId: 'main', url: expect.stringContaining('page=2'), at: mainWrites[1]!.recents[0]!.at }]);
  });

  it('a held visit that expires while its PATCH is in flight is sent once, even when the tree unmounts meanwhile', async () => {
    const { f, view } = await mountReady();
    let release = () => {};
    f.gate.current = new Promise<void>(resolve => { release = resolve; });
    pages('2');
    await advance(1100);
    await dispatch();
    expect(f.sent).toHaveLength(0);
    view.unmount();
    await dispatch();
    release();
    f.gate.current = null;
    await dispatch();
    await advance(5000);
    expect(f.sent.map(s => [s.user, urls(s.recents)])).toEqual([['user-a', ['main?2']]]);
  });

  it('an account switch sends nothing of the held visit for the other account; it stays with its own account', async () => {
    const earlier = { menuId: 'plain', url: '/mars/plain?v=1', at: 1 };
    const { f } = await mountReady(false, { recents: [earlier] });
    pages('2');
    const heldAt = host.readRecent()[0]!.at;
    expect(urls(host.readRecent())).toEqual(['main?2', 'plain']);
    act(() => { f.switchTo('user-b'); });
    await dispatch();
    await advance(1100);
    await advance(50);
    // user-a is not written while the session is user-b's; nothing of user-a's history (its `plain` visit, its held timestamp) reaches user-b
    expect(f.sent.filter(s => s.user === 'user-a')).toEqual([]);
    const forB = f.sent.filter(s => s.user === 'user-b');
    expect(forB.length).toBeLessThanOrEqual(1);
    for (const sent of forB) expect(sent.recents.some(r => r.menuId === 'plain' || r.at === heldAt)).toBe(false);
    expect(JSON.stringify(f.accounts['user-b']!.recents ?? null)).not.toContain('plain');
    expect(f.accounts['user-a']!.recents).toEqual([expect.objectContaining({ menuId: 'main' }), earlier]);
    expect(JSON.stringify(f.accounts['user-a']!.recents)).not.toContain('page=2');
    act(() => { f.switchTo('user-a'); });
    await advance(50);
    await advance(1100);
    const forA = f.sent.filter(s => s.user === 'user-a');
    // one write: the held address on top of A's own history (the switch-back visit of the same address replaces its timestamp)
    expect(forA.map(s => urls(s.recents))).toEqual([['main?2', 'plain']]);
    expect(forA[0]!.recents[0]!.at).toBeGreaterThanOrEqual(heldAt);
    expect(forA[0]!.recents[1]).toEqual(earlier);
  });
});
