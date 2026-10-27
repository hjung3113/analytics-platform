import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { StrictMode, useState } from 'react';
import { House } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformProvider, createRegistry } from '@ap/kernel';
import { PaneScreenProvider, type PaneScreen } from '@ap/kernel/host';
import { DetailPanelSlotProvider, useDetailPanelSlotHost } from '@ap/ui';
import { memoryStorage, noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { DetailDrawer } from '../DetailDrawer';
import { groupId, spaceId } from '@ap/contracts';

const features = { export: false, savedView: false, annotate: false, compare: false, board: true };
const menu = (id: string, path: string, over: Record<string, unknown> = {}) => ({
  id, group: groupId('overview'), label: { ko: id, en: id }, description: { ko: '', en: '' }, path, icon: House, permission: 'platform:view' as const,
  requiresScope: false, context: { ...noContext, time: 'apply' as const }, pageType: 'overview' as const, features, pageKeys: ['tab'], ...over,
});
const registry = createRegistry({
  spaces: [testSpace({ homeMenuId: 'home' })],
  groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('mars') }],
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
      const [firstOpen, setFirstOpen] = useState(true);
      return <>
        <button type="button" onClick={() => setScreen(s => ({ ...s, query: '?from=2026-08-01T00:00:00&to=2026-08-02T00:00:00' }))}>change first</button>
        <PaneScreenProvider paneId="p1" screen={screen} onChange={next => setScreen(next)} onLeave={() => {}}>{firstOpen && drawer(() => { first(); setFirstOpen(false); })}</PaneScreenProvider>
        <PaneScreenProvider paneId="p2" screen={other} onChange={next => setOther(next)} onLeave={() => {}}>{drawer(second)}</PaneScreenProvider>
      </>;
    }
    render(tree(<Two />));
    expect(first).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'change first' }));
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

const savedContext = '?from=2026-09-01T00:00:00&to=2026-09-02T00:00:00';

function SavedPane({ id, initiallyOpen = false, closed }: { id: string; initiallyOpen?: boolean; closed: () => void }) {
  const [saved, setSaved] = useState<PaneScreen>({ menuId: 'home', params: {}, query: initiallyOpen ? `${savedContext}&focus=one&tab=a` : savedContext });
  const focus = new URLSearchParams(saved.query).get('focus');
  return <div data-pane-id={id} tabIndex={-1}>
    <button onClick={() => setSaved(s => ({ ...s, query: `${savedContext}&focus=one&tab=a` }))}>open {id}</button>
    <button onClick={() => setSaved(s => ({ ...s, query: `${savedContext}&focus=two&tab=a` }))}>replace {id}</button>
    <output aria-label={`saved ${id}`}>{saved.query}</output>
    <PaneScreenProvider paneId={id} screen={saved} onChange={setSaved} onLeave={() => {}}>
      {focus && <DetailDrawer key={focus} title={id} onClose={() => { closed(); setSaved(s => ({ ...s, query: savedContext })); }}
        tabs={[{ id: 'a', label: 'Attributes', content: <button>inside {id}</button> }]} />}
    </PaneScreenProvider>
  </div>;
}

it.each([false, true])('takeover never focuses the outgoing opener or fallback (reversed=%s); one close empties saved details', reversed => {
  const first = vi.fn();
  const second = vi.fn();
  const panes = [<SavedPane key="p1" id="p1" closed={first} />, <SavedPane key="p2" id="p2" closed={second} />];
  render(tree(reversed ? panes.reverse() : panes));
  const opener = screen.getByRole('button', { name: 'open p1' });
  opener.focus();
  fireEvent.click(opener);
  screen.getByRole('button', { name: 'inside p1' }).focus();
  const openerFocus = vi.spyOn(opener, 'focus');
  const fallback = vi.spyOn(document.querySelector<HTMLElement>('[data-pane-id="p1"]')!, 'focus');
  fireEvent.click(screen.getByRole('button', { name: 'open p2' }));
  expect(openerFocus).not.toHaveBeenCalled();
  expect(fallback).not.toHaveBeenCalled();
  expect(first).toHaveBeenCalledTimes(1);
  expect(second).not.toHaveBeenCalled();
  expect(screen.getByLabelText('saved p1').textContent).not.toMatch(/focus=|tab=/);
  expect(screen.getByLabelText('saved p2')).toHaveTextContent('focus=one&tab=a');
  expect(screen.getByRole('button', { name: '상세 닫기' })).toHaveFocus();
  fireEvent.click(screen.getByRole('button', { name: '상세 닫기' }));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.getByLabelText('saved p2').textContent).not.toMatch(/focus=|tab=/);
});

