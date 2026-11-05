import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { House } from 'lucide-react';
import { createRegistry, I18nProvider, PlatformProvider } from '@ap/kernel';
import { testAdapter, testSession } from '@ap/kernel/testing';
import { DetailPanelSlotProvider, useDetailPanelSlotHost } from '@ap/ui';
import { groupId, spaceId, type ApiResponse, type UsageNextQuery, type UsageNextScreens, type UsageSummary } from '@ap/contracts';
import { manifests } from '../index';
import UsageOverview from './UsageOverview';

// Like the existing admin table tests, supply jsdom's missing virtualizer geometry.
Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => 800 });
Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => 1280 });
window.ResizeObserver = class {
  constructor(private callback: ResizeObserverCallback) {}
  observe(target: Element) { this.callback([{ target, contentRect: { width: 1280, height: 800 } } as ResizeObserverEntry], this as unknown as ResizeObserver); }
  unobserve() {} disconnect() {}
} as unknown as typeof ResizeObserver;
const registry = createRegistry({
  spaces: [{ id: spaceId('operations'), label: { ko: '운영 콘솔', en: 'Operations console' }, description: { ko: '목적', en: 'Purpose' }, permission: 'console:access', homeMenuId: 'admin-roles' }],
  groups: [{ id: groupId('admin'), label: { ko: '관리', en: 'Admin' }, icon: House, space: spaceId('operations') }],
  menus: manifests,
});
const ok = <T,>(data: T): ApiResponse<T> => ({ outcome: 'ok', data, assessments: [], trust: null, correlationId: 'usage-test' });
const nextData = (over: Partial<UsageNextScreens> = {}): UsageNextScreens => ({
  menuId: 'admin-audit', entries: 100, masked: false,
  summary: { moved: 50, sameMenu: 10, backOrReturn: 20, noMove: 20 },
  next: [{ menuId: 'admin-roles', count: 30, distinctUsers: 4, vias: { sidebar: 12, switcher: 3, palette: 5, crossLink: 4, drill: 2, link: 1, board: 2, direct: 1 } },
    { menuId: 'admin-registry', count: 20, distinctUsers: 3, vias: { link: 20 } }],
  hiddenDestinations: 2, ...over,
});
const summary: UsageSummary = { menus: [
  { menuId: 'admin-roles', visits: 3, distinctUsers: 2, lastUsedAt: 1, backRate: null, searchEntryRate: null },
  { menuId: 'admin-audit', visits: 100, distinctUsers: 6, lastUsedAt: 1, backRate: 0.2, searchEntryRate: 0.1 },
  { menuId: 'admin-usage', visits: 50, distinctUsers: 4, lastUsedAt: 1, backRate: 0.6, searchEntryRate: 0.4 },
], preset: 'all' };
function Host() { const host = useDetailPanelSlotHost(); return <aside ref={host.ref} />; }
function setup(path = '/admin/usage', response: (query: UsageNextQuery) => Promise<ApiResponse<UsageNextScreens>> = async () => ok(nextData())) {
  window.history.replaceState(null, '', path);
  const usageNextScreens = vi.fn(response);
  const session = testSession(['console:access', 'platform:view']);
  const adapter = testAdapter({ session: () => session, usageSummary: async () => ok(summary), usageNextScreens });
  render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry} equipmentAxes={[]}><DetailPanelSlotProvider><UsageOverview /><Host /></DetailPanelSlotProvider></PlatformProvider></I18nProvider>);
  return usageNextScreens;
}
const rows = () => [...document.querySelectorAll('[data-row-id]')].map(row => row.getAttribute('data-row-id'));
beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 1280, height: 800, x: 0, y: 0, top: 0, left: 0, right: 1280, bottom: 800, toJSON() {} });
  HTMLElement.prototype.scrollIntoView = vi.fn();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); window.history.replaceState(null, '', '/'); });

