import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { House } from 'lucide-react';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { I18nProvider, PlatformProvider, createRegistry, useSessionDraft, useUnsavedGuard } from '@ap/kernel';
import { noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { groupId, spaceId, type PlatformAdapter, type Session } from '@ap/contracts';
import { RouteOutlet } from '../RouteOutlet';

// #2075: a menu page's local state (refs, caches, selections) belongs to one session generation. A new generation (another user,
// changed permissions or Scope) remounts the page; anything else (a re-render, an endpoint refresh) keeps the same instance.
const noFeatures = { export: false, savedView: false, annotate: false, compare: false };
let mounts = 0;
function StatefulPage() {
  const [value, setValue, { restored }] = useSessionDraft('input', '');
  useUnsavedGuard(value !== '');
  useEffect(() => { mounts++; }, []);
  return <><input aria-label="draft" value={value} onChange={e => setValue(e.target.value)} /><p>{restored ? 'restored' : 'fresh'}</p></>;
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


function sessionAdapter(initial: Session) {
  let session = initial;
  const listeners = new Set<() => void>();
  const adapter = testAdapter({ session: () => session, subscribe: l => { listeners.add(l); return () => { listeners.delete(l); }; } });
  // The adapter's change notice (http adapter: a new `sessionVersion`; mock: a role switch).
  const change = (next: Session) => act(async () => { session = next; listeners.forEach(l => l()); });
  return { adapter, change };
}
const tree = (adapter: PlatformAdapter) => <I18nProvider><PlatformProvider adapter={adapter} registry={registry}><RouteOutlet /></PlatformProvider></I18nProvider>;
beforeEach(() => { mounts = 0; window.history.replaceState(null, '', '/mars-home'); });
afterEach(() => { cleanup(); window.history.replaceState(null, '', '/'); });

describe('session drafts across the real ScreenOutlet boundary (#2108)', () => {
  it('remounts after a same-user notice, restores input and re-registers the guard', async () => {
    const { adapter, change } = sessionAdapter(testSession(['platform:view']));
    render(tree(adapter));
    fireEvent.change(screen.getByRole('textbox', { name: 'draft' }), { target: { value: 'unsaved' } });
    await change(testSession(['platform:view', 'console:access']));
    expect(mounts).toBe(2);
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('unsaved');
    expect(screen.getByText('restored')).toBeTruthy();
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it('drops A input on switching to B, including when A later returns', async () => {
    const a = testSession(['platform:view']);
    const { adapter, change } = sessionAdapter(a);
    render(tree(adapter));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'A private' } });
    await change(testSession(['platform:view'], { user: { id: 'B', name: 'B' } }));
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('');
    await change(a);
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('');
  });
  it('keeps same-user input across an adapter swap', () => {
    const first = sessionAdapter(testSession(['platform:view']));
    const view = render(tree(first.adapter));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'adapter draft' } });
    view.rerender(tree(sessionAdapter(testSession(['platform:view'])).adapter));
    expect(mounts).toBe(2);
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('adapter draft');
  });

  it('never mounts a revoked menu, and keeps the draft until same-user access returns', async () => {
    const { adapter, change } = sessionAdapter(testSession(['platform:view']));
    render(tree(adapter));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'held private input' } });
    await change(testSession([]));
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByDisplayValue('held private input')).toBeNull();
    await change(testSession(['platform:view']));
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('held private input');
  });

});
