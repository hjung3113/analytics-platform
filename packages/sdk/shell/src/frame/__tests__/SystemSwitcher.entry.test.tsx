import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@ap/ui';
import { I18nProvider, PlatformProvider, createRegistry, usePlatform } from '@ap/kernel';
import { noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { SystemSwitcher } from '../SystemSwitcher';
import { groupId, spaceId, type GroupId, type SpaceId } from '@ap/contracts';

// The Kernel only returns a null or non-home entry in states a real registry cannot reach with permissions alone
// (a space's permission equals its home menu's). The switcher must still read `entry.menuId` and survive `null`,
// so these tests wrap `spaceEntry` and keep everything else real.
type Entry = { menuId: string; href: string; resumed: boolean } | null;
let override: ((spaceId: SpaceId, real: Entry) => Entry) | null = null;
vi.mock('@ap/kernel/host', async importOriginal => {
  const actual = await importOriginal<typeof import('@ap/kernel/host')>();
  return { ...actual, useHostPlatform: () => {
    const platform = actual.useHostPlatform();
    return { ...platform, spaceEntry: (spaceId: SpaceId) => { const real = platform.spaceEntry(spaceId); return override ? override(spaceId, real) : real; } };
  } };
});

function menu(id: string, group: GroupId, path: string, label: string) {
  return { id, group, path, permission: 'platform:view' as const, primary: id.endsWith('-home'), label: { ko: label, en: label }, description: { ko: '', en: '' }, icon: House, requiresScope: false, context: noContext, pageType: 'overview' as const, features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: [] };
}
const registry = createRegistry({
  spaces: [testSpace({ id: spaceId('mars'), label: { ko: '분석', en: 'A' }, homeMenuId: 'a-home' }), testSpace({ id: spaceId('bravo'), label: { ko: '지표', en: 'M' }, homeMenuId: 'm-home' }), testSpace({ id: spaceId('operations'), label: { ko: '운영', en: 'O' }, homeMenuId: 'o-home' })],
  groups: [{ id: groupId('analytics'), label: { ko: 'ga', en: 'ga' }, icon: House, space: spaceId('mars') }, { id: groupId('metrics'), label: { ko: 'gm', en: 'gm' }, icon: House, space: spaceId('bravo') }, { id: groupId('admin'), label: { ko: 'go', en: 'go' }, icon: House, space: spaceId('operations') }],
  menus: [menu('a-home', groupId('analytics'), '/a', '분석 홈'), menu('m-home', groupId('metrics'), '/m', '지표 홈'), menu('m-second', groupId('metrics'), '/m/second', '지표 둘째'), menu('o-home', groupId('admin'), '/o', '운영 홈')],
});

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  window.history.replaceState(null, '', '/a?v=1');
});
afterEach(() => { cleanup(); override = null; vi.unstubAllGlobals(); });

function open() {
  const session = testSession(['platform:view']);
  render(<I18nProvider><PlatformProvider adapter={testAdapter({ session: () => session })} registry={registry}><TooltipProvider><SystemSwitcher /></TooltipProvider></PlatformProvider></I18nProvider>);
  fireEvent.click(screen.getByRole('button', { name: /^시스템 및 플랫폼 메뉴/ }));
  return screen.getByRole('dialog', { name: '시스템 및 플랫폼 메뉴' });
}

describe('SystemSwitcher space entry (B6)', () => {
  it('names the start menu from entry.menuId, not the home menu, and picks 이어서/시작 from resumed', () => {
    override = (spaceId, real) => spaceId === 'bravo' && real ? { menuId: 'm-second', href: '/m/second?v=1', resumed: true } : real;
    const dialog = open();
    expect(within(dialog).getByText('이어서: 지표 둘째')).toBeTruthy();
    // The current screen is admitted and remembered, so its own system reads as resumed.
    expect(within(dialog).getByText('이어서: 분석 홈')).toBeTruthy();
    expect(within(dialog).getByText('시작: 운영 홈')).toBeTruthy();
  });

  it('shows a first-menu fallback entry as 시작 with that menu', () => {
    override = (spaceId, real) => spaceId === 'bravo' && real ? { menuId: 'm-second', href: '/m/second?v=1', resumed: false } : real;
    expect(within(open()).getByText('시작: 지표 둘째')).toBeTruthy();
  });

  it('omits a card whose entry is null, keeps the others in order, and focuses the first remaining card', () => {
    override = (spaceId, real) => spaceId === 'mars' ? null : real;
    const dialog = open();
    expect(within(dialog).queryByRole('button', { name: /^분석/ })).toBeNull();
    const cards = within(dialog).getAllByRole('button').filter(button => button.hasAttribute('data-switcher-card'));
    expect(cards.map(card => card.textContent)).toEqual(['지표시작: 지표 홈', '운영시작: 운영 홈']);
    expect(cards[0]).toHaveFocus();
  });

  it('states the empty case when every entry is null', () => {
    override = () => null;
    const dialog = open();
    expect(within(dialog).getByText('접근 가능한 업무 시스템이 없습니다')).toHaveFocus();
    expect(within(dialog).queryAllByRole('button').filter(button => button.hasAttribute('data-switcher-card'))).toHaveLength(0);
  });
});
