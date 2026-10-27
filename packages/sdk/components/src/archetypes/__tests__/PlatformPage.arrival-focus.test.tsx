import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { House } from 'lucide-react';
import { useLayoutEffect, useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformLink, PlatformProvider, createRegistry, usePlatform, type PlatformMenuEntry } from '@ap/kernel';
import { DetailPanelSlotProvider, useDetailPanelSlotHost } from '@ap/ui';
import { DetailDrawer } from '../../drawer/DetailDrawer';
import { PlatformPage } from '../PlatformPage';
import { ReturnLink } from '../DrillLayout';
import { noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { groupId, spaceId } from '@ap/contracts';

const features = { export: false, savedView: false, annotate: false, compare: false };
function entry(partial: Pick<PlatformMenuEntry, 'id' | 'path'> & Partial<PlatformMenuEntry>): PlatformMenuEntry {
  return {
    group: groupId('overview'), label: { ko: partial.id, en: partial.id }, description: { ko: '', en: '' }, icon: House,
    permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'overview', features, pageKeys: [],
    ...partial,
  };
}

const registry = createRegistry({
  spaces: [testSpace()],
  groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('mars') }],
  menus: [
    entry({ id: 'home', path: '/', primary: true, label: { ko: '홈', en: 'Home' } }),
    entry({ id: 'equipment', path: '/equipment', label: { ko: '설비 마스터', en: 'Equipment master' }, pageKeys: ['focus'] }),
    entry({ id: 'detail', path: '/detail', parent: 'equipment', navHidden: true, pageKeys: ['returnTo'], label: { ko: '설비 상세', en: 'Equipment detail' } }),
  ],
});

const session = testSession(['platform:view']);
const adapter = testAdapter({ session: () => session });
const RETURN_HREF = `/mars/detail?v=1&returnTo=${encodeURIComponent('/mars/equipment?v=1&focus=EQ-1')}`;

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); window.history.replaceState(null, '', '/'); });

function SlotHost() {
  const slot = useDetailPanelSlotHost();
  return <aside ref={slot.ref} aria-label="상세 패널" />;
}

/** `ready` stands in for the detail query: the panel mounts on the commit after arrival, not with it.
 * `note` is a non-focus URL write between arrival and that commit. */
function Routes({ ready, note }: { ready: boolean; note: string }) {
  const { route, pageParam, setPage } = usePlatform();
  const focus = pageParam('focus');
  const sent = useRef('');
  useLayoutEffect(() => {
    if (!note || sent.current === note) return;
    sent.current = note;
    setPage({ note });
  }, [note, setPage]);
  if (route?.menu.id === 'detail') return <PlatformPage title="설비 상세"><ReturnLink /></PlatformPage>;
  if (route?.menu.id === 'home') return <PlatformPage title="홈"><PlatformLink href="/mars/equipment?v=1&focus=EQ-1">설비로</PlatformLink></PlatformPage>;
  return <PlatformPage title="설비 마스터">
    <button type="button" onClick={() => setPage({ focus: 'EQ-1' })}>보기</button>
    <PlatformLink href={RETURN_HREF}>전체 화면</PlatformLink>
    {ready && focus && <DetailDrawer title={focus} onClose={() => setPage({ focus: null })} tabs={[{ id: 'a', label: '속성', content: <button type="button">안쪽</button> }]} />}
  </PlatformPage>;
}

function mount(url: string) {
  window.history.replaceState(null, '', url);
  const view = render(<Harness ready={false} note="" />);
  return {
    ...view,
    settlePanel() { view.rerender(<Harness ready={true} note="" />); },
    changeFilter() { view.rerender(<Harness ready={false} note="1" />); },
  };
  function Harness({ ready, note }: { ready: boolean; note: string }) {
    return <I18nProvider><PlatformProvider adapter={adapter} registry={registry}><DetailPanelSlotProvider>
      <main id="platform-main" tabIndex={-1}><Routes ready={ready} note={note} /></main>
      <SlotHost />
    </DetailPanelSlotProvider></PlatformProvider></I18nProvider>;
  }
}

function expectArrivalFocus() {
  expect(screen.getByRole('heading', { name: '설비 마스터' })).toHaveFocus();
  expect(screen.getByRole('button', { name: '상세 닫기' })).not.toHaveFocus();
  expect(screen.queryByRole('tooltip')).toBeNull();
}

describe('arrival focus wins over a restored detail panel (#356)', () => {
  it.each(['page link', 'return link'])('keeps the title when a %s restores the panel on the next commit', (kind) => {
    const view = mount(kind === 'return link' ? RETURN_HREF : '/?v=1');
    fireEvent.click(screen.getByRole('link', { name: kind === 'return link' ? '← 설비 마스터' : '설비로' }));
    expect(screen.getByRole('heading', { name: '설비 마스터' })).toHaveFocus();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('tooltip')).toBeNull();

    view.changeFilter();
    view.settlePanel();
    expectArrivalFocus();
  });

  it('focuses 상세 닫기 when the panel is opened from the same screen', () => {
    const view = mount('/mars/equipment?v=1');
    view.settlePanel();
    fireEvent.click(screen.getByRole('button', { name: '보기' }));
    expect(screen.getByRole('button', { name: '상세 닫기' })).toHaveFocus();
  });

  it('focuses 상세 닫기 when same-screen history creates focus=', () => {
    const view = mount('/mars/equipment?v=1');
    view.settlePanel();
    fireEvent.click(screen.getByRole('button', { name: '보기' }));
    expect(screen.getByRole('button', { name: '상세 닫기' })).toHaveFocus();
    act(() => {
      window.history.replaceState(null, '', '/mars/equipment?v=1');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(screen.queryByRole('dialog')).toBeNull();
    act(() => {
      window.history.replaceState(null, '', '/mars/equipment?v=1&focus=EQ-1');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(screen.getByRole('button', { name: '상세 닫기' })).toHaveFocus();
  });

  it('keeps the title when Back from another menu restores the panel on a later commit', () => {
    const view = mount('/mars/equipment?v=1');
    fireEvent.click(screen.getByRole('button', { name: '보기' }));
    fireEvent.click(screen.getByRole('link', { name: '전체 화면' }));
    expect(screen.getByRole('heading', { name: '설비 상세' })).toHaveFocus();
    // Back across menus: real popstate traversal onto the panel's URL.
    act(() => {
      window.history.replaceState(null, '', '/mars/equipment?v=1&focus=EQ-1');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(screen.getByRole('heading', { name: '설비 마스터' })).toHaveFocus();
    view.settlePanel();
    expectArrivalFocus();
  });

  it('closes an arrival panel on one Escape after Tab, without a title tooltip', async () => {
    const view = mount('/?v=1');
    fireEvent.click(screen.getByRole('link', { name: '설비로' }));
    view.settlePanel();
    expectArrivalFocus();
    const heading = screen.getByRole('heading', { name: '설비 마스터' });
    // Pointer delay can open the title tooltip while the title stays focused. Tab must blur it first.
    fireEvent.pointerMove(heading, { pointerType: 'mouse' });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 800)); });
    const inside = screen.getByRole('button', { name: '안쪽' });
    fireEvent.keyDown(document.activeElement!, { key: 'Tab' });
    act(() => { inside.focus(); });
    expect(screen.queryByRole('tooltip')).toBeNull();
    fireEvent.keyDown(inside, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});
