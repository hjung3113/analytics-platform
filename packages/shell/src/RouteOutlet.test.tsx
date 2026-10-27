import { lazy } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformProvider, createRegistry, usePlatform, usePlatformQuery } from '@ap/kernel';
import { RouteOutlet } from './RouteOutlet';
import { reloadApp } from './reload';
import { noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { groupId, spaceId, type ClientErrorReport, type PlatformAdapter } from '@ap/contracts';

vi.mock('./reload', () => ({ reloadApp: vi.fn() }));

const noFeatures = { export: false, savedView: false, annotate: false, compare: false };
const deniedSpaceSubtitle = '권한 제한 안내용 시스템 부제';

/** Innermost element whose text contains `needle` (sibling text nodes, not one element). */
function hasTextWithoutChild(node: Element | null, needle: string) {
  if (!node?.textContent?.includes(needle)) return false;
  return Array.from(node.children).every(child => !child.textContent?.includes(needle));
}
const menu = (id: string, path: string, over: object = {}) => ({
  id, group: groupId('equipment'), label: { ko: id, en: id }, description: { ko: '', en: '' }, path, icon: House, permission: 'platform:view' as const,
  requiresScope: false, context: noContext, pageType: 'analysis' as const, features: noFeatures, pageKeys: [], ...over,
});

let broken = true;
function Crash(): never { throw new Error('boom: unexpected shape'); }
function Leaky(): never { throw new Error('lotIds=PRIVATE-LOT user@example.test'); }
function Odd(): never { throw Object.create(null); }
function Renamed(): never { const e = new Error('x'); e.name = 'PRIVATE LOT A1'; throw e; }
const lazyMissing = lazy(() => Promise.reject(new TypeError('Failed to fetch dynamically imported module: https://x/y.js')));
function Flaky() { if (broken) throw new TypeError('flaky'); return <p>flaky ok</p>; }

const registry = createRegistry({
  spaces: [testSpace({ id: spaceId('mars') })],
  groups: [{ id: groupId('equipment'), label: { ko: '설비관리', en: 'Equipment' }, icon: House, space: spaceId('mars') }],
  menus: [
    menu('home', '/home', { primary: true, component: () => <p>home page</p> }),
    menu('metricpage', '/metricpage', { component: () => <p>metric page</p>, initializesMetric: true, pageKeys: [], context: { ...noContext, metric: 'apply' as const } }),
    menu('crash', '/crash', { component: Crash }),
    menu('flaky', '/flaky', { component: Flaky }),
    menu('missing', '/missing', { component: lazyMissing }),
    menu('leaky', '/leaky', { component: Leaky }),
    menu('odd', '/odd', { component: Odd }),
    menu('renamed', '/renamed', { component: Renamed }),
  ],
});

function fixture(reportClientError: PlatformAdapter['reportClientError']) {
  const session = testSession(['platform:view']);
  const listeners = new Set<() => void>();
  const adapter = testAdapter({
    session: () => session,
    reportClientError,
    subscribe: l => { listeners.add(l); return () => { listeners.delete(l); }; },
  });
  return { adapter, announce: () => listeners.forEach(l => l()) };
}

function Nav() {
  const { navigate } = usePlatform();
  return <nav><button type="button" onClick={() => navigate('/home')}>go home</button><button type="button" onClick={() => navigate('/flaky')}>go flaky</button></nav>;
}

function mountAt(url: string, adapter: PlatformAdapter, inMain = false) {
  window.history.replaceState(null, '', url);
  const outlet = <><Nav /><RouteOutlet /></>;
  return render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}>{inMain ? <main tabIndex={-1}>{outlet}</main> : outlet}</PlatformProvider></I18nProvider>);
}

let errorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => { broken = true; errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => { cleanup(); errorSpy.mockRestore(); });

