import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useState, type ReactNode } from 'react';
import { House } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, PaneScreenProvider, PlatformProvider, createRegistry, usePlatform, type PaneScreen } from '@ap/kernel';
import { DetailPanelSlotProvider, useDetailPanelSlotHost } from '@ap/ui';
import { memoryStorage, noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { DetailDrawer } from './DetailDrawer';
import { focusPageFallback } from './pageFocus';
import { PlatformPage } from './PlatformPage';
import { groupId, spaceId, type PlatformAdapter, type ScopeCheck } from '@ap/contracts';

const features = { export: false, savedView: false, annotate: false, compare: false, board: true };
const registry = createRegistry({
  spaces: [testSpace({ homeMenuId: 'home' })],
  groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('analytics') }],
  menus: [{ id: 'home', group: groupId('overview'), primary: true, label: { ko: '홈', en: 'Home' }, description: { ko: '', en: '' }, path: '/', icon: House, permission: 'platform:view', requiresScope: true, context: noContext, pageType: 'overview', features, pageKeys: ['x'] }],
});

function adapterWith(validateScope: PlatformAdapter['validateScope']): PlatformAdapter {
  const session = testSession(['platform:view']);
  return testAdapter({ session: () => session, validateScope });
}
const validate = vi.fn(async (_id: string): Promise<ScopeCheck> => ({ status: 'valid', grantedRooms: [] }));

beforeEach(() => {
  validate.mockClear();
  for (const name of ['localStorage', 'sessionStorage'] as const) {
    const data = memoryStorage();
    if (name === 'localStorage') data.setItem('platform:lastScope:u1', JSON.stringify('S9'));
    vi.stubGlobal(name, data);
  }
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });

const seen: { main: ReturnType<typeof usePlatform>; pane: ReturnType<typeof usePlatform> } = { main: undefined as never, pane: undefined as never };
function Probe({ at }: { at: 'main' | 'pane' }) { seen[at] = usePlatform(); return null; }
let mounts = 0;
function Protected() { mounts += 1; return <p>protected body</p>; }

function setup(query: string, adapter: PlatformAdapter = adapterWith(validate), paneChildren?: ReactNode, mainUrl = '/?v=1&scopeId=MEM') {
  window.history.replaceState(null, '', mainUrl);
  mounts = 0;
  const onChange = vi.fn();
  const screenState: PaneScreen = { menuId: 'home', params: {}, query };
  const view = render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry} slots={{ contextBar: <div data-testid="context-bar">bar</div> }}>
    <main tabIndex={-1} aria-label="main-area"><Probe at="main" /><div data-testid="main-page"><PlatformPage><p>main body</p></PlatformPage></div>
      <div data-pane-id="p1" data-testid="pane" tabIndex={-1}>
        <PaneScreenProvider paneId="p1" screen={screenState} onChange={onChange} onLeave={() => {}}>
          <Probe at="pane" />
          <PlatformPage contextExtension={<p>extension</p>}>{paneChildren ?? <Protected />}</PlatformPage>
        </PaneScreenProvider>
      </div></main></PlatformProvider></I18nProvider>);
  return { ...view, onChange };
}

