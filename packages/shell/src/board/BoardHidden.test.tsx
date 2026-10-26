import { useEffect, useRef, useState } from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformProvider, createRegistry } from '@ap/kernel';
import { useHostPlatform, useToastList } from '@ap/kernel/host';
import { memoryStorage, noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { DetailDrawer, PlatformPage } from '@ap/components';
import { groupId, spaceId, type Session } from '@ap/contracts';
import { AppShell } from '../AppShell';
import { RouteOutlet } from '../RouteOutlet';
import { BoardSurface } from './BoardSurface';
import { BOARD_LAYOUT_ENGINE_KEY } from './layoutEngine';
import { legacyBoard as boardOf, legacySheet as sheet, seedLegacy as seed, V2_KEY } from './__fixtures__/legacyBoard';
import { resetBoardPresentationForTests, withoutDetailKey } from './boardPresentation';
import { boardText } from './text';

/** The covered board (893c2, ADR-0088): transient UI, notices and the detail slot are paused; state and requests are not touched. */
const text = boardText('ko');
const features = { export: false, savedView: false, annotate: false, compare: false, board: true };
const entry = (id: string, path: string, over: Record<string, unknown> = {}) => ({
  id, group: groupId('equipment'), label: { ko: id, en: id }, description: { ko: '', en: '' }, path, icon: House, permission: 'platform:view' as const,
  requiresScope: false, context: { ...noContext, time: 'apply' as const }, pageType: 'analysis' as const, features, pageKeys: [], ...over,
});

const requests: string[] = [];
const resolvers = new Map<string, (value: string) => void>();
const mounted = vi.fn();
const unmounted = vi.fn();
/** One request on mount, answered later by the test; the result lives in the screen's own state. */
function Fetcher({ label }: { label: string }) {
  const { paneId } = useHostPlatform();
  const id = paneId ?? 'main';
  const [result, setResult] = useState('pending');
  const asked = useRef(false);
  useEffect(() => {
    mounted(id);
    if (!asked.current) { asked.current = true; requests.push(`${label}:${id}`); resolvers.set(`${label}:${id}`, setResult); }
    return () => { unmounted(id); };
  }, [id, label]);
  return <p data-testid={`result-${label}-${id}`}>{result}</p>;
}
/** A board screen with a detail it owns (a drawer with its own popover), local state, and a scroll body. */
function Owner() {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('initial');
  return <PlatformPage>
    <Fetcher label="alpha" />
    <input aria-label="draft" value={value} onChange={event => setValue(event.target.value)} />
    <button type="button" onClick={() => setOpen(true)}>open owned detail</button>
    {open && <DetailDrawer title="owned detail" onClose={() => setOpen(false)} tabs={[{ id: 'a', label: 'A', content: <p>owned detail body</p> }]} />}
  </PlatformPage>;
}
/** An ordinary screen with a detail of its own. */
function Ordinary() {
  const [open, setOpen] = useState(false);
  return <PlatformPage>
    <Fetcher label="beta" />
    <button type="button" onClick={() => setOpen(true)}>open general detail</button>
    {open && <DetailDrawer title="general detail" onClose={() => setOpen(false)} tabs={[{ id: 'a', label: 'A', content: <p>general detail body</p> }]} />}
  </PlatformPage>;
}
const Gated = () => <PlatformPage><p data-testid="gated-content">locked result</p></PlatformPage>;

const registry = createRegistry({
  spaces: [testSpace({ homeMenuId: 'home' })],
  groups: [{ id: groupId('equipment'), label: { ko: '그룹', en: 'Group' }, icon: House, space: spaceId('analytics') }],
  menus: [
    { ...entry('home', '/', { component: () => <PlatformPage><p>home</p></PlatformPage>, features: { ...features, board: false } }), primary: true },
    entry('alpha', '/alpha', { component: Owner, label: { ko: '알파', en: 'Alpha' } }),
    entry('beta', '/beta', { component: Ordinary, label: { ko: '베타', en: 'Beta' } }),
    entry('locked', '/locked', { component: Gated, permission: 'console:access', label: { ko: '잠김', en: 'Locked' } }),
  ],
});
const alpha = { menuId: 'alpha', params: {}, query: '' };

let session: Session;
const listeners = new Set<() => void>();
function Nav() {
  const { navigate } = useHostPlatform();
  return <><button type="button" onClick={() => navigate('/beta')}>go beta</button><button type="button" onClick={() => navigate('/board?sheet=a')}>go board</button></>;
}
function mount(url: string, permissions: Session['user']['permissions'] = ['platform:view']) {
  window.history.replaceState(null, '', url);
  session = testSession(permissions);
  const adapter = testAdapter({ session: () => session, subscribe: l => { listeners.add(l); return () => { listeners.delete(l); }; } });
  return render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><Nav /><AppShell><RouteOutlet /></AppShell></PlatformProvider></I18nProvider>);
}
const settle = () => act(() => new Promise(resolve => setTimeout(resolve, 30)));
const asideOpen = () => document.querySelector('aside[data-open]')!.getAttribute('data-open');
const chip = () => screen.queryByRole('button', { name: /^분석 보드 · / });
const paneIdOf = (n: number) => document.querySelector(`[data-pane-index="${n - 1}"]`)!.getAttribute('data-pane-id')!;
const answer = (key: string, value: string) => act(() => { resolvers.get(key)!(value); });

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
  vi.stubGlobal('sessionStorage', memoryStorage());
  localStorage.setItem(BOARD_LAYOUT_ENGINE_KEY, 'grid');
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  requests.length = 0; resolvers.clear(); mounted.mockClear(); unmounted.mockClear();
  resetBoardPresentationForTests();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); listeners.clear(); window.history.replaceState(null, '', '/'); });