describe('RouteOutlet error boundary (06 §4)', () => {
  it('contains a menu render failure: error view with the reported correlation id, shell stays usable', async () => {
    const reports: ClientErrorReport[] = [];
    const { adapter } = fixture(async r => { reports.push(r); return { accepted: true }; });
    mountAt('/crash?v=1&scopeId=MEM&secret=abc', adapter);
    expect(await screen.findByText('이 화면에서 오류가 발생했습니다')).toBeTruthy();
    expect(reports).toHaveLength(1);
    expect(reports[0]).toEqual({
      correlationId: expect.stringMatching(/^client-/), menuId: 'crash', spaceId: 'mars', path: '/crash', name: 'Error',
    });
    expect(screen.getByText(new RegExp(reports[0].correlationId))).toBeTruthy();
    // The shell sibling still works and leaves the failed screen.
    fireEvent.click(screen.getByText('go home'));
    expect(await screen.findByText('home page')).toBeTruthy();
    expect(screen.queryByText('이 화면에서 오류가 발생했습니다')).toBeNull();
  });

  it('never sends the free-text message or a non-identifier name (values can ride in them)', async () => {
    const reports: ClientErrorReport[] = [];
    const { adapter } = fixture(async r => { reports.push(r); return { accepted: true }; });
    const view = mountAt('/leaky', adapter);
    await screen.findByText('이 화면에서 오류가 발생했습니다');
    view.unmount();
    mountAt('/renamed', adapter);
    await screen.findByText('이 화면에서 오류가 발생했습니다');
    expect(reports).toHaveLength(2);
    expect(JSON.stringify(reports)).not.toMatch(/PRIVATE|user@example/);
    expect(reports.map(r => r.name)).toEqual(['Error', 'Error']);
  });

  it('a thrown value that cannot be stringified still ends in the contained error view', async () => {
    const { adapter } = fixture(async () => ({ accepted: true }));
    mountAt('/odd', adapter);
    expect(await screen.findByText('이 화면에서 오류가 발생했습니다')).toBeTruthy();
    expect(screen.getByText(/Correlation ID: client-/)).toBeTruthy();
    fireEvent.click(screen.getByText('go home'));
    expect(await screen.findByText('home page')).toBeTruthy();
  });

  it('navigating from a healthy screen to one that fails reports once, not once per automatic retry', async () => {
    const reports: ClientErrorReport[] = [];
    const { adapter } = fixture(async r => { reports.push(r); return { accepted: true }; });
    mountAt('/home', adapter);
    await screen.findByText('home page');
    fireEvent.click(screen.getByText('go flaky'));
    await screen.findByText('이 화면에서 오류가 발생했습니다');
    expect(reports).toHaveLength(1);
  });

  it('retry after a failed lazy chunk reloads the page, since React caches the rejected import', async () => {
    const { adapter } = fixture(async () => ({ accepted: true }));
    mountAt('/missing', adapter);
    await screen.findByText('이 화면에서 오류가 발생했습니다');
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(reloadApp).toHaveBeenCalledTimes(1);
  });

  it('retry remounts the screen once the cause is gone', async () => {
    const { adapter } = fixture(async () => ({ accepted: true }));
    mountAt('/flaky', adapter);
    await screen.findByText('이 화면에서 오류가 발생했습니다');
    broken = false;
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(await screen.findByText('flaky ok')).toBeTruthy();
  });

  it('a server-side change (revision) clears a contained failure', async () => {
    const { adapter, announce } = fixture(async () => ({ accepted: true }));
    mountAt('/flaky', adapter);
    await screen.findByText('이 화면에서 오류가 발생했습니다');
    broken = false;
    await act(async () => { announce(); });
    expect(await screen.findByText('flaky ok')).toBeTruthy();
  });

  it('a rejecting or throwing report port never breaks the error screen', async () => {
    for (const port of [(async () => { throw new Error('down'); }), (() => { throw new Error('sync'); })] as PlatformAdapter['reportClientError'][]) {
      const { adapter } = fixture(port);
      const view = mountAt('/crash', adapter);
      expect(await screen.findByText('이 화면에서 오류가 발생했습니다')).toBeTruthy();
      view.unmount();
    }
  });
});