describe('PlatformPage in a board pane (ADR-0049)', () => {
  it('draws content only: no header, no Context bar, the extension and the body stay; the main page keeps its header and bar', async () => {
    setup('?scopeId=S1');
    expect(await within(screen.getByTestId('pane')).findByText('protected body')).toBeTruthy();
    const pane = within(screen.getByTestId('pane'));
    expect(pane.queryByRole('heading', { level: 1 })).toBeNull();
    expect(pane.queryByTestId('context-bar')).toBeNull();
    expect(screen.getByTestId('pane').querySelector('header, [data-page-sticky-header]')).toBeNull();
    expect(pane.getByText('extension')).toBeTruthy();
    expect(screen.getByTestId('pane').querySelector('[data-platform-page-content]')).not.toBeNull();
    const main = within(screen.getByTestId('main-page'));
    expect(main.getByRole('heading', { level: 1 })).toBeTruthy();
    expect(main.getByTestId('context-bar')).toBeTruthy();
  });

  it('keeps the Scope gate per pane: validating and denied states do not mount protected children and hide the extension', async () => {
    const denied = adapterWith(async id => (id === 'BAD' ? { status: 'forbidden', grantedRooms: [] } : { status: 'valid', grantedRooms: [] }));
    setup('?scopeId=BAD', denied);
    await act(async () => { await new Promise(r => setTimeout(r, 0)); });
    expect(mounts).toBe(0);
    expect(screen.queryByText('protected body')).toBeNull();
    expect(screen.queryByText('extension')).toBeNull();
    expect(within(screen.getByTestId('pane')).getByText('이 Scope에 접근 권한이 없습니다')).toBeTruthy();
    expect(within(screen.getByTestId('main-page')).getByText('main body')).toBeTruthy();
  });

  it('retry re-validates only this pane', async () => {
    let fail = true;
    const flaky = vi.fn(async (id: string): Promise<ScopeCheck> => { if (fail && id === 'BAD') throw new Error('down'); return { status: 'valid', grantedRooms: [] }; });
    setup('?scopeId=BAD', adapterWith(flaky));
    await act(async () => { await new Promise(r => setTimeout(r, 0)); });
    const pane = within(screen.getByTestId('pane'));
    expect(pane.getByText('Scope를 확인하지 못했습니다')).toBeTruthy();
    expect(mounts).toBe(0);
    const before = flaky.mock.calls.filter(c => c[0] === 'MEM').length;
    fail = false;
    await act(async () => { pane.getByRole('button', { name: '다시 시도' }).click(); });
    expect(flaky.mock.calls.filter(c => c[0] === 'MEM').length).toBe(before);
    expect(flaky.mock.calls.filter(c => c[0] === 'BAD')).toHaveLength(2);
  });

  it('applies the suggested Scope to this pane only', async () => {
    const view = setup('?v=1', adapterWith(validate), undefined, '/?v=1');
    await act(async () => { await new Promise(r => setTimeout(r, 0)); });
    await act(async () => { within(screen.getByTestId('pane')).getByRole('button', { name: /S9/ }).click(); });
    expect(view.onChange).toHaveBeenCalledTimes(1);
    expect(new URLSearchParams(view.onChange.mock.calls[0]![0].query).get('scopeId')).toBe('S9');
    expect(window.location.search).toBe('?v=1');
    expect(seen.main.global.scopeId).toBeNull();
  });

  it('takes no arrival focus, and a main arrival request is neither consumed nor cancelled by the pane', async () => {
    const view = setup('?scopeId=S1');
    await within(screen.getByTestId('pane')).findByText('protected body');
    expect(document.body).toHaveFocus();
    act(() => { seen.pane.navigate('/?scopeId=S1&x=1', { focus: 'page' }); });
    expect(view.onChange).toHaveBeenCalledTimes(1);
    expect(document.body).toHaveFocus();
    act(() => { seen.main.navigate('/?v=1&scopeId=MEM&x=2', { focus: 'page' }); });
    expect(within(screen.getByTestId('main-page')).getByRole('heading', { level: 1 })).toHaveFocus();
  });
});

describe('focus fallback inside a pane', () => {
  it('focusPageFallback prefers the nearest focusable pane root before main', async () => {
    setup('?scopeId=S1', adapterWith(validate), <button type="button">inside pane</button>);
    const button = await screen.findByRole('button', { name: 'inside pane' });
    focusPageFallback(button);
    expect(screen.getByTestId('pane')).toHaveFocus();
  });

  function SlotHost() {
    const slot = useDetailPanelSlotHost();
    return <aside ref={slot.ref} aria-label="상세 패널" />;
  }
  function DrawerInPane() {
    const [open, setOpen] = useState(true);
    return <I18nProvider><PlatformProvider adapter={adapterWith(validate)} registry={registry}><DetailPanelSlotProvider>
      <main id="platform-main" tabIndex={-1}>
        <div data-pane-id="p1" data-testid="pane" tabIndex={-1}>
          <PaneScreenProvider paneId="p1" screen={{ menuId: 'home', params: {}, query: '?scopeId=S1' }} onChange={() => {}} onLeave={() => {}}>
            {open && <DetailDrawer title="Detail" onClose={() => setOpen(false)} tabs={[{ id: 'a', label: 'Attributes', content: <p>attr</p> }]} />}
          </PaneScreenProvider>
        </div>
      </main><SlotHost />
    </DetailPanelSlotProvider></PlatformProvider></I18nProvider>;
  }

  it('DetailDrawer without a connected opener returns focus to its owning pane root, not main', () => {
    render(<DrawerInPane />);
    const close = screen.getByRole('button', { name: '상세 닫기' });
    expect(close).toHaveFocus();
    fireEvent.click(close);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByTestId('pane')).toHaveFocus();
  });
});
