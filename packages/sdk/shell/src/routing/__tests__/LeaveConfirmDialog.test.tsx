import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { House } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { groupId, spaceId, type Text } from '@ap/contracts';
import { PlatformPage } from '@ap/components';
import { createRegistry, I18nProvider, PlatformLink, PlatformProvider, useI18n, useUnsavedGuard, type UnsavedGuardOptions } from '@ap/kernel';
import { useHostPlatform } from '@ap/kernel/host';
import { memoryStorage, noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { AppShell } from '../../frame/AppShell';

const registry = createRegistry({
  spaces: [testSpace({ homeMenuId: 'draft' })],
  groups: [{ id: groupId('editing'), label: { ko: '편집', en: 'Editing' }, icon: House, space: spaceId('mars') }],
  menus: ['draft', 'target', 'third'].map((id, index) => ({
    id, group: groupId('editing'), path: `/${id}`, primary: index === 0,
    label: { ko: ['초안', '대상', '다른 대상'][index], en: ['Draft', 'Target', 'Another target'][index] },
    description: { ko: '', en: '' }, icon: House, permission: 'platform:view' as const,
    requiresScope: false, context: noContext, pageType: 'overview' as const,
    features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: [],
  })),
});
const draftMenu = registry.menus[0];
const discard = vi.fn();
/** `leaves` of the editor's guard; the default (leaving the menu) unless a test widens it. */
let editorLeaves: UnsavedGuardOptions['leaves'];
function Editor({ message }: { message?: string | Text }) {
  const [draft, setDraft] = useState('');
  useUnsavedGuard(draft !== '', { message, onDiscard: discard, leaves: editorLeaves });
  const { navigate } = useHostPlatform();
  return <>
    <input aria-label="draft" value={draft} onChange={event => setDraft(event.target.value)} />
    <button onClick={() => navigate('/unknown?v=1')}>unknown destination</button>
    <button onClick={() => navigate('/mars/draft?v=1&view=2')}>same menu move</button>
    <button onClick={() => navigate('/mars/target?v=1')}>programmatic move</button>
    <PlatformLink href="/mars/target?v=1">in-page target</PlatformLink>
  </>;
}
function Content({ message }: { message?: string | Text }) {
  const { route } = useHostPlatform();
  const { tx } = useI18n();
  return <PlatformPage title={tx(route?.menu.label ?? { ko: '없음', en: 'Missing' })}>
    {route?.menu === draftMenu && <Editor message={message} />}
  </PlatformPage>;
}
function mount(message?: string | Text) {
  const session = testSession(['platform:view']);
  render(<I18nProvider><PlatformProvider registry={registry} adapter={testAdapter({ session: () => session })}>
    <AppShell><Content message={message} /></AppShell>
  </PlatformProvider></I18nProvider>);
}
const sidebarTarget = () => within(screen.getByRole('navigation', { name: '주 메뉴' })).getByRole('link', { name: '대상' });
async function dirty(message?: string | Text) {
  mount(message);
  await userEvent.setup().type(screen.getByRole('textbox', { name: 'draft' }), 'keep me');
}
const dialog = () => screen.getByRole('alertdialog');
const stay = () => within(dialog()).getByRole('button', { name: '머무르기' });
const leave = () => within(dialog()).getByRole('button', { name: '변경 버리고 이동' });
beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
  vi.stubGlobal('localStorage', memoryStorage());
  vi.stubGlobal('sessionStorage', memoryStorage());
  localStorage.setItem('platform:sidebar-collapsed', '0');
  window.history.replaceState(null, '', '/mars/draft?v=1');
  discard.mockClear();
  editorLeaves = undefined;
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('leave confirmation (06 §6.4, §26)', () => {
  it('renders only for a pending request, and a clean sidebar move never asks', async () => {
    mount();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    await userEvent.setup().click(sidebarTarget());
    expect(window.location.pathname).toBe('/mars/target');
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
  it('uses the approved copy and destination, with safe primary focus and destructive leave', async () => {
    await dirty();
    await userEvent.setup().click(sidebarTarget());
    expect(dialog()).toHaveAccessibleName('저장하지 않은 변경이 있습니다');
    expect(dialog()).toHaveAccessibleDescription('이동하면 변경이 사라집니다.');
    expect(within(dialog()).getByText('대상으로 이동')).toBeVisible();
    expect(stay()).toHaveFocus();
    expect(stay()).toHaveClass('bg-accent-primary');
    expect(leave()).toHaveClass('bg-accent-danger');
  });
  it.each(['편집한 행 3건', { ko: '편집한 행 3건', en: 'Three edited rows' }])('shows menu detail above the invariant consequence: %j', async message => {
    await dirty(message);
    await userEvent.setup().click(sidebarTarget());
    const detail = within(dialog()).getByText('편집한 행 3건');
    const consequence = within(dialog()).getByText('이동하면 변경이 사라집니다.');
    expect(detail.compareDocumentPosition(consequence) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(dialog()).toHaveAccessibleDescription('편집한 행 3건 이동하면 변경이 사라집니다.');
  });
  it.each(['stay', 'Escape', 'overlay'])('%s keeps draft and URL, runs no discard, and returns focus to sidebar', async action => {
    await dirty();
    const target = sidebarTarget();
    await userEvent.setup().click(target);
    expect(dialog()).toBeVisible();
    if (action === 'stay') await userEvent.setup().click(stay());
    if (action === 'Escape') await userEvent.setup().keyboard('{Escape}');
    if (action === 'overlay') {
      fireEvent.pointerDown(document.querySelector('.fixed.inset-0[data-state="open"]')!, { button: 0 });
    }
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(window.location.href).toContain('/mars/draft?v=1');
    expect(screen.getByRole('textbox', { name: 'draft' })).toHaveValue('keep me');
    expect(discard).not.toHaveBeenCalled();
    await waitFor(() => expect(target).toHaveFocus());
  });
  it('traps Tab and Shift+Tab within the two decisions', async () => {
    await dirty();
    const user = userEvent.setup();
    await user.click(sidebarTarget());
    await user.tab(); expect(leave()).toHaveFocus();
    await user.tab(); expect(stay()).toHaveFocus();
    await user.tab({ shift: true }); expect(leave()).toHaveFocus();
  });
  it('confirms once, runs onDiscard, navigates, and leaves focus on the arrival title', async () => {
    await dirty();
    const user = userEvent.setup();
    await user.click(sidebarTarget());
    await user.click(leave());
    expect(window.location.pathname).toBe('/mars/target');
    expect(discard).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: '대상' })).toHaveFocus());
  });
  it('omits a destination line when the target is unknown', async () => {
    await dirty();
    await userEvent.setup().click(screen.getByRole('button', { name: 'unknown destination' }));
    expect(dialog()).toHaveAccessibleName('저장하지 않은 변경이 있습니다');
    expect(within(dialog()).queryByText(/으로 이동$/)).toBeNull();
  });
  it('omits the destination line when the move stays in the current menu', async () => {
    editorLeaves = 'address';
    await dirty();
    await userEvent.setup().click(screen.getByRole('button', { name: 'same menu move' }));
    expect(dialog()).toHaveAccessibleName('저장하지 않은 변경이 있습니다');
    expect(within(dialog()).queryByText('초안으로 이동')).toBeNull();
    expect(leave()).toBeVisible();
  });
  it('uses the same confirmation for an in-page link and returns focus to it', async () => {
    await dirty();
    const user = userEvent.setup();
    const link = screen.getByRole('link', { name: 'in-page target' });
    await user.click(link);
    await user.click(stay());
    await waitFor(() => expect(link).toHaveFocus());
  });
  it('returns programmatic cancellation to main', async () => {
    await dirty();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'programmatic move' }));
    await user.click(stay());
    await waitFor(() => expect(screen.getByRole('main')).toHaveFocus());
  });
  it('localizes the title, detail, consequence, destination and buttons in English', async () => {
    localStorage.setItem('platform:lang', 'en');
    await dirty({ ko: '편집한 행', en: 'Edited rows' });
    await userEvent.setup().click(within(screen.getByRole('navigation', { name: 'Primary' })).getByRole('link', { name: 'Target' }));
    expect(dialog()).toHaveAccessibleName('You have unsaved changes');
    expect(dialog()).toHaveAccessibleDescription('Edited rows Leaving will discard them.');
    expect(within(dialog()).getByText('Go to Target')).toBeVisible();
    expect(within(dialog()).getByRole('button', { name: 'Stay' })).toHaveFocus();
    expect(within(dialog()).getByRole('button', { name: 'Discard changes and leave' })).toBeVisible();
  });
  it.each(['stay', 'Escape', 'overlay'])('preserves palette query, active result and combobox focus after %s, then confirms normally', async action => {
    await dirty();
    const user = userEvent.setup();
    await user.keyboard('{Control>}k{/Control}');
    const input = screen.getByRole('combobox');
    await user.type(input, '대상');
    await user.keyboard('{ArrowDown}');
    const active = input.getAttribute('aria-activedescendant');
    await user.keyboard('{Enter}');
    expect(stay()).toHaveFocus();
    await user.keyboard('{Control>}k{/Control}');
    expect(stay()).toHaveFocus();
    if (action === 'stay') await user.click(stay());
    if (action === 'Escape') await user.keyboard('{Escape}');
    if (action === 'overlay') fireEvent.pointerDown(document.querySelector('.bg-black\\/80[data-state="open"]')!, { button: 0 });
    await waitFor(() => expect(input).toHaveFocus());
    expect(input).toHaveValue('대상');
    expect(input).toHaveAttribute('aria-activedescendant', active);
    await user.keyboard('{Enter}');
    await user.click(leave());
    expect(window.location.pathname).toBe('/mars/third');
    await waitFor(() => expect(screen.getByRole('heading', { name: '다른 대상', level: 1 })).toHaveFocus());
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(discard).toHaveBeenCalledTimes(1);
  });
  it('compensates Back; stay preserves URL/draft and focuses main; confirm replays Back once', async () => {
    window.history.replaceState({ apIdx: 0 }, '', '/mars/target?v=1');
    window.history.pushState({ apIdx: 1 }, '', '/mars/draft?v=1');
    await dirty();
    act(() => window.history.back());
    await waitFor(() => expect(dialog()).toBeVisible());
    await waitFor(() => expect(window.location.pathname).toBe('/mars/draft'));
    expect(within(dialog()).getByText('대상으로 이동')).toBeVisible();
    await userEvent.setup().click(stay());
    expect(screen.getByRole('textbox', { name: 'draft' })).toHaveValue('keep me');
    await waitFor(() => expect(screen.getByRole('main')).toHaveFocus());
    expect(discard).not.toHaveBeenCalled();
    act(() => window.history.back());
    await waitFor(() => expect(dialog()).toBeVisible());
    await waitFor(() => expect(window.location.pathname).toBe('/mars/draft'));
    await userEvent.setup().click(leave());
    await waitFor(() => expect(window.location.pathname).toBe('/mars/target'));
    expect(discard).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByRole('heading', { name: '대상', level: 1 })).toHaveFocus());
  });
});
