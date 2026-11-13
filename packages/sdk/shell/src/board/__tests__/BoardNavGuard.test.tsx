import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformProvider, createRegistry, useUnsavedGuard } from '@ap/kernel';
import { memoryStorage, noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { PlatformPage } from '@ap/components';
import { groupId, spaceId } from '@ap/contracts';
import { AppShell } from '../../frame/AppShell';
import { RouteOutlet } from '../../routing/RouteOutlet';
// RouteOutlet loads the board lazily (#821); evaluate it up front so a short settle does not race a cold dynamic import.
import '../BoardHost';
import { BOARD_LAYOUT_ENGINE_KEY } from '../layoutEngine';
import { legacyBoard as boardOf, legacySheet as sheet, seedLegacy as seed, storedLegacy, V1_KEY, V2_KEY } from '../__fixtures__/legacyBoard';
import { resetBoardPresentationForTests } from '../boardPresentation';
import { OpenInBoardAction } from '../OpenInBoardAction';

/** Opening the board from a menu with unsaved edits asks first; leaving the board back to the menu never does (#2061, ADR-0087, ADR-0115). */
const features = { export: false, savedView: false, annotate: false, compare: false, board: true };
const apply = { ...noContext, time: 'apply' as const, scope: 'apply' as const };
function Editor() {
  const [dirty, setDirty] = useState(false);
  useUnsavedGuard(dirty);
  return <PlatformPage><button type="button" onClick={() => setDirty(true)}>start edit</button>{dirty && <p>editing</p>}</PlatformPage>;
}
const Plain = () => <PlatformPage><p>plain</p></PlatformPage>;
const entry = (id: string, path: string, over: Record<string, unknown> = {}) => ({
  id, group: groupId('equipment'), label: { ko: id, en: id }, description: { ko: '', en: '' }, path, icon: House, permission: 'platform:view' as const,
  requiresScope: false, context: apply, pageType: 'analysis' as const, features, pageKeys: [], ...over,
});
const registry = createRegistry({
  spaces: [testSpace({ homeMenuId: 'home' })],
  groups: [{ id: groupId('equipment'), label: { ko: '그룹', en: 'Group' }, icon: House, space: spaceId('mars') }],
  menus: [
    { ...entry('home', '/', { component: Plain, features: { ...features, board: false } }), primary: true },
    entry('editor', '/editor', { component: Editor, label: { ko: '편집기', en: 'Editor' } }),
  ],
});

const settle = () => act(() => new Promise(resolve => setTimeout(resolve, 30)));
function mount(url: string) {
  window.history.replaceState(null, '', url);
  const session = testSession(['platform:view']);
  return render(<I18nProvider><PlatformProvider adapter={testAdapter({ session: () => session })} registry={registry} slots={{ boardEntry: <OpenInBoardAction /> }}>
    <AppShell><RouteOutlet /></AppShell>
  </PlatformProvider></I18nProvider>);
}
const rail = (name: string | RegExp) => screen.getByRole('button', { name });
const leaveDialog = () => screen.queryByRole('alertdialog');
const path = () => window.location.pathname + window.location.search;
const chip = () => screen.queryByRole('button', { name: /^분석 보드 · / });

beforeEach(() => {
  resetBoardPresentationForTests();
  vi.stubGlobal('localStorage', memoryStorage());
  vi.stubGlobal('sessionStorage', memoryStorage());
  localStorage.setItem(BOARD_LAYOUT_ENGINE_KEY, 'grid');
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) { return this.hasAttribute('data-board-window-area') ? 1200 : 0; });
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function (this: HTMLElement) { return this.hasAttribute('data-board-window-area') ? 900 : 0; });
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  seed(boardOf([sheet('a')]));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); window.history.replaceState(null, '', '/'); });

/** The editor menu, its edit started. Returns its address. */
async function editing(): Promise<string> {
  mount('/editor');
  await settle();
  fireEvent.click(screen.getByRole('button', { name: 'start edit' }));
  await settle();
  return path();
}

