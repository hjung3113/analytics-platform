import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState, type ReactNode } from 'react';
import { House } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformProvider, createRegistry, useDrill, usePlatform, type PlatformMenuEntry } from '@ap/kernel';
import { PlatformPage } from '../PlatformPage';
import { DrillLayout, ReturnLink } from '../DrillLayout';
import { memoryStorage, noContext, testAdapter, testSession, testSpace , useToastsForTest } from '@ap/kernel/testing';
import { groupId, spaceId } from '@ap/contracts';

const features = { export: false, savedView: false, annotate: false, compare: false };
const keys = ['drillRoom', 'drillStgroup', 'drillLine', 'drillEquipment'] as const;
const level = (key: string, ko: string, en: string) => ({ key, label: { ko, en } });

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
    entry({
      id: 'source', path: '/source', label: { ko: '생산성 개요', en: 'Productivity overview' },
      pageKeys: [...keys], contextResetKeys: [...keys],
      drill: { levels: [
        level('drillRoom', '공정', 'Process'),
        level('drillStgroup', 'StGroup', 'StGroup'),
        level('drillLine', '라인', 'Line'),
        level('drillEquipment', '설비', 'Equipment'),
      ] },
    }),
    entry({ id: 'plain', path: '/plain', label: { ko: '사이클타임 상세', en: 'Cycle time detail' } }),
    entry({ id: 'detail', path: '/detail', parent: 'source', navHidden: true, pageKeys: ['returnTo'] }),
  ],
});

const session = testSession(['platform:view']);
const adapter = testAdapter({ session: () => session });

let storage = memoryStorage();
beforeEach(() => {
  storage = memoryStorage();
  vi.stubGlobal('localStorage', storage);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function mount(url: string, node: ReactNode) {
  window.history.replaceState(null, '', url);
  return render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}>{node}</PlatformProvider></I18nProvider>);
}

function openMenu(name: string) {
  const trigger = screen.getByRole('button', { name });
  act(() => { trigger.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 })); });
}

const siblings = {
  drillRoom: [{ value: 'PHOTO', hint: '12.0%' }, { value: 'ETCH', hint: '1.0%' }],
  drillStgroup: [{ value: 'A', hint: '4.0%' }, { value: 'B', hint: '2.0%' }],
};