describe('global utility routes and the null-sidebar home link (06 §9.1)', () => {
  function NoticePage() { return <p>notice page</p>; }
  function SecretPage() { return <p>secret page</p>; }
  const globalMenu = (id: string, path: string, over: object = {}) => ({
    id, group: groupId('noticeVoc'), label: { ko: id, en: id }, description: { ko: '', en: '' }, path, icon: House,
    permission: 'notice:view' as const, requiresScope: false, context: noContext, pageType: 'catalog' as const, features: noFeatures, pageKeys: [], ...over,
  });
  function globalRegistry(withRoot: boolean) {
    return createRegistry({
      spaces: [testSpace({ id: spaceId('operations'), label: { ko: '운영 콘솔', en: 'Operations console' }, subtitle: { ko: deniedSpaceSubtitle, en: 'Denial-only space subtitle' }, permission: 'console:access', homeMenuId: 'roles' })],
      groups: [
        { id: groupId('admin'), label: { ko: '관리', en: 'Admin' }, icon: House, space: spaceId('operations') },
        { id: groupId('noticeVoc'), label: { ko: '공지·VOC', en: 'Notice' }, icon: House, space: null },
        ...(withRoot ? [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: null }] : []),
      ],
      menus: [
        globalMenu('roles', '/admin/roles', { group: 'admin', permission: 'console:access', primary: true }),
        globalMenu('notices', '/notices', { primary: true, component: NoticePage }),
        globalMenu('secret', '/secret', { permission: 'voc:view', component: SecretPage }),
        globalMenu('crash', '/crash', { component: Crash }),
        ...(withRoot ? [globalMenu('root', '/', { group: 'overview', permission: 'platform:view', primary: true })] : []),
      ],
    });
  }
  function mountGlobal(url: string, withRoot: boolean) {
    // platform:view opens the menu at `/`. HomeLink no longer points at a home the user cannot open.
    const session = testSession(['notice:view', 'platform:view']);
    const { adapter } = fixture(async () => ({ accepted: true }));
    adapter.session = () => session;
    window.history.replaceState(null, '', url);
    return render(<I18nProvider><PlatformProvider adapter={adapter} registry={globalRegistry(withRoot)}><RouteOutlet /></PlatformProvider></I18nProvider>);
  }

  it('renders a global menu without the space-denial screen', async () => {
    mountGlobal('/notices', true);
    expect(await screen.findByText('notice page')).toBeTruthy();
    expect(screen.queryByText('이 공간에 들어갈 수 없습니다')).toBeNull();
  });

  it('still denies a global menu the user has no permission for', async () => {
    mountGlobal('/secret', true);
    expect(await screen.findByText('이 메뉴에 대한 권한이 없습니다')).toBeTruthy();
    expect(screen.queryByText(/permission=/)).toBeNull();
    expect(screen.getByText(/secret/)).toBeTruthy();
    // Label and sentence are sibling text nodes inside one body, so no element’s text is the sentence alone.
    expect(screen.getByText((_, node) => hasTextWithoutChild(node, '권한 담당자에게 요청하세요.'))).toBeTruthy();
    expect(screen.getByRole('link', { name: '홈' })).toBeTruthy();
    expect(screen.queryByText('이 공간에 들어갈 수 없습니다')).toBeNull();
  });

  it('links home to the menu at / when the sidebar space is null', async () => {
    mountGlobal('/missing', true);
    const home = await screen.findByRole('link', { name: '홈' });
    expect(home).toHaveAttribute('href', '/?v=1');
  });

  it('omits the home link when no menu is registered at /', async () => {
    mountGlobal('/missing', false);
    expect(await screen.findByText(/\/missing/)).toBeTruthy();
    expect(screen.queryByRole('link', { name: '홈' })).toBeNull();
  });

  it('shows home next to retry when a global screen throws and a menu exists at /', async () => {
    mountGlobal('/crash', true);
    expect(await screen.findByText('이 화면에서 오류가 발생했습니다')).toBeTruthy();
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeTruthy();
    expect(screen.getByRole('link', { name: '홈' })).toHaveAttribute('href', '/?v=1');
  });

  it('omits the home link on the error screen when no menu is registered at /', async () => {
    mountGlobal('/crash', false);
    expect(await screen.findByText('이 화면에서 오류가 발생했습니다')).toBeTruthy();
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: '홈' })).toBeNull();
  });
});