describe('a minimized board keeps its state and drops its transient UI (893c2)', () => {
  it('S3: minimize closes the board\'s popover and undo toast and keeps scroll, drafts and the panes mounted', async () => {
    seed(boardOf([sheet('a', { layout: '1x2', panes: [alpha, alpha] })]));
    mount('/board?sheet=a');
    await settle();
    const draft = screen.getAllByRole('textbox', { name: 'draft' })[0];
    fireEvent.change(draft, { target: { value: 'kept' } });
    const body = draft.closest('[data-pane-body]') as HTMLElement;
    body.scrollTop = 75;
    fireEvent.click(screen.getByRole('button', { name: text.browserOnly }));
    expect(screen.getByText(text.storageDetails)).toBeInTheDocument();
    // An undo toast: clearing pane 2 raises one (the pane has content).
    act(() => { screen.getByRole('button', { name: '칸 2 동작' }).dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 })); });
    fireEvent.click(await screen.findByRole('menuitem', { name: '비우기' }));
    await settle();
    expect(screen.getByRole('button', { name: text.undo })).toBeInTheDocument();
    mounted.mockClear(); unmounted.mockClear();

    fireEvent.click(screen.getByRole('button', { name: 'go beta' }));
    await settle();
    expect(chip()).not.toBeNull();
    expect(screen.queryByText(text.storageDetails)).toBeNull();
    expect(screen.queryByRole('button', { name: text.undo })).toBeNull();
    expect(unmounted).not.toHaveBeenCalledWith(expect.stringContaining('.'));

    fireEvent.click(chip()!);
    await settle();
    expect(screen.queryByText(text.storageDetails)).toBeNull();
    expect(screen.queryByRole('button', { name: text.undo })).toBeNull();
    expect(screen.getAllByRole('textbox', { name: 'draft' })[0]).toBe(draft);
    expect(draft).toHaveValue('kept');
    expect(body.scrollTop).toBe(75);
    expect(unmounted).not.toHaveBeenCalledWith(expect.stringContaining('.'));
  });

  it('S3 §4.4 ①: a detail the pane owns is shown again, as the same panel, when the board returns and nothing newer took the slot', async () => {
    seed(boardOf([sheet('a', { panes: [alpha] })]));
    mount('/board?sheet=a');
    await settle();
    fireEvent.change(screen.getByRole('textbox', { name: 'draft' }), { target: { value: 'kept' } });
    fireEvent.click(screen.getByRole('button', { name: 'open owned detail' }));
    const detail = screen.getByRole('dialog', { name: 'owned detail' });
    expect(asideOpen()).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'go beta' }));
    await settle();
    expect(asideOpen()).toBe('false');
    expect(screen.getByRole('dialog', { name: 'owned detail', hidden: true })).toBe(detail);
    fireEvent.click(chip()!);
    await settle();
    expect(asideOpen()).toBe('true');
    expect(screen.getByRole('dialog', { name: 'owned detail' })).toBe(detail);
    expect(screen.getByRole('textbox', { name: 'draft' })).toHaveValue('kept');
  });

  it('§4.4 ② ④: a general detail opened while minimized supersedes the board\'s, and coming back does not revive either', async () => {
    seed(boardOf([sheet('a', { panes: [alpha] })]));
    mount('/board?sheet=a');
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'open owned detail' }));
    fireEvent.click(screen.getByRole('button', { name: 'go beta' }));
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'open general detail' }));
    await settle();
    expect(asideOpen()).toBe('true');
    expect(screen.getByRole('dialog', { name: 'general detail' })).toBeInTheDocument();
    // The board's detail ended because a new detail was opened (its pane closed it), not because of the minimize.
    expect(screen.queryByRole('dialog', { name: 'owned detail', hidden: true })).toBeNull();
    fireEvent.click(chip()!);
    await settle();
    expect(window.location.pathname).toBe('/board');
    expect(screen.queryByRole('dialog', { name: 'general detail', hidden: true })).toBeNull();
    expect(screen.queryByRole('dialog', { name: 'owned detail', hidden: true })).toBeNull();
    expect(asideOpen()).toBe('false');
  });

  it('S3: a covered board raises no notice of its own; the storage notice waits and is said once when the board is shown', async () => {
    localStorage.setItem(V2_KEY, '{nope');
    let setVisible: (visible: boolean) => void = () => {};
    function Wrapper() {
      const [visible, set] = useState(false);
      setVisible = set;
      const toasts = useToastList();
      return <><ul>{toasts.map(toast => <li key={toast.id}>{toast.text}</li>)}</ul>
        <BoardSurface sheetId="a" onSheetChange={() => {}} arrivalKey="x" Outlet={() => <p>pane</p>} visible={visible} /></>;
    }
    const s = testSession(['platform:view']);
    render(<I18nProvider><PlatformProvider adapter={testAdapter({ session: () => s })} registry={registry}><Wrapper /></PlatformProvider></I18nProvider>);
    await settle();
    expect(screen.queryByText(text.storageCorrupt)).toBeNull();
    act(() => { setVisible(true); });
    await settle();
    expect(screen.getAllByText(text.storageCorrupt)).toHaveLength(1);
    act(() => { setVisible(false); });
    await settle();
    expect(screen.queryByText(text.storageCorrupt)).toBeNull();
    act(() => { setVisible(true); });
    await settle();
    expect(screen.queryByText(text.storageCorrupt)).toBeNull();
  });
});