describe('DrillLayout (06 §12.7, ADR-0025)', () => {
  it('hides the path at depth 0 and shows the body', () => {
    mount('/source?v=1', <DrillLayout><p>본문</p></DrillLayout>);
    expect(screen.queryByRole('navigation', { name: '드릴 경로' })).toBeNull();
    expect(screen.getByText('본문')).toBeTruthy();
  });

  it('without fill the output is the plain space-y-4 column; fill makes a bounded flex column with a growing body', () => {
    const view = mount('/source?v=1&drillRoom=PHOTO', <DrillLayout><p>본문</p></DrillLayout>);
    const plain = view.container.innerHTML;
    expect(view.container.firstElementChild?.className).toBe('space-y-4');
    expect(view.container.firstElementChild?.lastElementChild?.tagName).toBe('P');
    view.unmount();
    const filled = mount('/source?v=1&drillRoom=PHOTO', <DrillLayout fill><p>본문</p></DrillLayout>);
    const root = filled.container.firstElementChild!;
    expect(root.className).toBe('flex min-h-0 flex-1 flex-col gap-2');
    expect(root.lastElementChild?.className).toBe('flex min-h-0 flex-1 flex-col');
    expect(root.lastElementChild?.textContent).toBe('본문');
    expect(filled.container.innerHTML).not.toBe(plain);
  });

  it('renders the summary beside the path bar, outside the nav, with the full text as title', () => {
    const text = '공정 PHOTO · StGroup A · 매우 긴 요약 문장이 한 줄 안에서 말줄임표로 잘린다';
    mount('/source?v=1&drillRoom=PHOTO&drillStgroup=A', <DrillLayout summary={text}><p>본문</p></DrillLayout>);
    const summary = screen.getByText(text);
    expect(summary.getAttribute('title')).toBe(text);
    expect(summary.className).toContain('truncate');
    expect(screen.getByRole('navigation', { name: '드릴 경로' }).contains(summary)).toBe(false);
    expect(summary.closest('[aria-live]')).toBeNull();
  });

  it('keeps a width share for the summary when the path bar wraps', () => {
    mount('/source?v=1&drillRoom=PHOTO', <DrillLayout summary="요약"><p>본문</p></DrillLayout>);
    const summary = screen.getByText('요약');
    const nav = screen.getByRole('navigation', { name: '드릴 경로' });
    expect(summary.className).toEqual(expect.stringContaining('basis-48'));
    expect(summary.className).toEqual(expect.stringContaining('min-w-0'));
    expect(summary.className).toEqual(expect.stringContaining('flex-1'));
    expect(nav.className).toContain('min-w-0');
    expect(summary.parentElement?.className).toContain('flex-wrap');
  });

  it('keeps the bare path bar classes when there is no summary', () => {
    mount('/source?v=1&drillRoom=PHOTO', <DrillLayout><p>본문</p></DrillLayout>);
    expect(screen.getByRole('navigation', { name: '드릴 경로' }).className).toBe('flex flex-wrap items-center gap-1 text-xs');
  });

  it('keeps the same nav and focused chip when a summary arrives after the first render', () => {
    const tree = (summary: string | null) => <I18nProvider><PlatformProvider adapter={adapter} registry={registry}><DrillLayout summary={summary}><p>본문</p></DrillLayout></PlatformProvider></I18nProvider>;
    window.history.replaceState(null, '', '/source?v=1&drillRoom=PHOTO');
    const view = render(tree(null));
    const chip = screen.getByRole('button', { name: '공정: PHOTO' });
    const nav = screen.getByRole('navigation', { name: '드릴 경로' });
    chip.focus();
    expect(document.activeElement).toBe(chip);
    view.rerender(tree('Module PHOTO · 1.00 초'));
    expect(screen.getByText('Module PHOTO · 1.00 초')).toBeTruthy();
    expect(screen.getByRole('button', { name: '공정: PHOTO' })).toBe(chip);
    expect(screen.getByRole('navigation', { name: '드릴 경로' })).toBe(nav);
    expect(document.activeElement).toBe(chip);
  });

  it('hides the summary at depth 0 like the path bar', () => {
    mount('/source?v=1', <DrillLayout summary="요약"><p>본문</p></DrillLayout>);
    expect(screen.queryByText('요약')).toBeNull();
  });

  it('leaves a ReactNode summary to carry its own title', () => {
    mount('/source?v=1&drillRoom=PHOTO', <DrillLayout summary={<span data-testid="node">노드</span>}><p>본문</p></DrillLayout>);
    const node = screen.getByTestId('node');
    expect(node.getAttribute('title')).toBeNull();
    expect(node.parentElement?.getAttribute('title')).toBeNull();
  });

  it('moves up from a chip and marks the last chip as the current step', () => {
    mount('/source?v=1&drillRoom=PHOTO&drillStgroup=A', <DrillLayout siblings={siblings}><p>본문</p></DrillLayout>);
    expect(screen.getByRole('navigation', { name: '드릴 경로' })).toBeTruthy();
    const current = screen.getByRole('button', { name: 'StGroup: A' });
    expect(current.getAttribute('aria-current')).toBe('step');
    expect(screen.getByRole('button', { name: '공정: PHOTO' }).getAttribute('aria-current')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '공정: PHOTO' }));
    expect(window.location.search).toBe('?v=1&drillRoom=PHOTO');
    expect(screen.queryByRole('button', { name: 'StGroup: A' })).toBeNull();
    expect(screen.getByText('본문')).toBeTruthy();
  });

  it('switches a sibling from the menu and clears later steps', async () => {
    mount('/source?v=1&drillRoom=PHOTO&drillStgroup=A', <DrillLayout siblings={siblings}><p>본문</p></DrillLayout>);
    openMenu('공정 바꾸기');
    expect((await screen.findByRole('menuitemradio', { name: /PHOTO/ })).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByRole('menuitemradio', { name: /ETCH/ }));
    expect(window.location.search).toBe('?v=1&drillRoom=ETCH');
  });

  it('collapses depth 4 to All, a middle menu and the last two chips', async () => {
    mount('/source?v=1&drillRoom=PHOTO&drillStgroup=A&drillLine=L1&drillEquipment=E1', <DrillLayout><p>본문</p></DrillLayout>);
    expect(screen.queryByRole('button', { name: '공정: PHOTO' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'StGroup: A' })).toBeNull();
    expect(screen.getByRole('button', { name: '라인: L1' }).getAttribute('aria-current')).toBeNull();
    expect(screen.getByRole('button', { name: '설비: E1' }).getAttribute('aria-current')).toBe('step');
    openMenu('가운데 단계');
    fireEvent.click(await screen.findByRole('menuitem', { name: '공정: PHOTO' }));
    expect(window.location.search).toBe('?v=1&drillRoom=PHOTO');
  });

  it('replaces the body on a format error and does not substitute a value', () => {
    mount('/source?v=1&drillStgroup=LATE', <DrillLayout notFound={{ key: 'drillRoom', value: 'NOPE' }}><p>본문</p></DrillLayout>);
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('StGroup “LATE”는 앞 단계 없이 쓸 수 없습니다.');
    expect(alert.textContent).not.toContain('drillStgroup=');
    expect(screen.queryByText('본문')).toBeNull();
    expect(screen.queryByText(/없는 값/)).toBeNull();
    expect(window.location.search).toBe('?v=1&drillStgroup=LATE');
  });

  it('format error: the clear button removes the invalid step and focus goes to the title at depth 0', () => {
    mount('/source?v=1&drillStgroup=LATE', <PlatformPage><DrillLayout><p>본문</p></DrillLayout></PlatformPage>);
    fireEvent.click(screen.getByRole('button', { name: '잘못된 단계 지우기' }));
    expect(new URLSearchParams(window.location.search).has('drillStgroup')).toBe(false);
    expect(screen.getByText('본문')).toBeTruthy();
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement?.tagName).toBe('H1');
  });

  it('format error at depth 1: the clear button keeps the valid trail and focuses its step chip', () => {
    mount('/source?v=1&drillRoom=PHOTO&drillLine=L1', <PlatformPage><DrillLayout><p>본문</p></DrillLayout></PlatformPage>);
    fireEvent.click(screen.getByRole('button', { name: '잘못된 단계 지우기' }));
    const params = new URLSearchParams(window.location.search);
    expect(params.get('drillRoom')).toBe('PHOTO');
    expect(params.has('drillLine')).toBe(false);
    expect(document.activeElement).not.toBe(document.body);
  });

  it('replaces the body when the step value is missing', () => {
    mount('/source?v=1&drillRoom=PHOTO', <DrillLayout notFound={{ key: 'drillRoom', value: 'NOPE' }}><p>본문</p></DrillLayout>);
    const status = screen.getByRole('status');
    expect(status.textContent).toContain('이 조건에서 없는 값: NOPE');
    expect(screen.queryByText('본문')).toBeNull();
  });

  it('names the path and the sibling control in English', () => {
    storage.setItem('platform:lang', 'en');
    mount('/source?v=1&drillRoom=PHOTO', <DrillLayout siblings={siblings}><p>Body</p></DrillLayout>);
    expect(screen.getByRole('navigation', { name: 'Drill path' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Change Process' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'All' })).toBeTruthy();
  });
});

describe('DrillLayout keeps a body child across drill steps (06 §12.7, #912)', () => {
  it('does not key or remount its body per step: a child declared in the same place keeps its instance and state', () => {
    let mounts = 0;
    function Panel() {
      const [seen] = useState(() => { mounts += 1; return mounts; });
      const [text, setText] = useState('');
      return <input aria-label="메모" value={text} data-seen={seen} onChange={event => setText(event.target.value)} />;
    }
    function Page() {
      const drill = useDrill();
      return <DrillLayout><Panel /><button onClick={() => drill.enter('drillStgroup', 'A')}>step</button></DrillLayout>;
    }
    mount('/source?v=1&drillRoom=PHOTO', <Page />);
    const input = screen.getByRole('textbox', { name: '메모' });
    fireEvent.change(input, { target: { value: '남는다' } });
    fireEvent.click(screen.getByRole('button', { name: 'step' }));
    expect(window.location.search).toContain('drillStgroup=A');
    expect(screen.getByRole('textbox', { name: '메모' })).toBe(input);
    expect((input as HTMLInputElement).value).toBe('남는다');
    expect(mounts).toBe(1);
  });
});

describe('ReturnLink (06 §22, ADR-0025)', () => {
  it('names the origin menu and its drill trail', () => {
    const accepted = '/source?v=1&drillRoom=PHOTO&drillStgroup=A&drillLine=L1&drillEquipment=E';
    mount(`/detail?v=1&returnTo=${encodeURIComponent(accepted)}`, <ReturnLink />);
    const link = screen.getByRole('link', { name: '← 생산성 개요 (PHOTO › A › L1 › E)' });
    expect(link.getAttribute('href')).toBe(accepted);
  });

  it('names the parent menu when returnTo is absent', () => {
    mount('/detail?v=1', <ReturnLink />);
    const link = screen.getByRole('link', { name: '← 생산성 개요' });
    expect(link.getAttribute('href')).toBe('/source?v=1');
    expect(link.textContent).not.toContain('›');
  });
});


const settleFocus = () => act(() => new Promise(resolve => setTimeout(resolve, 30)));
function FocusFixture() {
  const drill = useDrill();
  return <PlatformPage><DrillLayout siblings={siblings}>
    <button onClick={() => drill.enter('drillRoom', 'PHOTO')}>enter</button><button>unrelated</button>
  </DrillLayout></PlatformPage>;
}
it.each(['enter', 'parent', 'all', 'sibling', 'middle'])('focuses the exact drill destination after %s', async action => {
  const url = action === 'enter' ? '/source?v=1' : action === 'middle'
    ? '/source?v=1&drillRoom=PHOTO&drillStgroup=A&drillLine=L1&drillEquipment=E1'
    : '/source?v=1&drillRoom=PHOTO&drillStgroup=A';
  mount(url, <FocusFixture />);
  if (action === 'enter') fireEvent.click(screen.getByRole('button', { name: 'enter' }));
  if (action === 'parent') fireEvent.click(screen.getByRole('button', { name: '공정: PHOTO' }));
  if (action === 'all') fireEvent.click(screen.getByRole('button', { name: '전체' }));
  if (action === 'sibling') { openMenu('공정 바꾸기'); fireEvent.click(await screen.findByRole('menuitemradio', { name: /ETCH/ })); }
  if (action === 'middle') { openMenu('가운데 단계'); fireEvent.click(await screen.findByRole('menuitem', { name: '공정: PHOTO' })); }
  await settleFocus();
  const destination = action === 'all' ? screen.getByRole('heading', { name: '생산성 개요' })
    : screen.getByRole('button', { name: action === 'sibling' ? '공정: ETCH' : '공정: PHOTO' });
  expect(destination).toHaveFocus();
  const unrelated = screen.getByRole('button', { name: 'unrelated' });
  unrelated.focus();
  fireEvent.click(screen.getByRole('button', { name: action === 'all' ? 'enter' : action === 'sibling' ? '공정: ETCH' : '공정: PHOTO' }));
  if (action !== 'all') { await settleFocus(); expect(unrelated).toHaveFocus(); }
});
it('focuses the destination page title when ReturnLink unmounts on navigation', async () => {
  function Routes() {
    const { route } = usePlatform();
    return route?.menu.id === 'detail'
      ? <PlatformPage key="detail"><ReturnLink /></PlatformPage>
      : <PlatformPage key="source"><p>destination</p></PlatformPage>;
  }
  mount('/detail?v=1', <Routes />);
  const link = screen.getByRole('link', { name: '← 생산성 개요' });
  link.focus();
  fireEvent.click(link);
  await settleFocus();
  expect(link.isConnected).toBe(false);
  expect(screen.getByRole('heading', { name: '생산성 개요' })).toHaveFocus();
});

it.each(['loading', 'failure'])('uses the persistent page title when the drill body has no path during %s', async state => {
  function Fixture() {
    const drill = useDrill();
    return <PlatformPage>{drill.depth === 0
      ? <button onClick={() => drill.enter('drillRoom', 'PHOTO')}>enter</button>
      : <p role="status">{state}</p>}</PlatformPage>;
  }
  mount('/source?v=1', <Fixture />);
  screen.getByRole('button', { name: 'enter' }).focus();
  fireEvent.click(screen.getByRole('button', { name: 'enter' }));
  await settleFocus();
  expect(screen.getByRole('heading', { name: '생산성 개요' })).toHaveFocus();
  expect(screen.getByRole('status')).toHaveTextContent(state);
});


it.each(['drill', 'return'])('preserves pending %s focus across a same-user session snapshot refresh', async kind => {
  let currentSession = session;
  const listeners = new Set<() => void>();
  const refreshAdapter = testAdapter({
    session: () => currentSession,
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
  });
  function Routes() {
    const { route } = usePlatform();
    const drill = useDrill();
    const [ready, setReady] = useState(false);
    return <>
      <button onClick={() => drill.enter('drillRoom', 'PHOTO')}>pending drill</button>
      <button onClick={() => setReady(true)}>resolve destination</button>
      {route?.menu.id === 'detail' ? <ReturnLink /> : ready && <PlatformPage>
        {kind === 'drill' ? <DrillLayout siblings={siblings}>destination</DrillLayout> : 'destination'}
      </PlatformPage>}
    </>;
  }
  window.history.replaceState(null, '', kind === 'return' ? '/detail?v=1' : '/source?v=1');
  render(<I18nProvider><PlatformProvider adapter={refreshAdapter} registry={registry}><Routes /></PlatformProvider></I18nProvider>);
  fireEvent.click(screen.getByRole(kind === 'return' ? 'link' : 'button', { name: kind === 'return' ? '← 생산성 개요' : 'pending drill' }));
  act(() => {
    currentSession = { ...session, user: { ...session.user } };
    listeners.forEach(listener => listener());
  });
  const resolve = screen.getByRole('button', { name: 'resolve destination' });
  resolve.focus();
  fireEvent.click(resolve);
  await settleFocus();
  expect(screen.getByRole(kind === 'drill' ? 'button' : 'heading', { name: kind === 'drill' ? '공정: PHOTO' : '생산성 개요' })).toHaveFocus();
});

it.each(['preset', 'reset', 'history', 'setPage', 'navigate'])('preserves Context control focus after %s changes drill keys', async action => {
  function ContextControls() {
    const { setGlobal, resetContext, setPage, navigate } = usePlatform();
    return <button aria-label="7일" onClick={() => {
      if (action === 'preset') setGlobal({ from: '2026-10-01T00:00:00', to: '2026-10-08T00:00:00' });
      if (action === 'reset') resetContext();
      if (action === 'setPage') setPage({ drillRoom: null, drillStgroup: null });
      if (action === 'navigate') navigate('/source?v=1');
      if (action === 'history') {
        window.history.replaceState(null, '', '/source?v=1&drillRoom=ETCH');
        window.dispatchEvent(new PopStateEvent('popstate'));
      }
    }}>7일</button>;
  }
  window.history.replaceState(null, '', '/source?v=1&drillRoom=PHOTO&drillStgroup=A&from=2026-09-01T00:00:00&to=2026-09-08T00:00:00');
  render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry} slots={{ contextBar: <ContextControls /> }}><PlatformPage><DrillLayout /></PlatformPage></PlatformProvider></I18nProvider>);
  const preset = screen.getByRole('button', { name: '7일' });
  preset.focus();
  fireEvent.click(preset);
  await settleFocus();
  expect(preset).toHaveFocus();
  expect(new URLSearchParams(window.location.search).get('drillStgroup')).toBeNull();
});