describe('global query admission under RouteOutlet (06 §9.1)', () => {
  // usePlatformQuery, not useMenuQuery: this menu declares requiresScope false and the hook has no Scope or period gate.
  function querying(label: string) {
    return function QueryingPage() {
      const { adapter } = usePlatform();
      usePlatformQuery(signal => adapter.menuQuery({ endpoint: 'fixture.query', context: {}, params: {} }, signal));
      return <p>{label}</p>;
    };
  }
  function queryRegistry() {
    const item = (id: string, group: 'admin' | 'noticeVoc', path: string, over: object = {}) => ({
      id, group: groupId(group), path, label: { ko: id, en: id }, description: { ko: '', en: '' }, icon: House,
      permission: 'notice:view' as const, requiresScope: false, context: noContext, pageType: 'catalog' as const,
      features: noFeatures, pageKeys: [], ...over,
    });
    return createRegistry({
      spaces: [testSpace({ id: spaceId('operations'), label: { ko: '운영 콘솔', en: 'Operations console' }, permission: 'console:access', homeMenuId: 'roles' })],
      groups: [
        { id: groupId('admin'), label: { ko: '관리', en: 'Admin' }, icon: House, space: spaceId('operations') },
        { id: groupId('noticeVoc'), label: { ko: '공지·VOC', en: 'Notice' }, icon: House, space: null },
      ],
      menus: [
        item('roles', 'admin', '/admin/roles', { primary: true, permission: 'console:access', component: querying('roles page') }),
        item('child', 'admin', '/admin/child', { component: querying('space page') }),
        item('notices', 'noticeVoc', '/notices', { primary: true, component: querying('notice page') }),
        item('secret', 'noticeVoc', '/secret', { permission: 'voc:view', component: querying('secret page') }),
      ],
    });
  }
  function mountQuery(url: string) {
    const menuQuery = vi.fn(async () => ({ outcome: 'ok' as const, data: null, assessments: [], trust: null, correlationId: 'query' }));
    const session = testSession(['notice:view']);
    const { adapter } = fixture(async () => ({ accepted: true }));
    adapter.session = () => session;
    adapter.menuQuery = menuQuery;
    window.history.replaceState(null, '', url);
    render(<I18nProvider><PlatformProvider adapter={adapter} registry={queryRegistry()}><RouteOutlet /></PlatformProvider></I18nProvider>);
    return menuQuery;
  }
  const settled = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });

  it('queries a global menu the user may open even without space entry', async () => {
    const menuQuery = mountQuery('/notices');
    expect(await screen.findByText('notice page')).toBeTruthy();
    await settled();
    expect(menuQuery.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('이 공간에 들어갈 수 없습니다')).toBeNull();
  });

  it('does not query a space menu when space entry is denied', async () => {
    const menuQuery = mountQuery('/admin/child');
    expect(await screen.findByText('이 공간에 들어갈 수 없습니다')).toBeTruthy();
    const denialBody = screen.getByText('운영 콘솔. 권한 담당자에게 요청하세요.');
    expect(denialBody).toBeTruthy();
    expect(denialBody.textContent).not.toContain(deniedSpaceSubtitle);
    expect(screen.getByText((_, node) => hasTextWithoutChild(node, '권한 담당자에게 요청하세요.'))).toBeTruthy();
    expect(screen.queryByText(/space=/)).toBeNull();
    await settled();
    expect(menuQuery).not.toHaveBeenCalled();
    expect(screen.queryByText('space page')).toBeNull();
  });

  it('does not query a global menu the user has no permission for', async () => {
    const menuQuery = mountQuery('/secret');
    expect(await screen.findByText('이 메뉴에 대한 권한이 없습니다')).toBeTruthy();
    await settled();
    expect(menuQuery).not.toHaveBeenCalled();
    expect(screen.queryByText('secret page')).toBeNull();
    expect(screen.queryByText('이 공간에 들어갈 수 없습니다')).toBeNull();
  });
});