describe('opening the board from a menu with unsaved edits (#2061)', () => {
  it('the rail 분석 보드 asks; 머무르기 keeps the menu and its edit, the board does not open', async () => {
    const at = await editing();
    fireEvent.click(rail('분석 보드'));
    await settle();
    expect(leaveDialog()).not.toBeNull();
    expect(path()).toBe(at);
    fireEvent.click(screen.getByRole('button', { name: '머무르기' }));
    await settle();
    expect(leaveDialog()).toBeNull();
    expect(path()).toBe(at);
    expect(screen.getByText('editing')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '창으로 보기' })).toBeNull();
    expect(rail('분석 보드')).toHaveAttribute('data-board-state', 'closed');
  });

  it('the rail 분석 보드 asks; 변경 버리고 이동 opens the board by replace (no new history entry)', async () => {
    await editing();
    const push = vi.spyOn(window.history, 'pushState');
    fireEvent.click(rail('분석 보드'));
    await settle();
    fireEvent.click(screen.getByRole('button', { name: '변경 버리고 이동' }));
    await settle();
    expect(window.location.pathname).toBe('/board');
    expect(await screen.findByRole('button', { name: '창으로 보기' })).toBeTruthy();
    expect(push).not.toHaveBeenCalled();
  });

  it('restoring a minimized maximized board asks too; 머무르기 keeps the menu', async () => {
    mount('/editor');
    await settle();
    fireEvent.click(rail('분석 보드'));
    fireEvent.click(await screen.findByRole('button', { name: '최소화' }));
    await settle();
    const at = path();
    expect(chip()).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'start edit' }));
    await settle();
    fireEvent.click(chip()!);
    await settle();
    expect(leaveDialog()).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '머무르기' }));
    await settle();
    expect(path()).toBe(at);
    expect(screen.getByText('editing')).toBeTruthy();
    expect(chip()).not.toBeNull();
  });

  it('a window over the editing menu: 최대화 asks and 머무르기 keeps the window; 보드 닫기 never asks', async () => {
    mount('/editor');
    await settle();
    fireEvent.click(rail('분석 보드'));
    fireEvent.click(await screen.findByRole('button', { name: '창으로 보기' }));
    await settle();
    const at = path();
    fireEvent.click(screen.getByRole('button', { name: 'start edit' }));
    await settle();
    fireEvent.click(screen.getByRole('button', { name: '최대화' }));
    await settle();
    expect(leaveDialog()).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '머무르기' }));
    await settle();
    expect(path()).toBe(at);
    expect(document.querySelector('[data-floating-mode]')?.getAttribute('data-floating-mode')).toBe('window');
    expect(screen.getByText('editing')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '보드 닫기' }));
    await settle();
    expect(leaveDialog()).toBeNull();
    expect(path()).toBe(at);
    expect(screen.getByText('editing')).toBeTruthy();
  });
});

/** A window over the editing menu. */
async function windowOverEditing() {
  mount('/editor');
  await settle();
  fireEvent.click(rail('분석 보드'));
  fireEvent.click(await screen.findByRole('button', { name: '창으로 보기' }));
  await settle();
  fireEvent.click(screen.getByRole('button', { name: 'start edit' }));
  await settle();
}

describe('the confirmed leave replays the arrival (#2061 review)', () => {
  it('window 최대화 → 변경 버리고 이동 lands on /board with focus on the board heading', async () => {
    await windowOverEditing();
    fireEvent.click(screen.getByRole('button', { name: '최대화' }));
    await settle();
    fireEvent.click(screen.getByRole('button', { name: '변경 버리고 이동' }));
    await settle();
    expect(window.location.pathname).toBe('/board');
    expect(document.activeElement).toBe(document.querySelector('[data-board-heading]'));
  });
});

describe('분석 보드에 열기… from a menu with unsaved edits saves only after the leave is approved (#2061 review)', () => {
  /** Both stored forms, so a write under the migrated key shows too. */
  const stored = () => JSON.stringify([localStorage.getItem(V1_KEY), localStorage.getItem(V2_KEY)]);
  const storedSheets = () => storedLegacy().sheets;
  const beta = { menuId: 'editor', params: {}, query: '' };
  /** The dialog's destination steps, then 열기. */
  async function openFromEditor(pick: 'new' | 'replace') {
    mount('/editor');
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'start edit' }));
    await settle();
    fireEvent.click(screen.getByRole('button', { name: '더보기' }));
    fireEvent.click(await screen.findByRole('button', { name: '분석 보드에 열기…' }));
    await settle();
    const dialog = await screen.findByRole('dialog', { name: '분석 보드에 열기' });
    if (pick === 'replace') {
      fireEvent.click(within(dialog).getByRole('radio', { name: '기존 칸 바꾸기' }));
      fireEvent.click(await within(dialog).findByRole('radio', { name: 'a' }));
      fireEvent.click(await within(dialog).findByRole('radio', { name: /^칸 1/ }));
    }
    fireEvent.click(within(dialog).getByRole('button', { name: '열기' }));
    await settle();
  }

  it.each([['new' as const], ['replace' as const]])('%s: 머무르기 writes nothing and keeps the menu', async pick => {
    seed(boardOf([sheet('a', { panes: [beta] })]));
    const before = stored();
    await openFromEditor(pick);
    expect(leaveDialog()).not.toBeNull();
    expect(stored()).toBe(before);
    fireEvent.click(screen.getByRole('button', { name: '머무르기' }));
    await settle();
    expect(stored()).toBe(before);
    expect(window.location.pathname).not.toBe('/board');
    expect(screen.getByText('editing')).toBeTruthy();
  });

  it.each([['new' as const, 2], ['replace' as const, 1]])('%s: 변경 버리고 이동 saves once and opens the board', async (pick, sheets) => {
    seed(boardOf([sheet('a', { panes: [beta] })]));
    const before = stored();
    await openFromEditor(pick);
    fireEvent.click(screen.getByRole('button', { name: '변경 버리고 이동' }));
    await settle();
    expect(window.location.pathname).toBe('/board');
    expect(stored()).not.toBe(before);
    expect(storedSheets()).toHaveLength(sheets);
  });
});