it.each(['defaults', 'metric defaults', 'other navigation', 'history', 'denied'])('binds cold ReturnLink focus to its navigation with %s', async action => {
  const coldRegistry = createRegistry({
    spaces: [testSpace()],
    groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('mars') }],
    menus: [
      entry({ id: 'home', path: '/', primary: true }),
      entry({ id: 'source', path: '/source', context: { ...noContext, time: 'apply' }, initializesMetric: action === 'metric defaults' }),
      entry({ id: 'plain', path: '/plain' }),
      entry({ id: 'detail', path: '/detail', parent: 'source', navHidden: true, pageKeys: ['returnTo'] }),
    ],
  });
  const target = action === 'metric defaults' ? '/source?v=1&metricId=CT' : action === 'defaults' ? '/source?v=1' : '/source?v=1&from=2026-09-25T09:00:00&to=2026-09-26T09:00:00';
  function Routes() {
    const { route, navigate, can } = usePlatform();
    const [ready, setReady] = useState(false);
    return <><button onClick={() => setReady(true)}>resolve destination</button>
      <button onClick={() => navigate('/plain?v=1')}>other navigation</button>
      <button onClick={() => navigate(target)}>revisit</button>
      {route?.menu.id === 'detail' ? <PlatformPage key="detail"><ReturnLink /></PlatformPage>
        : ready && can(route!.menu.permission) ? <PlatformPage key={route!.menu.id}>destination</PlatformPage> : null}</>;
  }
  // A denied route must cancel even while no PlatformPage can consume the request.
  const deniedSession = testSession([]);
  let denied = action === 'denied';
  const listeners = new Set<() => void>();
  const coldAdapter = testAdapter({ publishedMetrics: () => [{ metricId: 'CT', publishedVersion: '7' }], session: () => denied ? deniedSession : session, subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); } });
  window.history.replaceState(null, '', `/detail?v=1&returnTo=${encodeURIComponent(target)}`);
  render(<I18nProvider><PlatformProvider adapter={coldAdapter} registry={coldRegistry}><Routes /></PlatformProvider></I18nProvider>);
  const link = screen.getByRole('link', { name: /^←/ });
  link.focus();
  fireEvent.click(link);
  expect(window.location.pathname).toBe(action === 'denied' ? '/' : '/source');
  if (action !== 'denied') expect(new URLSearchParams(window.location.search).get('from')).not.toBeNull();
  if (action === 'other navigation') {
    fireEvent.click(screen.getByRole('button', { name: 'other navigation' }));
    fireEvent.click(screen.getByRole('button', { name: 'revisit' }));
  }
  if (action === 'history') {
    act(() => {
      window.history.replaceState(null, '', target);
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
  }
  act(() => { denied = false; for (const listener of listeners) listener(); });
  const resolve = screen.getByRole('button', { name: 'resolve destination' });
  resolve.focus();
  fireEvent.click(resolve);
  await settleFocus();
  if (action === 'metric defaults') expect(new URLSearchParams(window.location.search).get('metricVersion')).toBe('7');
  if (action === 'defaults' || action === 'metric defaults') expect(screen.getByRole('heading', { name: 'source' })).toHaveFocus();
  else expect(resolve).toHaveFocus();
});