describe('the return address never reopens a general detail (893c2 UX-1)', () => {
  it('UX-1: minimizing from a screen address that carried focus= returns without it, keeps the board detail and hands focus to the chip', async () => {
    seed(boardOf([sheet('a', { panes: [alpha] })]));
    mount('/beta?x=1&focus=zz');
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'go board' }));
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'open owned detail' }));
    const detail = screen.getByRole('dialog', { name: 'owned detail' });
    fireEvent.click(screen.getByRole('button', { name: text.minimize }));
    await settle();
    expect(window.location.pathname).toBe('/beta');
    expect(new URLSearchParams(window.location.search).has('focus')).toBe(false);
    expect(new URLSearchParams(window.location.search).get('x')).toBe('1');
    expect(screen.queryByRole('dialog', { name: 'general detail' })).toBeNull();
    expect(document.activeElement).toBe(chip());
    fireEvent.click(chip()!);
    await settle();
    expect(screen.getByRole('dialog', { name: 'owned detail' })).toBe(detail);
    expect(asideOpen()).toBe('true');
  });

  it('an address without focus is left as it is', () => {
    expect(withoutDetailKey('/beta?x=1&y=2#h')).toBe('/beta?x=1&y=2#h');
    expect(withoutDetailKey('/beta')).toBe('/beta');
    expect(withoutDetailKey('/beta?focus=a&x=1#h')).toBe('/beta?x=1#h');
    expect(withoutDetailKey('/beta?focus=a')).toBe('/beta');
    expect(withoutDetailKey('/beta?xfocus=a&focusx=b')).toBe('/beta?xfocus=a&focusx=b');
  });
});

