import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { type ReactNode } from 'react';
import { House } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, PaneScreenProvider, PlatformProvider, createRegistry } from '@ap/kernel';
import { Button, Dialog, DialogContent, DialogDescription, DialogTitle } from '@ap/ui';
import { memoryStorage, noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { PlatformPage, useHeaderOverflowDialog } from './PlatformPage';

const features = { export: false, savedView: false, annotate: false, compare: false };
const menu = (id: string, path: string, over: Record<string, unknown> = {}) => ({
  id, group: 'overview' as const, label: { ko: id, en: id }, description: { ko: '', en: '' }, path, icon: House, permission: 'platform:view' as const,
  requiresScope: false, context: noContext, pageType: 'overview' as const, features, pageKeys: [], ...over,
});
const registry = createRegistry({
  spaces: [testSpace({ homeMenuId: 'home' })],
  groups: [{ id: 'overview', label: { ko: '개요', en: 'Overview' }, icon: House, space: 'analytics' }],
  menus: [
    { ...menu('home', '/', { features: { ...features, board: true } }), primary: true },
    menu('plain', '/plain'),
    menu('locked', '/locked', { permission: 'console:access', features: { ...features, board: true } }),
  ],
});

beforeEach(() => {
  for (const name of ['localStorage', 'sessionStorage'] as const) {
    vi.stubGlobal(name, memoryStorage());
  }
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });

/** Stands in for the shell's item: a button in the `⋯` menu that hands a dialog to the header. */
function Entry() {
  const show = useHeaderOverflowDialog();
  return <Button type="button" variant="ghost" size="sm" onClick={() => show?.(control => <Dialog open onOpenChange={open => { if (!open) control.close(); }}>
    <DialogContent closeLabel="닫기" onCloseAutoFocus={control.onCloseAutoFocus}><DialogTitle>보드에 열기</DialogTitle><DialogDescription>설명</DialogDescription></DialogContent>
  </Dialog>)}>분석 보드에 열기…</Button>;
}

function mount(url: string, ui: ReactNode, slots: { boardEntry?: ReactNode } = { boardEntry: <Entry /> }, permissions: string[] = ['platform:view']) {
  window.history.replaceState(null, '', url);
  const session = testSession(permissions as never);
  return render(<I18nProvider><PlatformProvider adapter={testAdapter({ session: () => session })} registry={registry} slots={slots}>{ui}</PlatformProvider></I18nProvider>);
}
const more = () => screen.getByRole('button', { name: '더보기' });
const openMore = () => { fireEvent.click(more()); };
const settle = () => act(() => new Promise(resolve => setTimeout(resolve, 30)));

describe('PlatformPage ⋯ for the board entry slot (docs/16 §6)', () => {
  it('shows ⋯ with the slot item on a board menu that has no secondary actions', async () => {
    mount('/', <PlatformPage><p>body</p></PlatformPage>);
    await settle();
    openMore();
    expect(await screen.findByRole('button', { name: '분석 보드에 열기…' })).toBeInTheDocument();
  });

  it('appends the slot item after the page\'s own secondary actions', async () => {
    mount('/', <PlatformPage secondaryActions={<button type="button">내려받기</button>}><p>body</p></PlatformPage>);
    await settle();
    openMore();
    const group = await screen.findByRole('group', { name: '기타 페이지 동작' });
    expect(within(group).getAllByRole('button').map(b => b.textContent)).toEqual(['내려받기', '분석 보드에 열기…']);
  });

  it.each([
    ['a menu without board support', '/plain', ['platform:view'], { boardEntry: <Entry /> }],
    ['a board menu the user cannot open', '/locked', ['platform:view'], { boardEntry: <Entry /> }],
    ['an app that provides no slot', '/', ['platform:view'], {}],
  ])('shows no ⋯ for %s', async (_name, url, permissions, slots) => {
    mount(url, <PlatformPage><p>body</p></PlatformPage>, slots, permissions);
    await settle();
    expect(screen.queryByRole('button', { name: '더보기' })).toBeNull();
  });

  it('shows no ⋯ in a pane', async () => {
    mount('/', <PaneScreenProvider paneId="p1" screen={{ menuId: 'home', params: {}, query: '' }} onChange={() => {}} onLeave={() => {}}><PlatformPage><p>pane body</p></PlatformPage></PaneScreenProvider>);
    await settle();
    expect(screen.queryByRole('button', { name: '더보기' })).toBeNull();
  });

  it('keeps the item\'s dialog open after the menu closes, does not pull focus to 더보기, and returns focus there when it closes', async () => {
    mount('/', <PlatformPage><p>body</p></PlatformPage>);
    await settle();
    openMore();
    fireEvent.click(await screen.findByRole('button', { name: '분석 보드에 열기…' }));
    await settle();
    const dialog = await screen.findByRole('dialog', { name: '보드에 열기' });
    expect(screen.queryByRole('group', { name: '기타 페이지 동작' })).toBeNull();
    expect(dialog.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(dialog, { key: 'Escape' });
    await settle();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(more()).toHaveFocus();
  });
});