describe('planned menu without a context bar (#304)', () => {
  it('does not mention the context bar or show id, path, or permission', async () => {
    const planned = createRegistry({
      spaces: [testSpace({ id: spaceId('mars'), homeMenuId: 'planned' })],
      groups: [{ id: groupId('equipment'), label: { ko: '설비관리', en: 'Equipment' }, icon: House, space: spaceId('mars') }],
      menus: [menu('planned', '/planned', { primary: true, label: { ko: '예정 메뉴', en: 'Planned menu' } })],
    });
    const session = testSession(['platform:view']);
    const { adapter } = fixture(async () => ({ accepted: true }));
    adapter.session = () => session;
    window.history.replaceState(null, '', '/planned?v=1');
    render(<I18nProvider><PlatformProvider adapter={adapter} registry={planned}><RouteOutlet /></PlatformProvider></I18nProvider>);
    expect(await screen.findByText('레지스트리에 선언된 메뉴 (화면 미구현)')).toBeTruthy();
    expect(screen.queryByText(/Context Bar/)).toBeNull();
    expect(screen.queryByText('path')).toBeNull();
    expect(screen.queryByText('permission')).toBeNull();
    expect(screen.queryByText('requiresScope')).toBeNull();
    expect(screen.queryByText('/planned')).toBeNull();
    expect(screen.queryByText('unsupported')).toBeNull();
    expect(screen.queryByText('apply')).toBeNull();
    expect(screen.getAllByText('이 화면에서 미사용').length).toBeGreaterThan(0);
  });
});

describe('RouteOutlet contract error view', () => {
  it('names the bad value in user words; the parser text stays in the detail note (ADR-0034, #397)', async () => {
    const { adapter } = fixture(async () => ({ accepted: true }));
    mountAt('/home?from=garbage&to=2026-09-26T09:00:00', adapter);
    expect(await screen.findByText('주소에 쓸 수 없는 값이 있습니다')).toBeTruthy();
    const sentence = await screen.findByText(/“garbage”/, { selector: 'p:not(.t-mono)' });
    expect(sentence.textContent).toBe('시작 시각 “garbage”은 이 화면에서 쓸 수 없습니다. 주소를 고치거나 조건을 초기화하세요.');
    expect(sentence.textContent).not.toMatch(/from=|계약|URL/);
    expect(screen.getByRole('note', { name: '서버 세부' }).textContent).toContain('from: use YYYY-MM-DDTHH:mm:ss');
    expect(screen.getByRole('button', { name: '조건 초기화' })).toBeTruthy();
  });

  it('조건 초기화 sends focus to main before the view disappears (06 §26, #389)', async () => {
    const { adapter } = fixture(async () => ({ accepted: true }));
    mountAt('/home?from=garbage&to=2026-09-26T09:00:00', adapter, true);
    fireEvent.click(await screen.findByRole('button', { name: '조건 초기화' }));
    expect(screen.queryByRole('button', { name: '조건 초기화' })).toBeNull();
    expect(document.activeElement).toBe(document.querySelector('main'));
  });

  it('이 지표 쌍 지우기 on the blocked metric view sends focus to main (06 §26, #389)', async () => {
    const { adapter } = fixture(async () => ({ accepted: true }));
    mountAt('/metricpage?metricId=nope', adapter, true);
    fireEvent.click(await screen.findByRole('button', { name: '이 지표 쌍 지우기' }));
    expect(screen.queryByRole('button', { name: '이 지표 쌍 지우기' })).toBeNull();
    expect(document.activeElement).toBe(document.querySelector('main'));
  });

  it('shows the diagnostic URL at full strength — no opacity on danger-soft (AA, #193 UI/UX recheck)', async () => {
    const { adapter } = fixture(async () => ({ accepted: true }));
    mountAt('/home?v=99', adapter);
    const urlText = await screen.findByText(/\/home\?v=99/);
    expect(urlText.className).toContain('t-mono');
    expect(urlText.className).not.toMatch(/(^|\s)opacity-/);
  });
});