describe('UsageOverview next screens (#605)', () => {
  it('shows both rate columns, percentages and masked/missing rates as a dash', async () => {
    setup();
    await screen.findByRole('button', { name: 'admin-audit 보기' });
    expect(screen.getByRole('columnheader', { name: /뒤로 나감/ })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: /검색 진입/ })).toBeTruthy();
    const row = document.querySelector('[data-row-id="admin-audit"]') as HTMLElement;
    expect(within(row).getByText('20.0%')).toBeTruthy();
    expect(within(row).getByText('10.0%')).toBeTruthy();
    expect(within(document.querySelector('[data-row-id="admin-roles"]') as HTMLElement).getAllByText('—').length).toBeGreaterThanOrEqual(2);
  });
  it.each(['backRate', 'searchEntryRate'])('sorts %s with nulls last in both directions through URL sort', async field => {
    setup(`/admin/usage?sort=${field}:desc`);
    await waitFor(() => expect(rows().slice(0, 2)).toEqual(['admin-usage', 'admin-audit']));
    fireEvent.click(screen.getByRole('button', { name: field === 'backRate' ? '뒤로 나감' : '검색 진입' }));
    await waitFor(() => expect(rows().slice(0, 2)).toEqual(['admin-audit', 'admin-usage']));
    expect(rows().slice(2)).toEqual(['admin-roles', 'admin-registry']);
  });
  it('opens the drawer directly from focus, with four summary segments and the entry base', async () => {
    const calls = setup('/admin/usage?focus=admin-audit');
    const drawer = await screen.findByRole('dialog', { name: '변경 감사' });
    await within(drawer).findByText('본 화면 진입 100건');
    expect(calls.mock.calls[0]?.[0]).toEqual({ menuId: 'admin-audit', includeBack: false });
    for (const label of ['다른 메뉴로 이동', '같은 메뉴 안', '뒤로·복귀', '이후 메뉴 이동 없음']) expect(within(drawer).getByText(label)).toBeTruthy();
    expect(within(drawer).getByRole('list', { name: '다음으로 간 화면 순위' })).toBeTruthy();
    expect(within(drawer).getByText('3명 미만 목적지 2개')).toBeTruthy();
  });
  it('normalizes summary percentages and bar segments to their sum when moves exceed entries', async () => {
    setup('/admin/usage?focus=admin-audit', async () => ok(nextData({ entries: 3, summary: { moved: 6, sameMenu: 3, backOrReturn: 3, noMove: 0 }, next: [{ menuId: 'admin-roles', count: 6, distinctUsers: 3, vias: { link: 6 } }], hiddenDestinations: 0 })));
    const section = await screen.findByRole('region', { name: '진입 후 이동 요약' });
    expect(within(section).getByText('본 화면 진입 3건')).toBeTruthy();
    expect(within(section).getAllByRole('listitem').map(row => row.textContent)).toEqual([
      '다른 메뉴로 이동6건 · 50.0%', '같은 메뉴 안3건 · 25.0%', '뒤로·복귀3건 · 25.0%', '이후 메뉴 이동 없음0건 · 0.0%',
    ]);
    const segments = section.querySelectorAll('svg > svg > rect');
    expect([...segments].map(rect => rect.getAttribute('width'))).toEqual(['50%', '25%', '25%', '0%']);
    expect([...segments].reduce((sum, rect) => sum + Number.parseFloat(rect.getAttribute('width')!), 0)).toBe(100);
  });
  it('omits hidden via bars, retains destination counts/users and explains suppression once', async () => {
    setup('/admin/usage?focus=admin-audit', async () => ok(nextData({ next: [
      { menuId: 'admin-roles', count: 30, distinctUsers: 4, vias: {} },
      { menuId: 'admin-registry', count: 20, distinctUsers: 3, vias: {} },
    ] })));
    const list = await screen.findByRole('list', { name: '다음으로 간 화면 순위' });
    const destinations = within(list).getAllByRole('listitem');
    expect(destinations.map(row => within(row).getByText(/건$/).textContent)).toEqual(['30건', '20건']);
    expect(destinations.map(row => within(row).getByText(/방문 사용자/).textContent)).toEqual(['방문 사용자 4명', '방문 사용자 3명']);
    expect(list.querySelectorAll('svg')).toHaveLength(0);
    expect(screen.getAllByText('방식별 분포는 3명 미만 구간이 있어 숨겼습니다')).toHaveLength(1);
    expect(screen.queryByRole('list', { name: '이동 방식 범례' })).toBeNull();
    expect(screen.queryByRole('list', { name: '전체 이동 방식' })).toBeNull();
  });
  it('keeps public via bars alongside a hidden breakdown without inventing zero totals', async () => {
    setup('/admin/usage?focus=admin-audit', async () => ok(nextData({ next: [
      { menuId: 'admin-roles', count: 30, distinctUsers: 4, vias: {} },
      { menuId: 'admin-registry', count: 20, distinctUsers: 3, vias: { link: 20 } },
    ] })));
    const list = await screen.findByRole('list', { name: '다음으로 간 화면 순위' });
    const destinations = within(list).getAllByRole('listitem');
    expect(destinations[0]!.querySelector('svg')).toBeNull();
    expect(destinations[1]!.querySelector('[data-destination-bar]')?.getAttribute('width')).toBe('66.66666666666666%');
    expect(within(screen.getByRole('list', { name: '전체 이동 방식' })).getAllByRole('listitem').map(row => row.textContent)).toEqual(['링크20건']);
    expect(screen.getAllByText('방식별 분포는 3명 미만 구간이 있어 숨겼습니다')).toHaveLength(1);
  });
  it('explains that the no-move summary also includes suppressed small movements', async () => {
    setup('/admin/usage?focus=admin-audit');
    const trigger = await screen.findByRole('button', { name: '이후 메뉴 이동 없음' });
    trigger.focus();
    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip.textContent).toContain('새로고침, 새 탭, 분석 보드 진입 때도 이동 기록이 끊깁니다.');
    expect(tooltip.textContent).toContain('3명 미만의 이동도 여기에 포함됩니다');
  });
  it('opens by RowAction and closes with Escape, restores row action focus and clears URL focus', async () => {
    setup();
    const opener = await screen.findByRole('button', { name: 'admin-audit 보기' });
    opener.focus(); fireEvent.click(opener);
    const drawer = await screen.findByRole('dialog', { name: '변경 감사' });
    expect(new URLSearchParams(window.location.search).get('focus')).toBe('admin-audit');
    expect(drawer.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(drawer, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(new URLSearchParams(window.location.search).get('focus')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });
  it('keeps the Button switch accessible and controlled in both states', async () => {
    setup('/admin/usage?focus=admin-audit');
    const toggle = await screen.findByRole('switch', { name: '뒤로 가기·복귀 포함' });
    expect(toggle.tagName).toBe('BUTTON');
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    expect(toggle.textContent).toBe('켜짐');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    expect(toggle.textContent).toBe('꺼짐');
  });
  it('refetches on includeBack and hides old counts/bars while awaiting the new matching set', async () => {
    let resolve!: (value: ApiResponse<UsageNextScreens>) => void;
    const calls = setup('/admin/usage?focus=admin-audit', async query => query.includeBack ? new Promise(r => { resolve = r; }) : ok(nextData()));
    const drawer = await screen.findByRole('dialog');
    await within(drawer).findByText('본 화면 진입 100건');
    fireEvent.click(within(drawer).getByRole('switch', { name: '뒤로 가기·복귀 포함' }));
    await waitFor(() => expect(calls).toHaveBeenCalledTimes(2));
    expect(calls.mock.calls[1]?.[0]).toEqual({ menuId: 'admin-audit', includeBack: true });
    expect(within(drawer).queryByText('30건 · 30.0%')).toBeNull();
    resolve(ok(nextData({ next: [{ menuId: 'admin-roles', count: 50, distinctUsers: 8, vias: { history: 40, sidebar: 10 } }] })));
    await waitFor(() => expect(within(drawer).getByRole('list', { name: '다음으로 간 화면 순위' }).textContent).toContain('50건 · 50.0%'));
    expect(within(drawer).getByText(/8명/)).toBeTruthy();
  });
  it.each([
    ['masked', nextData({ masked: true, next: [], entries: 0, hiddenDestinations: 0, summary: { moved: 0, sameMenu: 0, backOrReturn: 0, noMove: 0 } }), '3명 미만이 쓴 메뉴라 이동 경로를 공개하지 않습니다'],
    ['empty', nextData({ entries: 0, next: [], hiddenDestinations: 0, summary: { moved: 0, sameMenu: 0, backOrReturn: 0, noMove: 0 } }), '기록된 진입이 없습니다'],
    ['no moves', nextData({ next: [], hiddenDestinations: 0 }), '다음 화면 이동이 없습니다'],
  ])('handles %s without a named ranking', async (_name, data, title) => {
    setup('/admin/usage?focus=admin-audit', async () => ok(data));
    await screen.findByText(title);
    expect(screen.queryByRole('list', { name: '다음으로 간 화면 순위' })).toBeNull();
    if (data.masked) {
      expect(screen.queryByText(/본 화면 진입/)).toBeNull();
      expect(screen.queryByText('기록된 진입이 없습니다')).toBeNull();
      expect(screen.queryByText(/0건/)).toBeNull();
    }
  });
  it('keeps masked destination counts visible with no eligible rows and hides a zero hidden-count line', async () => {
    setup('/admin/usage?focus=admin-audit', async () => ok(nextData({ next: [] })));
    await screen.findByText('3명 미만 목적지 2개');
    expect(screen.queryByText('다음 화면 이동이 없습니다')).toBeNull();
  });
  it('uses fixed group order for bars/legend, sorts the overall vias by count and omits direct and zeros', async () => {
    setup('/admin/usage?focus=admin-audit');
    const overall = await screen.findByRole('list', { name: '전체 이동 방식' });
    expect(within(overall).getAllByRole('listitem').map(row => row.textContent)).toEqual(['링크21건', '사이드바12건', '메뉴 검색5건', '메뉴 간 연결4건', '전환기3건', '드릴2건', '분석 보드2건']);
    expect(screen.queryByText('직접 진입')).toBeNull();
    const legend = screen.getByRole('list', { name: '이동 방식 범례' });
    expect(within(legend).getAllByRole('listitem').map(row => row.textContent)).toEqual(['메뉴 탐색15건', '메뉴 검색5건', '화면 안 연결27건', '분석 보드2건', '기타0건']);
    const ranking = screen.getByRole('list', { name: '다음으로 간 화면 순위' });
    const bars = ranking.querySelectorAll('[data-destination-bar]');
    expect(bars[0]?.getAttribute('width')).toBe('100%');
    expect(bars[1]?.getAttribute('width')).toBe('66.66666666666666%');
  });
  it('discloses only the returned destinations, first five then the rest', async () => {
    setup('/admin/usage?focus=admin-audit', async () => ok(nextData({ hiddenDestinations: 0, next: Array.from({ length: 7 }, (_, i) => ({ menuId: `destination-${i}`, count: 10 - i, distinctUsers: 3, vias: { sidebar: 10 - i } })) })));
    const list = await screen.findByRole('list', { name: '다음으로 간 화면 순위' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(5);
    fireEvent.click(screen.getByRole('button', { name: '더 보기' }));
    expect(within(list).getAllByRole('listitem')).toHaveLength(7);
    expect(screen.queryByText('3명 미만 목적지 0개')).toBeNull();
    expect(screen.queryByRole('button', { name: '더 보기' })).toBeNull();
  });
  it('shows adapter failures through QueryView and retries', async () => {
    const calls = setup('/admin/usage?focus=admin-audit', async () => ({ ...ok(nextData()), outcome: 'error', data: null, message: 'usage failed' }));
    const retry = await screen.findByRole('button', { name: /다시/ });
    fireEvent.click(retry);
    await waitFor(() => expect(calls.mock.calls.length).toBeGreaterThan(1));
  });
});
