import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { House } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { groupId, spaceId } from '@ap/contracts';
import { I18nProvider, PlatformProvider, createRegistry, type PlatformMenuEntry } from '@ap/kernel';
import { PaneScreenProvider } from '@ap/kernel/host';
import { memoryStorage, noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { ObjectLinks } from '../ObjectLinks';
import { HeaderOverflowItem, PlatformPage } from '../PlatformPage';

const menu = (id: string, path: string, extra: Partial<PlatformMenuEntry> = {}): PlatformMenuEntry => ({
  id, path, group: groupId('objects'), label: { ko: id, en: id }, description: { ko: '', en: '' }, icon: House,
  permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'analysis',
  features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: [], ...extra,
});
const registry = createRegistry({
  spaces: [testSpace({ homeMenuId: 'source', label: { ko: 'MARS', en: 'MARS' } }), testSpace({ id: spaceId('other'), label: { ko: 'OTHER', en: 'OTHER' }, homeMenuId: 'other' })],
  groups: [
    { id: groupId('objects'), label: { ko: '객체', en: 'Objects' }, icon: House, space: spaceId('mars') },
    { id: groupId('other'), label: { ko: 'OTHER', en: 'OTHER' }, icon: House, space: spaceId('other') },
  ],
  menus: [
    menu('source', '/source', { primary: true, pageKeys: ['eqp'], subjectPageKeys: { equipment: 'eqp' }, subjectLinks: { equipment: true } }),
    menu('route', '/route/:id', { subjectLinks: { equipment: { param: 'id' } } }),
    menu('plain', '/plain', { pageKeys: ['eqp'], subjectPageKeys: { equipment: 'eqp' } }),
    menu('path', '/objects/:id', { opensObject: { equipment: { param: 'id' }, metric: { param: 'id' } } }),
    menu('denied', '/denied/:id', { permission: 'console:access', opensObject: { equipment: { param: 'id' }, locked: { param: 'id' } } }),
    menu('other', '/other', { primary: true, group: groupId('other'), label: { ko: 'path', en: 'path' }, pageKeys: ['eqp'], opensObject: { equipment: { pageKey: 'eqp' } } }),
  ],
});
beforeEach(() => { for (const key of ['localStorage', 'sessionStorage'] as const) vi.stubGlobal(key, memoryStorage()); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });
function mount(children: React.ReactNode, url = '/source', pane = false) {
  window.history.replaceState(null, '', url);
  const session = testSession(['platform:view']);
  return render(<I18nProvider><PlatformProvider registry={registry} adapter={testAdapter({ session: () => session })}>
    {pane ? <PaneScreenProvider paneId="p1" screen={{ menuId: 'source', params: {}, query: 'eqp=E1' }} onChange={() => {}} onLeave={() => {}}>{children}</PaneScreenProvider> : children}
  </PlatformProvider></I18nProvider>);
}

describe('ObjectLinks body placements (#1930)', () => {
  it('draws nothing for no destinations', () => {
    const { container } = mount(<ObjectLinks kind="unknown" id="E1" />);
    expect(container.querySelector('button,a')).toBeNull();
  });
  it('keeps one destination a one-click RowAction with its manifest label', () => {
    mount(<ObjectLinks kind="metric" id="M1" />);
    expect(screen.getByRole('link', { name: 'path' })).toHaveAttribute('href', expect.stringContaining('/mars/path/M1'));
    expect(screen.queryByRole('button')).toBeNull();
  });
  it('keeps a single denied destination disabled with menuDenied reason', () => {
    mount(<ObjectLinks kind="locked" id="E1" />);
    expect(screen.getByRole('button', { name: 'denied' })).toBeDisabled();
    expect(screen.getByRole('button')).toHaveAccessibleDescription('이 메뉴에 대한 권한이 없습니다');
  });
  it('opens 2+ with Enter, returns focus with Escape, keeps denied and disambiguates duplicate labels', async () => {
    const user = userEvent.setup();
    mount(<ObjectLinks kind="equipment" id="E1" />);
    const trigger = screen.getByRole('button', { name: 'E1 다른 화면에서 열기' });
    expect(trigger).toHaveTextContent('다른 화면');
    expect(trigger).not.toHaveAttribute('title');
    trigger.focus();
    await user.keyboard('{Enter}');
    const group = await screen.findByRole('group', { name: 'E1 다른 화면에서 열기' });
    expect(within(group).getAllByRole('button').length).toBe(3);
    expect(within(group).getByRole('button', { name: 'denied' })).toBeDisabled();
    expect(within(group).getByRole('button', { name: 'denied' })).toHaveAccessibleDescription('이 메뉴에 대한 권한이 없습니다');
    expect(within(group).getByText('MARS')).toHaveClass('text-tiny', 'text-text-secondary');
    expect(within(group).getByText('OTHER')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(trigger).toHaveFocus());
  });
  it('uses a title only in compact form', async () => {
    const view = mount(<ObjectLinks kind="equipment" id="E1" compact />);
    const trigger = screen.getByRole('button', { name: 'E1 다른 화면에서 열기' });
    expect(trigger).toHaveAttribute('title', 'E1 다른 화면에서 열기');
    expect(view.container.querySelector('svg')).toBeInTheDocument();
  });
});

describe('PlatformPage inbound header groups (#1930)', () => {
  it.each(['/source', '/plain?eqp=E1'])('requires explicit opt-in and a value: %s', url => {
    mount(<PlatformPage>body</PlatformPage>, url);
    expect(screen.queryByRole('button', { name: '더보기' })).toBeNull();
  });
  it.each(['/source?eqp=E1', '/route/E1'])('draws the subject group after own actions, using page or route value: %s', async url => {
    mount(<PlatformPage secondaryActions={<HeaderOverflowItem label="Own action" onSelect={() => {}} />}>body</PlatformPage>, url);
    fireEvent.click(screen.getByRole('button', { name: '더보기' }));
    const group = await screen.findByRole('group', { name: 'E1 다른 화면에서 열기' });
    expect(within(group).getByText('E1')).toHaveClass('font-mono');
    expect(screen.getByRole('button', { name: 'Own action' }).compareDocumentPosition(group) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(group.previousElementSibling).toHaveAttribute('role', 'separator');
    expect(within(group).getByRole('button', { name: 'denied' })).toBeDisabled();
  });
  it('uses the existing main-screen analysisActions gate and draws no group in a pane', () => {
    mount(<PlatformPage>body</PlatformPage>, '/source', true);
    expect(screen.queryByRole('button', { name: '더보기' })).toBeNull();
  });
});
