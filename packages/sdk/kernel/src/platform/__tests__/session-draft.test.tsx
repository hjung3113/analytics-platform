import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, describe, expect, it } from 'vitest';
import { createRegistry, I18nProvider, PlatformProvider, usePlatform, useSessionDraft } from '../../index';
import { noContext, testAdapter, testSpace } from '../../testing';
import { groupId, spaceId } from '@ap/contracts';

const registry = createRegistry({
  spaces: [testSpace({ homeMenuId: 'editor' })],
  groups: [{ id: groupId('g'), label: { ko: 'G', en: 'G' }, icon: House, space: spaceId('mars') }],
  menus: [{ id: 'editor', path: '/editor', group: groupId('g'), label: { ko: 'Editor', en: 'Editor' }, description: { ko: '', en: '' }, icon: House, primary: true,
    permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'management', pageKeys: [], features: { export: false, savedView: false, annotate: false, compare: false } }],
});
function Editor({ ready = true, draftKey = 'text' }: { ready?: boolean; draftKey?: string }) {
  const [value, setValue, { restored, discard }] = useSessionDraft(draftKey, '', { ready });
  return <><input aria-label="draft" value={value} onChange={e => setValue(e.target.value)} /><button onClick={discard}>discard</button><p>{restored ? 'restored' : 'fresh'}</p></>;
}
function KeyedEditor({ ready = true, draftKey = 'text' }: { ready?: boolean; draftKey?: string }) {
  const { revision } = usePlatform();
  return <Editor key={revision} ready={ready} draftKey={draftKey} />;
}
function setup(keyed = false) {
  window.history.replaceState(null, '', '/editor');
  const listeners = new Set<() => void>();
  const adapter = testAdapter({ subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; } });
  const View = keyed ? KeyedEditor : Editor;
  const tree = (visible = true, ready = true, draftKey = 'text') => <StrictMode><I18nProvider><PlatformProvider registry={registry} adapter={adapter}>{visible && <View ready={ready} draftKey={draftKey} />}</PlatformProvider></I18nProvider></StrictMode>;
  return { tree, bump: () => act(() => listeners.forEach(l => l())) };
}
const input = () => screen.getByRole('textbox') as HTMLInputElement;
const type = () => fireEvent.change(input(), { target: { value: 'typed' } });
afterEach(cleanup);

describe('useSessionDraft lifecycle (#2108)', () => {
  it('clears on ordinary unmount, including after a restoration', async () => {
    const { tree, bump } = setup();
    const view = render(tree());
    type(); bump();
    expect(input().value).toBe('typed');
    view.rerender(tree(false));
    await act(async () => {});
    view.rerender(tree());
    expect(input().value).toBe('');
  });
  it('clears on ordinary unmount even when the same key mounts again before any microtask runs', () => {
    const { tree, bump } = setup(true);
    const view = render(tree());
    type(); bump();
    expect(input().value).toBe('typed');
    view.rerender(tree(false));
    view.rerender(tree());
    expect(input().value).toBe('');
    expect(screen.getByText('fresh')).toBeTruthy();
  });
  it('discard clears stored input before another generation', () => {
    const { tree, bump } = setup();
    render(tree()); type();
    fireEvent.click(screen.getByText('discard'));
    bump();
    expect(input().value).toBe('');
    expect(screen.getByText('fresh')).toBeTruthy();
  });
  it('returns initial while not ready and restores only after the new access check succeeds', () => {
    const { tree, bump } = setup();
    const view = render(tree()); type();
    view.rerender(tree(true, false));
    bump();
    expect(input().value).toBe('');
    expect(screen.getByText('fresh')).toBeTruthy();
    view.rerender(tree());
    expect(input().value).toBe('typed');
    expect(screen.getByText('restored')).toBeTruthy();
  });
  it('keeps caller keys separate', () => {
    const { tree } = setup();
    const view = render(tree()); type();
    view.rerender(tree(true, true, 'other'));
    expect(input().value).toBe('');
  });
  it('survives StrictMode replay on a keyed generation remount with ready: false, then deletes on ordinary unmount', async () => {
    const { tree, bump } = setup(true);
    const view = render(tree());
    type();
    view.rerender(tree(true, false));
    bump();
    expect(input().value).toBe('');
    expect(screen.getByText('fresh')).toBeTruthy();
    view.rerender(tree());
    expect(input().value).toBe('typed');
    expect(screen.getByText('restored')).toBeTruthy();
    view.rerender(tree(false));
    await act(async () => {});
    view.rerender(tree());
    expect(input().value).toBe('');
    expect(screen.getByText('fresh')).toBeTruthy();
  });
});
