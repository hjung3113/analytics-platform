import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformProvider, createRegistry, usePlatform, type AnalysisActionsProps } from '@ap/kernel';
import { PaneScreenProvider } from '@ap/kernel/host';
import { memoryStorage, noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { HeaderOverflowItem, PlatformPage } from '../PlatformPage';
import { groupId, spaceId } from '@ap/contracts';

const features = { export: false, savedView: false, annotate: false, compare: false };
const menu = (id: string, path: string, over: Record<string, unknown> = {}) => ({
  id, group: groupId('overview'), label: { ko: id, en: id }, description: { ko: '', en: '' }, path, icon: House, permission: 'platform:view' as const,
  requiresScope: false, context: noContext, pageType: 'overview' as const, features, pageKeys: [], ...over,
});
const registry = createRegistry({
  spaces: [testSpace({ homeMenuId: 'home' })],
  groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('mars') }],
  menus: [
    { ...menu('home', '/'), primary: true },
    menu('trend', '/trend', { pageType: 'analysis', pageKeys: ['sort', 'tag', 'pick'], repeatedPageKeys: ['tag'], hiddenPageKeys: ['pick'] }),
    menu('locked', '/locked', { pageType: 'analysis', permission: 'console:access' }),
  ],
});

beforeEach(() => { for (const name of ['localStorage', 'sessionStorage'] as const) vi.stubGlobal(name, memoryStorage()); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });

const seen: AnalysisActionsProps[] = [];
const onPick = vi.fn();
function Actions(props: AnalysisActionsProps) {
  seen.push(props);
  return <>
    <HeaderOverflowItem label="개선 아이템 남기기" onSelect={onPick} />
    <HeaderOverflowItem label="막힌 동작" allowed={false} reason="권한이 없습니다" onSelect={onPick} />
  </>;
}
const slots = { analysisActions: { Actions } };

function mount(url: string, s: Parameters<typeof PlatformProvider>[0]['slots'] = slots) {
  window.history.replaceState(null, '', url);
  const session = testSession(['platform:view'] as never);
  return render(<I18nProvider><PlatformProvider adapter={testAdapter({ session: () => session })} registry={registry} slots={s}><PlatformPage><p>body</p></PlatformPage></PlatformProvider></I18nProvider>);
}
const settle = () => act(() => new Promise(resolve => setTimeout(resolve, 30)));

describe('PlatformPage ⋯ for the analysisActions slot (#1424)', () => {
  it('adds the slot items to an analysis menu and hands them the menu id, global Context and declared page keys', async () => {
    seen.length = 0;
    mount('/trend?sort=asc&tag=a&tag=b&other=x');
    await settle();
    fireEvent.click(screen.getByRole('button', { name: '더보기' }));
    const group = await screen.findByRole('group', { name: '기타 페이지 동작' });
    expect(within(group).getByRole('button', { name: '개선 아이템 남기기' })).toBeEnabled();
    const last = seen.at(-1)!;
    expect(last.menuId).toBe('trend');
    expect(last.page).toEqual({ sort: 'asc', tag: ['a', 'b'] });
    expect(last.global).toBeDefined();
    fireEvent.click(within(group).getByRole('button', { name: '개선 아이템 남기기' }));
    expect(onPick).toHaveBeenCalledTimes(1);
  });

  it('hands over a hidden page key that is not in the address', async () => {
    seen.length = 0;
    function Setter() { const { setPage } = usePlatform(); return <button type="button" onClick={() => setPage({ pick: 'row-7' })}>숨김 키 쓰기</button>; }
    window.history.replaceState(null, '', '/trend?sort=asc');
    const session = testSession(['platform:view'] as never);
    render(<I18nProvider><PlatformProvider adapter={testAdapter({ session: () => session })} registry={registry} slots={slots}><PlatformPage><Setter /></PlatformPage></PlatformProvider></I18nProvider>);
    await settle();
    fireEvent.click(screen.getByRole('button', { name: '숨김 키 쓰기' }));
    await settle();
    expect(window.location.search).not.toContain('pick');
    fireEvent.click(screen.getByRole('button', { name: '더보기' }));
    await screen.findByRole('group', { name: '기타 페이지 동작' });
    expect(seen.at(-1)!.page).toEqual({ sort: 'asc', pick: 'row-7' });
  });

  it('lets the app decline a menu with appliesTo, leaving no ⋯', async () => {
    mount('/trend', { analysisActions: { Actions, appliesTo: id => id !== 'trend' } });
    await settle();
    expect(screen.queryByRole('button', { name: '더보기' })).toBeNull();
  });

  it('keeps a not-allowed item as a disabled row with its reason, and a click does nothing', async () => {
    onPick.mockClear();
    mount('/trend');
    await settle();
    fireEvent.click(screen.getByRole('button', { name: '더보기' }));
    const blocked = await screen.findByRole('button', { name: '막힌 동작' });
    expect(blocked).toBeDisabled();
    expect(blocked).toHaveAccessibleDescription('권한이 없습니다');
    fireEvent.click(blocked);
    expect(onPick).not.toHaveBeenCalled();
  });

  it.each([
    ['a menu that is not an analysis page', '/', slots],
    ['an app that provides no slot', '/trend', {}],
  ])('shows no ⋯ for %s', async (_name, url, s) => {
    mount(url, s);
    await settle();
    expect(screen.queryByRole('button', { name: '더보기' })).toBeNull();
  });

  it('shows no ⋯ in a pane', async () => {
    window.history.replaceState(null, '', '/');
    const session = testSession(['platform:view'] as never);
    render(<I18nProvider><PlatformProvider adapter={testAdapter({ session: () => session })} registry={registry} slots={slots}>
      <PaneScreenProvider paneId="p1" screen={{ menuId: 'trend', params: {}, query: '' }} onChange={() => {}} onLeave={() => {}}><PlatformPage><p>pane</p></PlatformPage></PaneScreenProvider>
    </PlatformProvider></I18nProvider>);
    await settle();
    expect(screen.queryByRole('button', { name: '더보기' })).toBeNull();
  });
});