describe('session and permission edges of a minimized board (893c2)', () => {
  it('S4: a user change unmounts the covered board and drops its chip, draft and return path; the previous user does not get it back', async () => {
    seed(boardOf([sheet('a', { panes: [alpha] })]));
    mount('/board?sheet=a');
    await settle();
    fireEvent.change(screen.getByRole('textbox', { name: 'draft' }), { target: { value: 'secret draft' } });
    fireEvent.click(screen.getByRole('button', { name: 'go beta' }));
    await settle();
    expect(chip()).not.toBeNull();
    session = testSession(['platform:view'], { user: { id: 'u2' } });
    act(() => { listeners.forEach(l => l()); });
    await settle();
    expect(chip()).toBeNull();
    expect(document.querySelector('[data-board]')).toBeNull();
    expect(document.querySelector('[data-board-host]')).toBeNull();
    expect(screen.queryByDisplayValue('secret draft')).toBeNull();
    expect(unmounted).toHaveBeenCalled();
    session = testSession(['platform:view']);
    act(() => { listeners.forEach(l => l()); });
    await settle();
    expect(chip()).toBeNull();
    expect(document.querySelector('[data-board]')).toBeNull();
    expect(screen.queryByDisplayValue('secret draft')).toBeNull();
  });

  it('S4: a permission revoked while minimized shows the pane\'s unavailable state on return, never the earlier result first', async () => {
    seed(boardOf([sheet('a', { panes: [{ menuId: 'locked', params: {}, query: '' }, alpha], layout: '1x2' })]));
    mount('/board?sheet=a', ['platform:view', 'console:access']);
    await settle();
    expect(screen.getByTestId('gated-content')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'go beta' }));
    await settle();
    session = testSession(['platform:view']);
    act(() => { listeners.forEach(l => l()); });
    await settle();
    expect(screen.queryByTestId('gated-content')).toBeNull();
    const seen: boolean[] = [];
    const observer = new MutationObserver(() => { seen.push(document.querySelector('[data-testid="gated-content"]') !== null); });
    observer.observe(document.body, { childList: true, subtree: true });
    fireEvent.click(chip()!);
    await settle();
    observer.disconnect();
    expect(seen).not.toContain(true);
    expect(screen.queryByTestId('gated-content')).toBeNull();
    expect(within(document.querySelector('[data-pane-index="0"]') as HTMLElement).getByText(/이 메뉴에 대한 권한이 없습니다/)).toBeInTheDocument();
  });
});

describe('responses stay with their pane across minimize and restore (893c2, issue §4)', () => {
  it('S5: an answer that arrives while minimized lands in its own pane only; other screens and the restore ask nothing new', async () => {
    seed(boardOf([sheet('a', { layout: '1x2', panes: [alpha, alpha] })]));
    mount('/board?sheet=a');
    await settle();
    const first = `alpha:${paneIdOf(1)}`;
    const second = `alpha:${paneIdOf(2)}`;
    expect(requests).toEqual([first, second]);
    fireEvent.click(screen.getByRole('button', { name: 'go beta' }));
    await settle();
    // The ordinary screen asks its own question and is answered first; the covered panes are answered afterwards.
    expect(requests.at(-1)).toBe('beta:main');
    const asked = requests.length;
    answer('beta:main', 'beta answer');
    answer(first, 'first answer');
    expect(screen.getByTestId('result-beta-main')).toHaveTextContent('beta answer');
    expect(screen.getByTestId(`result-alpha-${paneIdOf(1)}`)).toHaveTextContent('first answer');
    expect(screen.getByTestId(`result-alpha-${paneIdOf(2)}`)).toHaveTextContent('pending');
    fireEvent.click(chip()!);
    await settle();
    answer(second, 'second answer');
    expect(requests).toHaveLength(asked);
    expect(screen.getByTestId(`result-alpha-${paneIdOf(1)}`)).toHaveTextContent('first answer');
    expect(screen.getByTestId(`result-alpha-${paneIdOf(2)}`)).toHaveTextContent('second answer');
    expect(unmounted).not.toHaveBeenCalledWith(paneIdOf(1));
  });
});