it.each([false, true])('StrictMode closes the earlier detail once (simultaneous=%s)', simultaneous => {
  const first = vi.fn();
  const second = vi.fn();
  render(<StrictMode>{tree(<><SavedPane id="p1" initiallyOpen closed={first} /><SavedPane id="p2" initiallyOpen={simultaneous} closed={second} /></>)}</StrictMode>);
  if (!simultaneous) fireEvent.click(screen.getByRole('button', { name: 'open p2' }));
  expect(first).toHaveBeenCalledTimes(1);
  expect(second).not.toHaveBeenCalled();
  expect(screen.getByRole('dialog')).toHaveAccessibleName('p2');
  fireEvent.click(screen.getByRole('button', { name: '상세 닫기' }));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.getByLabelText('saved p1').textContent).not.toMatch(/focus=|tab=/);
});

it('same-pane keyed replacement has a fresh lifetime and ordinary close restores its opener', () => {
  const closed = vi.fn();
  render(tree(<SavedPane id="p1" closed={closed} />));
  const opener = screen.getByRole('button', { name: 'open p1' });
  opener.focus();
  fireEvent.click(opener);
  fireEvent.click(screen.getByRole('button', { name: 'replace p1' }));
  expect(closed).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '상세 닫기' }));
  expect(closed).toHaveBeenCalledTimes(1);
  expect(opener).toHaveFocus();
});

it('uses the later sibling callback from this commit; callback-only changes do not reclaim priority', () => {
  const oldClose = vi.fn();
  const newClose = vi.fn();
  const winnerClose = vi.fn();
  const saved: PaneScreen = { menuId: 'home', params: {}, query: savedContext };
  function Siblings({ add = false, close = oldClose }: { add?: boolean; close?: () => void }) {
    return <>
      <PaneScreenProvider paneId="p2" paneLabel="winner" screen={saved} onChange={() => {}} onLeave={() => {}}>{add && drawer(winnerClose)}</PaneScreenProvider>
      <PaneScreenProvider paneId="p1" paneLabel="outgoing" screen={saved} onChange={() => {}} onLeave={() => {}}>{drawer(close)}</PaneScreenProvider>
    </>;
  }
  const view = render(tree(<Siblings />));
  view.rerender(tree(<Siblings add close={newClose} />));
  expect(newClose).toHaveBeenCalledTimes(1);
  expect(oldClose).not.toHaveBeenCalled();
  expect(winnerClose).not.toHaveBeenCalled();
  view.rerender(tree(<Siblings add close={() => {}} />));
  expect(winnerClose).not.toHaveBeenCalled();
  expect(screen.getByRole('dialog').querySelector('[data-detail-pane-label]')).toHaveTextContent('winner');
});

it('main-screen drawers still resume when their winner unmounts', () => {
  const closed = vi.fn();
  const view = render(tree(<>{drawer(closed)}</>));
  view.rerender(tree(<>{drawer(closed)}{drawer(() => {})}</>));
  expect(closed).not.toHaveBeenCalled();
  view.rerender(tree(<>{drawer(closed)}</>));
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  expect(closed).not.toHaveBeenCalled();
});

it('closing detail skips an inert or collapsed opener and focuses a visible pane fallback', () => {
  function Fixture() {
    const [open, setOpen] = useState(false);
    const [hidden, setHidden] = useState(false);
    return <>
      <button type="button" onClick={() => setHidden(true)}>hide owner</button>
      <div data-pane-id="hidden-owner" tabIndex={-1} inert={hidden || undefined} hidden={hidden}>
        <button type="button" onClick={() => setOpen(true)}>opener</button>
        {open && drawer(() => setOpen(false))}
      </div>
      <div data-pane-id="visible" tabIndex={-1}>visible pane</div>
    </>;
  }
  render(tree(<Fixture />));
  const opener = screen.getByRole('button', { name: 'opener' });
  opener.focus(); fireEvent.click(opener);
  fireEvent.click(screen.getByRole('button', { name: 'hide owner' }));
  const close = screen.getByRole('button', { name: '상세 닫기' });
  close.focus(); fireEvent.click(close);
  expect(document.querySelector('[data-pane-id="visible"]')).toHaveFocus();
});
