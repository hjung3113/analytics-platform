import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { House } from 'lucide-react';
import { useEffect, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { I18nProvider, PlatformProvider, createRegistry } from '@ap/kernel';
import { useHostPlatform, type HostPlatform } from '@ap/kernel/host';
import { noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { groupId, spaceId, type PlatformAdapter, type Session } from '@ap/contracts';
import { RouteOutlet } from '../RouteOutlet';

// #2075: a menu page's local state (refs, caches, selections) belongs to one session generation. A new generation (another user,
// changed permissions or Scope) remounts the page; anything else (a re-render, an endpoint refresh) keeps the same instance.
const noFeatures = { export: false, savedView: false, annotate: false, compare: false };
let mounts = 0;
function StatefulPage() {
  const [picked, setPicked] = useState<string | null>(null);
  useEffect(() => { mounts++; }, []);
  return <div><button type="button" onClick={() => setPicked('row-secret')}>pick</button><p>picked: {picked ?? 'none'}</p></div>;
}
const entry = (id: string, path: string, over: object = {}) => ({
  id, group: groupId('home'), label: { ko: id, en: id }, description: { ko: '', en: '' }, path, icon: House, permission: 'platform:view' as const,
  requiresScope: false, context: noContext, pageType: 'management' as const, features: noFeatures, pageKeys: [], ...over,
});
const registry = createRegistry({
  spaces: [testSpace({ id: spaceId('mars'), homeMenuId: 'mars-home' })],
  groups: [{ id: groupId('home'), label: { ko: '홈', en: 'Home' }, icon: House, space: spaceId('mars') }],
  menus: [entry('mars-home', '/mars-home', { primary: true, component: StatefulPage })],
});

let host!: HostPlatform;
function Probe() { host = useHostPlatform(); return null; }

function sessionAdapter(initial: Session) {
  let session = initial;
  const listeners = new Set<() => void>();
  const adapter = testAdapter({ session: () => session, subscribe: l => { listeners.add(l); return () => { listeners.delete(l); }; } });
  // The adapter's change notice (http adapter: a new `sessionVersion`; mock: a role switch).
  const change = (next: Session) => act(async () => { session = next; listeners.forEach(l => l()); });
  return { adapter, change };
}
const tree = (adapter: PlatformAdapter) => <I18nProvider><PlatformProvider adapter={adapter} registry={registry}><Probe /><RouteOutlet /></PlatformProvider></I18nProvider>;
function pickRow() {
  fireEvent.click(screen.getByRole('button', { name: 'pick' }));
  expect(screen.getByText('picked: row-secret')).toBeTruthy();
}

beforeEach(() => { mounts = 0; window.history.replaceState(null, '', '/mars-home'); });
afterEach(() => { cleanup(); window.history.replaceState(null, '', '/'); });

describe('ScreenOutlet remounts the menu page per session generation (#2075)', () => {
  it.each([
    ['another user', testSession(['platform:view'], { user: { id: 'u2', name: 'u2' } })],
    ['changed permissions of the same user', testSession(['platform:view', 'console:access'])],
    ['a changed Scope grant of the same user', testSession(['platform:view'], { scopes: [{ id: 's1', label: 's1', grantedRooms: 1, totalRooms: 2 }] })],
  ])('a session change notice (%s) drops the page instance and its local state', async (_name, next) => {
    const { adapter, change } = sessionAdapter(testSession(['platform:view']));
    render(tree(adapter));
    pickRow();
    expect(mounts).toBe(1);
    await change(next);
    expect(screen.getByText('picked: none')).toBeTruthy();
    expect(mounts).toBe(2);
  });

  it('a new adapter with another user remounts the page even though its revision counter starts over', () => {
    const first = sessionAdapter(testSession(['platform:view']));
    const { rerender } = render(tree(first.adapter));
    pickRow();
    const second = sessionAdapter(testSession(['platform:view'], { user: { id: 'u2', name: 'u2' } }));
    rerender(tree(second.adapter));
    expect(screen.getByText('picked: none')).toBeTruthy();
    expect(mounts).toBe(2);
  });

  it.each([
    ['fewer permissions', testSession(['platform:view'])],
    ['a smaller Scope grant', testSession(['platform:view', 'console:access'], { scopes: [{ id: 's1', label: 's1', grantedRooms: 1, totalRooms: 2 }] })],
  ])('a new adapter that keeps the same user at revision 0 with %s still remounts the page', (_name, next) => {
    const first = sessionAdapter(testSession(['platform:view', 'console:access'], { scopes: [{ id: 's1', label: 's1', grantedRooms: 2, totalRooms: 2 }] }));
    const { rerender } = render(tree(first.adapter));
    pickRow();
    expect(host.revision).toBe(0);
    rerender(tree(sessionAdapter(next).adapter));
    expect(host.user.id).toBe('u1');
    expect(host.revision).toBe(0);
    expect(screen.getByText('picked: none')).toBeTruthy();
    expect(mounts).toBe(2);
  });

  it('keeps the same page instance when nothing about the session changed', () => {
    const { adapter } = sessionAdapter(testSession(['platform:view']));
    const { rerender } = render(tree(adapter));
    pickRow();
    rerender(tree(adapter));
    act(() => { host.refreshEpochs.bump(['fixture.query']); });
    act(() => { host.toast('notice'); });
    expect(screen.getByText('picked: row-secret')).toBeTruthy();
    expect(mounts).toBe(1);
  });
});
