import { act, cleanup, render, screen } from '@testing-library/react';
import { useLayoutEffect } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { House } from 'lucide-react';
import { groupId, type PlatformAdapter, type Session } from '@ap/contracts';
import { I18nProvider, PlatformProvider, createRegistry } from '../../index';
import { useHostPlatform, type HostPlatform } from '../../host';
import { ToastProbe, noContext, testAdapter, testSession, testSpace } from '../../testing';

// #2075: toasts belong to one session generation (adapter, revision, user). The list is dropped on a new generation and a stale
// `toast` closure shows nothing, while a toast the new generation raises in the same commit (a layout effect on mount) stays.
const registry = createRegistry({
  spaces: [testSpace({ homeMenuId: 'main' })],
  groups: [{ id: groupId('g'), label: { ko: '그룹', en: 'Group' }, icon: House, space: testSpace().id }],
  menus: [{ id: 'main', group: groupId('g'), primary: true, label: { ko: 'main', en: 'main' }, description: { ko: '', en: '' }, path: '/main', icon: House, permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'overview', features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: [] }],
});
let host!: HostPlatform;
function Probe() { host = useHostPlatform(); return null; }
function MountToast({ text }: { text: string }) {
  const { toast } = useHostPlatform();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- once per mount, like a screen announcing its arrival
  useLayoutEffect(() => { toast(text); }, []);
  return null;
}
function sessionAdapter(initial: Session) {
  let session = initial;
  const listeners = new Set<() => void>();
  const adapter = testAdapter({ session: () => session, subscribe: l => { listeners.add(l); return () => { listeners.delete(l); }; } });
  return { adapter, change: (next: Session) => act(async () => { session = next; listeners.forEach(l => l()); }) };
}
const tree = (adapter: PlatformAdapter, mountText?: string) => <I18nProvider><PlatformProvider adapter={adapter} registry={registry}>
  <Probe />{mountText && <MountToast key={mountText} text={mountText} />}<ToastProbe />
</PlatformProvider></I18nProvider>;
const listed = () => screen.getByRole('list', { name: 'toasts' }).textContent;

afterEach(cleanup);

describe('toasts per session generation (#2075)', () => {
  it('drops the list on a change notice and refuses a stale toast closure', async () => {
    const { adapter, change } = sessionAdapter(testSession(['platform:view']));
    render(tree(adapter));
    act(() => { host.toast('u1 private'); });
    const stale = host.toast;
    await change(testSession(['platform:view'], { user: { id: 'u2', name: 'u2' } }));
    expect(listed()).toBe('');
    let id = 0;
    act(() => { id = stale('u1 late'); });
    expect(id).toBe(-1);
    expect(listed()).toBe('');
    act(() => { host.toast('u2 notice'); });
    expect(listed()).toBe('u2 notice');
  });

  it('on an adapter swap keeps the toast the new generation raises while mounting, and drops the old one', () => {
    const { rerender } = render(tree(sessionAdapter(testSession(['platform:view'])).adapter, 'first mount'));
    act(() => { host.toast('u1 private'); });
    expect(listed()).toBe('first mountu1 private');
    rerender(tree(sessionAdapter(testSession(['platform:view'])).adapter, 'second mount'));
    expect(listed()).toBe('second mount');
  });
});