it.each([true, false])('announces reverted Context exactly once after return: %s', changed => {
  function Fixture() {
    const { url } = usePlatform();
    const toasts = useToastsForTest();
    return <><ReturnLink /><output>{JSON.stringify({ toasts, url })}</output></>;
  }
  const origin = '/source?v=1';
  mount(`/detail?v=1${changed ? '&metricId=cycle_time&metricVersion=4' : ''}&returnTo=${encodeURIComponent(origin)}`, <Fixture />);
  expect(JSON.parse(screen.getByRole('status').textContent!).toasts).toHaveLength(0);
  fireEvent.click(screen.getByRole('link', { name: '← 생산성 개요' }));
  const result = JSON.parse(screen.getByRole('status').textContent!);
  expect(result.url).toBe(origin);
  expect(result.toasts).toHaveLength(changed ? 1 : 0);
  if (changed) expect(result.toasts[0].text).toBe('출발 화면의 Context로 돌아왔습니다. 상세에서 바꾼 항목을 되돌렸습니다: 지표·버전');
});

it('announces reverted Scope exactly once after return', () => {
  function Fixture() {
    const { url } = usePlatform();
    const toasts = useToastsForTest();
    return <><ReturnLink /><output>{JSON.stringify({ toasts, url })}</output></>;
  }
  const origin = '/source?v=1&scopeId=MEM';
  mount(`/detail?v=1&scopeId=FDRY&returnTo=${encodeURIComponent(origin)}`, <Fixture />);
  expect(JSON.parse(screen.getByRole('status').textContent!).toasts).toHaveLength(0);
  fireEvent.click(screen.getByRole('link', { name: '← 생산성 개요' }));
  const result = JSON.parse(screen.getByRole('status').textContent!);
  expect(result.url).toBe(origin);
  expect(result.toasts).toHaveLength(1);
  expect(result.toasts[0].text).toBe('출발 화면의 Context로 돌아왔습니다. 상세에서 바꾼 항목을 되돌렸습니다: Scope');
});


