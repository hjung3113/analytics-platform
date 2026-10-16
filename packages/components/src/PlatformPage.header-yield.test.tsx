import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { House } from 'lucide-react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PlatformAdapter, Session, Trust } from '@ap/contracts';
import { I18nProvider, PlatformProvider, PlatformLink, createRegistry, usePlatform } from '@ap/kernel';
import { DataTrustIndicator } from './DataTrustIndicator';
import { PlatformPage } from './PlatformPage';
import { noContext, testAdapter, testSpace } from './test-support';

const registry = createRegistry({
  spaces: [testSpace()],
  groups: [{ id: 'overview', label: { ko: '개요', en: 'Overview' }, icon: House, space: 'analytics' }],
  menus: [{ id: 'home', group: 'overview', primary: true, label: { ko: '홈', en: 'Home' }, description: { ko: '', en: '' }, path: '/', icon: House, permission: 'platform:view', requiresScope: true, context: noContext, pageType: 'overview', features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: [] }],
});

function adapter(): PlatformAdapter {
  const session: Session = { user: { id: 'u1', name: 'u', title: { ko: 'u', en: 'u' }, permissions: ['platform:view'] }, scopes: [] };
  return testAdapter({ session: () => session, validateScope: async () => ({ status: 'valid', grantedRooms: [] }) });
}

const trust: Trust = {
  updatedAt: '2026-10-02T09:00:00+09:00', dataThrough: '2026-10-02T08:00:00+09:00', coverage: 0.987, provisional: true, source: 'mart',
};

/** jsdom has no layout width. Drive the header's own ResizeObserver with a width the test owns. */
function headerWidths() {
  let width = 1200;
  let notify: (() => void) | undefined;
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: () => void) { notify = callback; }
    observe() {}
    disconnect() {}
  });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({
    width, height: 50, x: 0, y: 0, top: 0, left: 0, right: width, bottom: 50, toJSON() { return {}; },
  }));
  return {
    set(next: number) {
      width = next;
      act(() => notify?.());
    },
  };
}

