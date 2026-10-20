import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { House } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, PaneScreenProvider, PlatformProvider, createRegistry, type PaneScreen } from '@ap/kernel';
import { DetailPanelSlotProvider, useDetailPanelSlotHost } from '@ap/ui';
import { memoryStorage, noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { DetailDrawer } from './DetailDrawer';

const features = { export: false, savedView: false, annotate: false, compare: false, board: true };
const menu = (id: string, path: string, over: Record<string, unknown> = {}) => ({
  id, group: 'overview' as const, label: { ko: id, en: id }, description: { ko: '', en: '' }, path, icon: House, permission: 'platform:view' as const,
  requiresScope: false, context: { ...noContext, time: 'apply' as const }, pageType: 'overview' as const, features, pageKeys: ['tab'], ...over,
});
const registry = createRegistry({
  spaces: [testSpace({ homeMenuId: 'home' })],
  groups: [{ id: 'overview', label: { ko: '개요', en: 'Overview' }, icon: House, space: 'analytics' }],
  menus: [{ ...menu('home', '/'), primary: true }, menu('other', '/other'), menu('item', '/item/:id', { navHidden: true })],
});

beforeEach(() => {
  for (const name of ['localStorage', 'sessionStorage'] as const) {
    vi.stubGlobal(name, memoryStorage());
  }
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });

function SlotHost() {
  const slot = useDetailPanelSlotHost();
  return <aside ref={slot.ref} aria-label="상세 패널" />;
}
const session = testSession(['platform:view']);
const adapter = testAdapter({ session: () => session });
const drawer = (onClose: () => void) => <DetailDrawer title="Detail" subtitle="sub" onClose={onClose} tabs={[{ id: 'a', label: 'Attributes', content: <p>attr</p> }]} />;

function Board({ onClose, label = '칸 2 · home' }: { onClose: () => void; label?: string }) {
  const [screen, setScreen] = useState<PaneScreen>({ menuId: 'home', params: {}, query: '?from=2026-09-01T00:00:00&to=2026-09-02T00:00:00&tab=a' });
  const [other, setOther] = useState<PaneScreen>({ menuId: 'home', params: {}, query: '' });
  return <>
    <button type="button" onClick={() => setScreen(s => ({ ...s, query: '?from=2026-08-01T00:00:00&to=2026-08-02T00:00:00&tab=a' }))}>change context</button>
    <button type="button" onClick={() => setScreen(s => ({ ...s, query: s.query.replace('tab=a', 'tab=b') }))}>change page key</button>
    <button type="button" onClick={() => setScreen({ menuId: 'other', params: {}, query: '' })}>change menu</button>
    <button type="button" onClick={() => setOther(s => ({ ...s, query: '?from=2026-08-01T00:00:00&to=2026-08-02T00:00:00' }))}>change sibling</button>
    <div data-pane-id="p1"><PaneScreenProvider paneId="p1" paneLabel={label} screen={screen} onChange={next => setScreen(next)} onLeave={() => {}}>{drawer(onClose)}</PaneScreenProvider></div>
    <div data-pane-id="p2"><PaneScreenProvider paneId="p2" screen={other} onChange={next => setOther(next)} onLeave={() => {}}><p>sibling</p></PaneScreenProvider></div>
  </>;
}
const tree = (ui: React.ReactNode) => <I18nProvider><PlatformProvider adapter={adapter} registry={registry}><DetailPanelSlotProvider>{ui}<SlotHost /></DetailPanelSlotProvider></PlatformProvider></I18nProvider>;

describe('DetailDrawer in a board pane (docs/16 §5)', () => {
  it('shows the pane caption above the title in a pane, and none on the main screen', () => {
    window.history.replaceState(null, '', '/');
    const { unmount } = render(tree(<Board onClose={() => {}} />));
    const panel = screen.getByRole('dialog');
    const caption = panel.querySelector('[data-detail-pane-label]');
    expect(caption).toHaveTextContent('칸 2 · home');
    expect(caption?.nextElementSibling).toHaveTextContent('Detail');
    unmount();
    render(tree(drawer(() => {})));
    expect(screen.getByRole('dialog').querySelector('[data-detail-pane-label]')).toBeNull();
  });

  it.each([['the pane analysis Context', 'change context'], ['the pane menu', 'change menu']])('closes when %s changes after it opened', (_name, button) => {
    const onClose = vi.fn();
    render(tree(<Board onClose={onClose} />));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: button }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it.each([['a page key of the same pane', 'change page key'], ['another pane\'s Context', 'change sibling']])('stays open when %s changes', (_name, button) => {
    const onClose = vi.fn();
    render(tree(<Board onClose={onClose} />));
    fireEvent.click(screen.getByRole('button', { name: button }));
    act(() => {});
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('never closes on a re-render of the same screen', () => {
    const onClose = vi.fn();
    const { rerender } = render(tree(<Board onClose={onClose} />));
    rerender(tree(<Board onClose={onClose} label="칸 3 · home" />));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog').querySelector('[data-detail-pane-label]')).toHaveTextContent('칸 3 · home');
  });

  it('notices a Context change while another pane\'s panel owns the shared slot', () => {
    const first = vi.fn();
    const second = vi.fn();
    function Two() {
      const [screen, setScreen] = useState<PaneScreen>({ menuId: 'home', params: {}, query: '?from=2026-09-01T00:00:00&to=2026-09-02T00:00:00' });
      const [other, setOther] = useState<PaneScreen>({ menuId: 'home', params: {}, query: '?from=2026-09-01T00:00:00&to=2026-09-02T00:00:00' });
      return <>
        <button type="button" onClick={() => setScreen(s => ({ ...s, query: '?from=2026-08-01T00:00:00&to=2026-08-02T00:00:00' }))}>change first</button>
        <PaneScreenProvider paneId="p1" screen={screen} onChange={next => setScreen(next)} onLeave={() => {}}>{drawer(first)}</PaneScreenProvider>
        <PaneScreenProvider paneId="p2" screen={other} onChange={next => setOther(next)} onLeave={() => {}}>{drawer(second)}</PaneScreenProvider>
      </>;
    }
    render(tree(<Two />));
    fireEvent.click(screen.getByRole('button', { name: 'change first' }));
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
  });
});