describe('unbounded drill path (#541)', () => {
  it('collapses six levels and keeps a keyboard path to a previous level', async () => {
    const deepKeys = ['a', 'b', 'c', 'd', 'e', 'f'];
    const deepRegistry = createRegistry({
      spaces: [testSpace()],
      groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('mars') }],
      menus: [entry({ id: 'home', path: '/', primary: true, pageKeys: deepKeys, contextResetKeys: deepKeys, drill: { levels: deepKeys.map(key => level(key, key, key)) } })],
    });
    window.history.replaceState(null, '', '/?v=1&a=1&b=2&c=3&d=4&e=5&f=6');
    render(<I18nProvider><PlatformProvider adapter={adapter} registry={deepRegistry}><DrillLayout><p>Deep body</p></DrillLayout></PlatformProvider></I18nProvider>);
    expect(screen.queryByRole('button', { name: 'a: 1' })).toBeNull();
    const middle = screen.getByRole('button', { name: '가운데 단계' });
    fireEvent.keyDown(middle, { key: 'Enter' });
    const prior = await screen.findByRole('menuitem', { name: 'd: 4' });
    prior.focus(); fireEvent.keyDown(prior, { key: 'Enter' });
    expect(window.location.search).toBe('?v=1&a=1&b=2&c=3&d=4');
    expect(screen.getByRole('button', { name: 'd: 4' }).getAttribute('aria-current')).toBe('step');
    fireEvent.click(screen.getByRole('button', { name: '전체' }));
    expect(window.location.search).toBe('?v=1');
  });
});