function page(onSecondary: () => void) {
  return <I18nProvider><PlatformProvider adapter={adapter()} registry={registry}>
    <PlatformPage
      title="아주 긴 생산성 개요 제목"
      description="폭을 먼저 양보하는 설명"
      dataTrustSummary={<DataTrustIndicator trust={trust} assessments={[]} />}
      secondaryActions={<button type="button" onClick={onSecondary}>보조 동작</button>}
      primaryAction={<button type="button">주 동작</button>}
    ><p>page body</p></PlatformPage>
  </PlatformProvider></I18nProvider>;
}

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('page header yield order (#303)', () => {
  it('drops description, then the trust summary, then the provisional badge, and brings them back with slack', async () => {
    window.history.replaceState(null, '', '/?v=1&scopeId=ICH');
    const widths = headerWidths();
    const onSecondary = vi.fn();
    const view = render(page(onSecondary));
    await screen.findByText('page body');
    const header = view.container.querySelector('header')!;
    const trustButton = () => screen.getByRole('button', { name: '데이터 신뢰' });
    const details = () => trustButton().querySelector('[data-trust-summary-details]')!;
    const title = screen.getByRole('heading', { name: '아주 긴 생산성 개요 제목' });

    expect(header.className).toContain('h-[50px]');
    expect(header.className).toContain('overflow-x-auto');
    expect(header.className).not.toContain('overflow-x-hidden');
    expect(header.className).not.toContain('flex-wrap');
    expect(title).toHaveClass('min-w-28', 'truncate');
    expect(title).toHaveAttribute('title', '아주 긴 생산성 개요 제목');
    expect(screen.getByText('폭을 먼저 양보하는 설명')).toBeTruthy();
    expect(details().className).not.toContain('sr-only');
    expect(within(trustButton()).getByText('잠정')).toBeTruthy();
    expect(trustButton()).toHaveAttribute('aria-label', '데이터 신뢰');
    expect(trustButton().getAttribute('title')).toContain('확인된 이슈 없음');
    expect(header.contains(screen.getByRole('button', { name: '주 동작' }))).toBe(true);
    expect(screen.queryByRole('button', { name: '보조 동작' })).toBeNull();

    widths.set(960);
    expect(screen.queryByText('폭을 먼저 양보하는 설명')).toBeNull();
    expect(screen.getByRole('button', { name: '폭을 먼저 양보하는 설명' })).toBeTruthy();
    expect(details().className).not.toContain('sr-only');
    expect(within(trustButton()).getByText('잠정')).toBeTruthy();
    expect(header.contains(title)).toBe(true);
    expect(header.contains(screen.getByRole('button', { name: '주 동작' }))).toBe(true);

    widths.set(800);
    expect(details()).toHaveClass('sr-only');
    expect(within(trustButton()).getByText('잠정')).toBeTruthy();
    expect(trustButton()).toHaveAttribute('aria-label', '데이터 신뢰');
    expect(trustButton().getAttribute('title')).toContain('98.7%');

    widths.set(700);
    expect(within(trustButton()).queryByText('잠정')).toBeNull();
    expect(details()).toHaveClass('sr-only');
    expect(screen.queryByText('폭을 먼저 양보하는 설명')).toBeNull();
    expect(header.contains(title)).toBe(true);
    expect(header.contains(screen.getByRole('button', { name: '주 동작' }))).toBe(true);

    // Still inside the restore slack: the badge stays hidden.
    widths.set(780);
    expect(within(trustButton()).queryByText('잠정')).toBeNull();
    widths.set(800);
    expect(within(trustButton()).getByText('잠정')).toBeTruthy();
    expect(details()).toHaveClass('sr-only');
    widths.set(860);
    expect(details()).toHaveClass('sr-only');
    widths.set(880);
    expect(details().className).not.toContain('sr-only');
    expect(screen.queryByText('폭을 먼저 양보하는 설명')).toBeNull();
    widths.set(1020);
    expect(screen.queryByText('폭을 먼저 양보하는 설명')).toBeNull();
    widths.set(1040);
    expect(screen.getByText('폭을 먼저 양보하는 설명')).toBeTruthy();
    expect(within(trustButton()).getByText('잠정')).toBeTruthy();

    const more = screen.getByRole('button', { name: '더보기' });
    expect(header.contains(more)).toBe(true);
  });

  it.each(['{Enter}', ' '])('selects a secondary action with %s and returns focus; Escape also returns focus', async key => {
    const user = userEvent.setup();
    headerWidths();
    window.history.replaceState(null, '', '/?v=1&scopeId=ICH');
    const onSecondary = vi.fn();
    render(page(onSecondary));
    await screen.findByText('page body');
    const more = screen.getByRole('button', { name: '더보기' });
    for (let i = 0; i < 10 && document.activeElement !== more; i++) await user.tab();
    expect(more).toHaveFocus();
    await user.keyboard('{Enter}');
    const action = await screen.findByRole('button', { name: '보조 동작' });
    expect(action).toHaveFocus();
    expect(screen.getByRole('group', { name: '기타 페이지 동작' })).toContainElement(action);
    await user.keyboard(key);
    expect(onSecondary).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.queryByRole('group', { name: '기타 페이지 동작' })).toBeNull());
    await waitFor(() => expect(more).toHaveFocus());
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('button', { name: '보조 동작' })).toHaveFocus();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('group', { name: '기타 페이지 동작' })).toBeNull());
    await waitFor(() => expect(more).toHaveFocus());
    expect(onSecondary).toHaveBeenCalledOnce();
  });

  it('tabs between ordinary controls and closes after a pointer selection', async () => {
    const user = userEvent.setup();
    headerWidths();
    window.history.replaceState(null, '', '/?v=1&scopeId=ICH');
    const onAction = vi.fn();
    render(<I18nProvider><PlatformProvider adapter={adapter()} registry={registry}>
      <PlatformPage secondaryActions={<><button onClick={onAction}>첫 동작</button><a href="#same-page" onClick={e => { e.preventDefault(); onAction(); }}>다음 동작</a></>}><p>page body</p></PlatformPage>
    </PlatformProvider></I18nProvider>);
    await screen.findByText('page body');
    const more = screen.getByRole('button', { name: '더보기' });
    await user.click(more);
    const first = screen.getByRole('button', { name: '첫 동작' });
    const next = screen.getByRole('link', { name: '다음 동작' });
    expect(first).toHaveFocus();
    await user.tab();
    expect(next).toHaveFocus();
    await user.tab({ shift: true });
    expect(first).toHaveFocus();
    await user.click(next);
    expect(onAction).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.queryByRole('group', { name: '기타 페이지 동작' })).toBeNull());
    await waitFor(() => expect(more).toHaveFocus());
  });

  it('leaves focus on the destination heading after a secondary link navigates', async () => {
    const user = userEvent.setup();
    headerWidths();
    window.history.replaceState(null, '', '/?v=1&scopeId=ICH');
    const navigationRegistry = createRegistry({ spaces: registry.spaces, groups: registry.groups, menus: [
      ...registry.menus, { ...registry.menus[0], id: 'destination', path: '/destination', primary: false, navHidden: true },
    ] });
    function Pages() {
      const { pathname } = usePlatform();
      return <PlatformPage title={pathname === '/' ? '출발' : '도착'}
        secondaryActions={<PlatformLink href="/destination?v=1&scopeId=ICH">다른 페이지</PlatformLink>}><p>page body</p></PlatformPage>;
    }
    render(<I18nProvider><PlatformProvider adapter={adapter()} registry={navigationRegistry}><Pages /></PlatformProvider></I18nProvider>);
    await screen.findByText('page body');
    const more = screen.getByRole('button', { name: '더보기' });
    await user.click(more);
    expect(screen.getByRole('link', { name: '다른 페이지' })).toHaveFocus();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(screen.queryByRole('group', { name: '기타 페이지 동작' })).toBeNull());
    await waitFor(() => expect(screen.getByRole('heading', { name: '도착' })).toHaveFocus());
    expect(more).not.toHaveFocus();
  });

  it('has no more menu when there is no secondary action', async () => {
    headerWidths();
    window.history.replaceState(null, '', '/?v=1&scopeId=ICH');
    render(<I18nProvider><PlatformProvider adapter={adapter()} registry={registry}>
      <PlatformPage title="제목" primaryAction={<button type="button">주 동작</button>}><p>page body</p></PlatformPage>
    </PlatformProvider></I18nProvider>);
    await screen.findByText('page body');
    expect(screen.queryByRole('button', { name: '더보기' })).toBeNull();
    expect(screen.getByRole('button', { name: '주 동작' })).toBeTruthy();
  });
});
