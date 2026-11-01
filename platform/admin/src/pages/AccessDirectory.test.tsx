import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { House, Wrench } from 'lucide-react';
import { createRegistry, I18nProvider, PlatformProvider, type MenuEntry } from '@ap/kernel';
import { testAdapter, testSession } from '@ap/kernel/testing';
import { DetailPanelSlotProvider, useDetailPanelSlotHost } from '@ap/ui';
import { manifests } from '../index';
import AccessDirectory from './AccessDirectory';
import { groupId, KERNEL_PERMISSIONS, menuPermission, spaceId, type AccessDirectoryPage, type AccessDirectoryQuery, type AccessPrincipal, type ApiResponse, type Permission } from '@ap/contracts';

const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
beforeAll(() => { HTMLElement.prototype.scrollIntoView = vi.fn(); });
afterAll(() => {
  if (originalScrollIntoView) HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
  else delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView;
});

// jsdom has no layout: the virtualizer's viewport measures 0 and calculateRange returns null, so zero
// rows render. Report fixed dimensions so the loaded rows render (test-only; a browser has real layout).
Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get() { return 800; } });
Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get() { return 1280; } });
window.ResizeObserver = class {
  #callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) { this.#callback = callback; }
  observe(target: Element) {
    this.#callback([{ target, contentRect: { width: 1280, height: 800 } } as ResizeObserverEntry], this as unknown as ResizeObserver);
  }
  unobserve() {} disconnect() {}
} as unknown as typeof ResizeObserver;

const none = { time: 'unsupported', roomNames: 'unsupported', line: 'unsupported', prcGroup: 'unsupported', condition: 'unsupported', selection: 'unsupported', lot: 'unsupported', ppid: 'unsupported', recipe: 'unsupported', metric: 'unsupported' } as const;
const noFeatures = { export: false, savedView: false, annotate: false, compare: false } as const;
// A menu declared for equipment:view so a non-console principal has a joined (and space-gated) menu to show.
const fixtureMaster: MenuEntry = {
  id: 'fixture-master', group: groupId('admin'), label: { ko: '설비 마스터', en: 'Equipment master' }, description: { ko: '', en: '' },
  path: '/admin/fixture-master', icon: Wrench, permission: menuPermission('equipment:view'), requiresScope: true, pageType: 'management',
  context: none, features: noFeatures, pageKeys: [],
};
const registry = createRegistry({
  permissions: [menuPermission('analytics:view'), menuPermission('equipment:view'), menuPermission('master:view'), menuPermission('metrics:view')],
  spaces: [{ id: spaceId('operations'), label: { ko: '운영 콘솔', en: 'Operations console' }, description: { ko: '목적', en: 'Purpose' }, permission: 'console:access', homeMenuId: 'admin-roles' }],
  groups: [{ id: groupId('admin'), label: { ko: '관리·감사', en: 'Administration' }, icon: House, space: spaceId('operations') }],
  menus: [...manifests, fixtureMaster],
});

const session = testSession(['console:access', 'platform:view'], { user: { id: 'admin-a', name: 'admin-a', title: { ko: '관리자', en: 'Administrator' } } });

const sites = (rooms: Record<string, string[]>): AccessPrincipal['sites'] => [
  { id: 'MEM', label: 'MEM · 메모리', grantedRooms: rooms.MEM ?? [], totalRooms: 4 },
  { id: 'FDRY', label: 'FDRY · 파운드리', grantedRooms: rooms.FDRY ?? [], totalRooms: 3 },
  { id: 'XIA', label: 'XIA · Site C', grantedRooms: rooms.XIA ?? [], totalRooms: 2 },
];
const principal = (id: string, name: string, title: { ko: string; en: string }, permissions: Permission[], rooms: Record<string, string[]>): AccessPrincipal =>
  ({ id, name, title, role: id, permissions, sites: sites(rooms) });

const VIEWER = principal('viewer', 'Field Requester', { ko: '현업 문의자', en: 'Field requester' },
  ['platform:view', menuPermission('metrics:view'), 'notice:view', 'voc:view'], { MEM: ['PHOTO'] });
const ENGINEER = principal('engineer', 'Process Engineer', { ko: '공정 엔지니어', en: 'Process engineer' },
  ['platform:view', menuPermission('equipment:view'), menuPermission('master:view'), menuPermission('analytics:view'), menuPermission('metrics:view'), 'notice:view', 'voc:view'],
  { MEM: ['PHOTO', 'ETCH', 'CVD'], FDRY: ['PHOTO'] });
const ADMIN = principal('admin', 'Platform Admin', { ko: '플랫폼 관리자', en: 'Platform admin' },
  ['platform:view', menuPermission('equipment:view'), menuPermission('master:view'), menuPermission('analytics:view'), menuPermission('metrics:view'), 'notice:view', 'voc:view', 'console:access'],
  { MEM: ['PHOTO', 'ETCH', 'CVD', 'DIFF'], FDRY: ['PHOTO', 'ETCH', 'CMP'], XIA: ['PHOTO', 'ETCH'] });
// Payload order is deliberately NOT the server default (role asc): the table must not re-sort a page.
const ITEMS = [VIEWER, ADMIN, ENGINEER];

const okResponse = (items: readonly AccessPrincipal[] = ITEMS): ApiResponse<AccessDirectoryPage> =>
  ({ outcome: 'ok', data: { items: [...items], total: items.length }, assessments: [], trust: null, correlationId: 'fixture' });

type ResponseForCall = (query: AccessDirectoryQuery, call: number) => ApiResponse<AccessDirectoryPage> | Promise<ApiResponse<AccessDirectoryPage>>;

function fixture(response: ApiResponse<AccessDirectoryPage> | ResponseForCall) {
  const calls: AccessDirectoryQuery[] = [];
  const adapter = testAdapter({
    session: () => session,
    accessDirectory: async (query: AccessDirectoryQuery) => {
      calls.push(query);
      return typeof response === 'function' ? response(query, calls.length) : response;
    },
  });
  return { adapter, calls };
}

function DetailSlotHost() {
  const slot = useDetailPanelSlotHost();
  return <aside ref={slot.ref} aria-label="상세 패널" />;
}

function renderRoles(path: string, response: ApiResponse<AccessDirectoryPage> | ResponseForCall = okResponse()) {
  window.history.replaceState(null, '', path);
  const f = fixture(response);
  render(<I18nProvider><PlatformProvider equipmentAxes={equipmentAxes} adapter={f.adapter} registry={registry}><DetailPanelSlotProvider><AccessDirectory /><DetailSlotHost /></DetailPanelSlotProvider></PlatformProvider></I18nProvider>);
  return f;
}

// ADR-0105: 역할 and 권한 are pinned fields of the table's filter line; each opens the shared editor.
const line = () => document.querySelector<HTMLElement>('[data-filter-line]')!;
const FIELD_ID: Record<string, string> = { 역할: 'role', 권한: 'permission' };
const openField = async (name: string) => {
  fireEvent.click(line().querySelector<HTMLElement>(`[data-filter-body="${FIELD_ID[name]}"]`)!);
  return screen.findByRole('dialog', { name });
};
const applyRole = async (value: string) => {
  const dialog = await openField('역할');
  fireEvent.change(within(dialog).getByRole('textbox', { name: '값' }), { target: { value } });
  fireEvent.click(within(dialog).getByRole('button', { name: '적용' }));
};
const choosePermission = async (value: string) => {
  const dialog = await openField('권한');
  fireEvent.click(within(dialog).getByRole('radio', { name: value }));
  fireEvent.click(within(dialog).getByRole('button', { name: '적용' }));
};
// A history step (Back/Forward) changes the query without a user change, so the focused row stays (a user filter change closes it, #673).
const historyStep = (params: Record<string, string>) => act(() => { window.history.pushState(null, '', `/admin/roles?${new URLSearchParams(params)}`); window.dispatchEvent(new PopStateEvent('popstate')); });
const clearAll = () => fireEvent.click(within(line()).getByRole('button', { name: '모두 지우기' }));
const url = () => new URLSearchParams(window.location.search);
const dataRows = () => [...document.querySelectorAll('[data-row-id]')].map(el => el.textContent ?? '');

beforeEach(() => {
  window.history.replaceState(null, '', '/admin/roles');
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 1200, height: 98, x: 0, y: 0, top: 0, left: 0, right: 1200, bottom: 98, toJSON() {} });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); window.history.replaceState(null, '', '/'); });

describe('AccessDirectory (issue #49: /admin/roles)', () => {
  it('sends the mapped query only — no focus, no scopeId, no user id, no default sort — and lists server order', async () => {
    const f = renderRoles('/admin/roles');
    // No rail: the conditions live in the table's filter line (pinned 역할 · 권한).
    expect(line()).toBeTruthy();
    expect(screen.queryByTestId('page-filter-bar')).toBeNull();
    expect(within(line()).getByRole('button', { name: /^역할/ })).toBeTruthy();
    expect(within(line()).getByRole('button', { name: /^권한/ })).toBeTruthy();
    await waitFor(() => expect(f.calls).toHaveLength(1));
    expect(f.calls[0]).toEqual({ page: 1, pageSize: 25 });
    // Payload order [viewer, admin, engineer] is served as-is: the client never re-sorts a page.
    await screen.findByText('Field Requester');
    const rows = dataRows();
    // `data-row-id` selects body rows only; there is no header row at index 0.
    expect(rows[0]).toContain('Field Requester');
    expect(rows[1]).toContain('Platform Admin');
    expect(rows[2]).toContain('Process Engineer');
  });

  it('offers the registry\'s permission list as the editor options: kernel first, then the app\'s declared ones (ADR-0072), one value only', async () => {
    renderRoles('/admin/roles');
    const dialog = await openField('권한');
    const options = within(dialog).getAllByRole('radio').map(option => option.closest('li')!.textContent);
    expect(options).toEqual([...registry.permissions]);
    expect(registry.permissions.slice(0, 5)).toEqual([...KERNEL_PERMISSIONS]);
  });

  it('a permission the registry does not list in an old link is refused by the codec, with the filter title and a reset that clears the old key', () => {
    renderRoles(`/admin/roles?${new URLSearchParams({ permission: 'ghost:view' })}`);
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('필터 값이 올바르지 않습니다');
    expect(alert.textContent).toContain('권한 “ghost:view”');
    fireEvent.click(within(alert).getByRole('button', { name: '초기화' }));
    expect(url().has('permission')).toBe(false);
  });

  it('old ?role=&permission= links show the same query, then leave the address', async () => {
    const f = renderRoles(`/admin/roles?${new URLSearchParams({ role: 'engineer', permission: 'console:access' })}`);
    await waitFor(() => expect(f.calls.at(-1)).toEqual({ role: 'engineer', permission: 'console:access', page: 1, pageSize: 25 }));
    await waitFor(() => expect(url().has('role')).toBe(false));
    expect(url().has('permission')).toBe(false);
    expect(url().has('filter')).toBe(false);
    expect(within(line()).getByRole('button', { name: /^역할.*engineer/ })).toBeTruthy();
  });

  it('maps role, permission and page onto the query and never sends focus', async () => {
    const path = `/admin/roles?${new URLSearchParams({ role: 'engineer', permission: 'console:access', page: '2', focus: 'admin' })}`;
    // Page 2 of a 3-row directory is past the end and would clamp (#314). This test is the page-key mapping, so the total keeps page 2 in range.
    const response = okResponse();
    if (response.data) response.data.total = 50;
    const f = renderRoles(path, response);
    await waitFor(() => expect(f.calls).toHaveLength(1));
    expect(f.calls[0]).toEqual({ role: 'engineer', permission: 'console:access', page: 2, pageSize: 25 });
  });

  it('maps the sort wire form onto the sort field', async () => {
    const f = renderRoles(`/admin/roles?${new URLSearchParams({ sort: 'grantCount:desc' })}`);
    await waitFor(() => expect(f.calls).toHaveLength(1));
    expect(f.calls[0].sort).toEqual({ field: 'grantCount', desc: true });
  });

  it.each([
    ['malformed role', `/admin/roles?${new URLSearchParams({ role: 'a b' })}`, '역할 “a b”'],
    ['malformed permission', `/admin/roles?${new URLSearchParams({ permission: 'console:write' })}`, '권한 “console:write”'],
    ['malformed sort', `/admin/roles?${new URLSearchParams({ sort: 'name:up' })}`, '정렬 “name:up”은'],
    ['malformed page', '/admin/roles?page=0', '페이지 “0”는'],
    ['malformed focus', `/admin/roles?${new URLSearchParams({ focus: 'a b' })}`, '상세 대상 “a b”은'],
  ])('alerts on %s without calling the adapter, keeping the form mounted', async (_name, path, sentence) => {
    const f = renderRoles(path);
    expect(screen.getByRole('alert').textContent).toContain(sentence);
    expect(f.calls).toHaveLength(0);
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('sort/page only: the shared table warning (sort/page title) resets sort and page, keeps the conditions, and focus leaves BODY', () => {
    renderRoles(`/admin/roles?${new URLSearchParams({ role: 'engineer', permission: 'console:access', sort: 'bogus', page: '2' })}`);
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('정렬·페이지 값이 올바르지 않습니다');
    expect(alert.textContent).toContain('정렬 “bogus”');
    fireEvent.click(within(alert).getByRole('button', { name: '초기화' }));
    expect(url().has('sort')).toBe(false);
    expect(url().has('page')).toBe(false);
    expect(document.activeElement).not.toBe(document.body);
    // The old role/permission links were rewritten into the hidden filter key; the conditions survive the reset.
    expect(line().querySelector('[data-column-filter-chip="role"]')).toBeTruthy();
    expect(line().querySelector('[data-column-filter-chip="permission"]')).toBeTruthy();
  });

  it('filter only: the title names the filter, the reset (recoverKeys) clears the bad filter keys and keeps sort', () => {
    renderRoles(`/admin/roles?${new URLSearchParams({ permission: 'console:write', role: 'engineer', sort: 'name:desc' })}`);
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('필터 값이 올바르지 않습니다');
    expect(alert.textContent).not.toContain('정렬·페이지');
    expect(alert.textContent).toContain('권한 “console:write”');
    fireEvent.click(within(alert).getByRole('button', { name: '초기화' }));
    expect(url().has('permission')).toBe(false);
    expect(url().has('role')).toBe(false);
    expect(url().get('sort')).toBe('name:desc');
    expect(document.activeElement).not.toBe(document.body);
  });

  it('a bad filter and a bad sort together: one combined title, the reset clears both', () => {
    renderRoles(`/admin/roles?${new URLSearchParams({ permission: 'console:write', sort: 'bogus' })}`);
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('정렬·페이지·필터 값이 올바르지 않습니다');
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    fireEvent.click(within(alert).getByRole('button', { name: '초기화' }));
    expect(url().has('permission')).toBe(false);
    expect(url().has('sort')).toBe(false);
  });

  it('a malformed old role is refused, never coerced; a role typed in the editor then queries', async () => {
    const f = renderRoles(`/admin/roles?${new URLSearchParams({ role: 'a b' })}`);
    expect(url().get('role')).toBe('a b');
    expect(f.calls).toHaveLength(0);
    fireEvent.click(within(screen.getByRole('alert')).getByRole('button', { name: '초기화' }));
    await waitFor(() => expect(f.calls).toHaveLength(1));
    await applyRole('engineer');
    await waitFor(() => expect(f.calls).toHaveLength(2));
    expect(f.calls[1]).toEqual({ role: 'engineer', page: 1, pageSize: 25 });
  });

  it('renders forbidden as the no-access state with the server message, never as the empty state', async () => {
    renderRoles('/admin/roles', { outcome: 'forbidden', data: null, assessments: [], trust: null, correlationId: 'fixture', message: 'Permission revoked (scenario)' });
    await screen.findByText('Permission revoked (scenario)');
    expect(screen.getAllByText(/이 Scope에 접근 권한이 없습니다|You do not have access to this scope/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/조건에 맞는 결과가 없습니다|No matching result/)).toBeNull();
  });

  it('renders empty as the no-data state, never as the no-access state', async () => {
    renderRoles('/admin/roles', { outcome: 'empty', data: null, assessments: [], trust: null, correlationId: 'fixture' });
    await screen.findByText(/조건에 맞는 결과가 없습니다|No matching result/);
    expect(screen.queryByText(/이 Scope에 접근 권한이 없습니다|You do not have access to this scope/)).toBeNull();
  });

  it('opens the drawer from the loaded rows: held permissions, client-joined menus, site counts', async () => {
    const f = renderRoles('/admin/roles');
    await waitFor(() => expect(f.calls).toHaveLength(1));
    const engineerRow = screen.getAllByRole('row').find(r => r.textContent?.includes('Process Engineer'))!;
    fireEvent.click(within(engineerRow).getByRole('button', { name: /보기|View/ }));
    expect(url().get('focus')).toBe('engineer');
    // Held permissions in wire order, console:access omitted; the joined fixture menu carries the space badge.
    expect(await screen.findByRole('tab', { name: /권한|Permissions/ })).toBeTruthy();
    const drawer = screen.getByRole('dialog');
    expect(within(drawer).getByText('equipment:view')).toBeTruthy();
    expect(within(drawer).getByText('fixture-master')).toBeTruthy();
    expect(within(drawer).getByText(/공간|space/)).toBeTruthy();
    expect(within(drawer).queryByText('console:access')).toBeNull();
    // The drawer is fed by the loaded page rows: no second adapter call.
    expect(f.calls).toHaveLength(1);
    fireEvent.mouseDown(screen.getByRole('tab', { name: /사이트 범위|Site scope/ }));
    const memRow = within(drawer).getByText('MEM · 메모리').closest('li')!;
    const fdryRow = within(drawer).getByText('FDRY · 파운드리').closest('li')!;
    expect(memRow.textContent).toContain('3/4');
    expect(within(memRow).getByText('PHOTO, ETCH, CVD')).toBeTruthy();
    expect(fdryRow.textContent).toContain('1/3');
    // Zero grants are the row copy on an ok page, not the page empty state.
    const xiaRow = within(drawer).getByText('XIA · Site C').closest('li')!;
    expect(xiaRow.textContent).toContain('0/2');
    expect(within(xiaRow).getByText(/부여 없음|No rooms granted/)).toBeTruthy();
    expect(screen.queryByText(/조건에 맞는 결과가 없습니다|No matching result/)).toBeNull();
  });

  it('keeps sunken-row metadata readable in permissions and site scope', async () => {
    renderRoles('/admin/roles?focus=engineer');
    const dialog = await screen.findByRole('dialog');
    const secondary = (element: HTMLElement) => {
      expect(element.closest('li')?.classList.contains('bg-surface-sunken')).toBe(true);
      expect(element.classList.contains('text-text-secondary')).toBe(true);
      expect(element.classList.contains('text-text-muted')).toBe(false);
    };
    secondary(within(dialog).getByText('fixture-master'));
    secondary(within(dialog).getByText('/operations/fixture-master'));
    fireEvent.mouseDown(within(dialog).getByRole('tab', { name: /사이트 범위|Site scope/ }));
    secondary(within(dialog).getByText(/부여 없음|No rooms granted/));
  });

  it('clears the drawer principal when the latest page result has no data', async () => {
    const empty: ApiResponse<AccessDirectoryPage> = { outcome: 'empty', data: null, assessments: [], trust: null, correlationId: 'empty' };
    const f = renderRoles('/admin/roles', (_query, call) => call === 1 ? okResponse([ENGINEER]) : empty);
    await waitFor(() => expect(f.calls).toHaveLength(1));
    const engineerRow = screen.getAllByRole('row').find(r => r.textContent?.includes('Process Engineer'))!;
    fireEvent.click(within(engineerRow).getByRole('button', { name: /보기|View/ }));
    expect(await screen.findByRole('heading', { name: 'Process Engineer' })).toBeTruthy();

    historyStep({ focus: 'engineer', permission: 'console:access' });
    await waitFor(() => expect(f.calls).toHaveLength(2));
    expect(await screen.findByText(/이 페이지에 없는 주체입니다\.|Principal not on this page\./)).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Process Engineer' })).toBeNull();
  });

  it('does not let an aborted page response replace the rows used by the drawer', async () => {
    let resolveFirst!: (response: ApiResponse<AccessDirectoryPage>) => void;
    const f = renderRoles('/admin/roles?focus=viewer', (_query, call) => call === 1
      ? new Promise<ApiResponse<AccessDirectoryPage>>(resolve => { resolveFirst = resolve; })
      : okResponse([VIEWER]));
    await waitFor(() => expect(f.calls).toHaveLength(1));

    historyStep({ focus: 'viewer', permission: 'console:access' });
    await waitFor(() => expect(f.calls).toHaveLength(2));
    expect(await screen.findByRole('heading', { name: 'Field Requester' })).toBeTruthy();

    resolveFirst(okResponse([ENGINEER]));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Field Requester' })).toBeTruthy());
    expect(screen.queryByRole('heading', { name: 'Process Engineer' })).toBeNull();
  });

  it('never calls a focus unknown before a page answered, or when the page answered forbidden (06 §17)', async () => {
    let resolveFirst!: (response: ApiResponse<AccessDirectoryPage>) => void;
    const f = renderRoles('/admin/roles?focus=engineer', () => new Promise<ApiResponse<AccessDirectoryPage>>(resolve => { resolveFirst = resolve; }));
    await waitFor(() => expect(f.calls).toHaveLength(1));
    // In flight: no rows yet, so no verdict about the focus.
    expect(screen.queryByText(/이 페이지에 없는 주체입니다\.|Principal not on this page\./)).toBeNull();
    resolveFirst({ outcome: 'forbidden', data: null, assessments: [], trust: null, correlationId: 'fixture', message: 'No permission console:access' });
    await screen.findByText('No permission console:access');
    // No access is not "no such principal": the drawer alert stays off and no drawer opens.
    expect(screen.queryByText(/이 페이지에 없는 주체입니다\.|Principal not on this page\./)).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('voids an earlier verdict and drawer while the next request is pending (review P2)', async () => {
    let resolveSecond!: (response: ApiResponse<AccessDirectoryPage>) => void;
    const empty: ApiResponse<AccessDirectoryPage> = { outcome: 'empty', data: null, assessments: [], trust: null, correlationId: 'empty' };
    const f = renderRoles(`/admin/roles?${new URLSearchParams({ role: 'ghost', focus: 'engineer' })}`, (_query, call) => call === 1
      ? empty
      : new Promise<ApiResponse<AccessDirectoryPage>>(resolve => { resolveSecond = resolve; }));
    expect(await screen.findByText(/이 페이지에 없는 주체입니다\.|Principal not on this page\./)).toBeTruthy();

    historyStep({ focus: 'engineer', role: 'engineer' });
    await waitFor(() => expect(f.calls).toHaveLength(2));
    // Pending: the empty answer was about role=ghost, not about this query.
    expect(screen.queryByText(/이 페이지에 없는 주체입니다\.|Principal not on this page\./)).toBeNull();

    resolveSecond(okResponse([ENGINEER]));
    expect(await screen.findByRole('heading', { name: 'Process Engineer' })).toBeTruthy();
    expect(screen.queryByText(/이 페이지에 없는 주체입니다\.|Principal not on this page\./)).toBeNull();
  });

  it('drops focus when the user re-sorts, so a row that moved pages is not called missing (bot review P2)', async () => {
    const f = renderRoles('/admin/roles?focus=engineer');
    expect(await screen.findByRole('heading', { name: 'Process Engineer' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /이름|Name/ }));
    await waitFor(() => expect(url().get('sort')).not.toBeNull());
    expect(url().has('focus')).toBe(false);
    await waitFor(() => expect(f.calls.length).toBeGreaterThan(1));
    expect(screen.queryByText(/이 페이지에 없는 주체입니다\.|Principal not on this page\./)).toBeNull();
  });

  it('alerts inside the drawer for a well-formed unknown focus while the table stays', async () => {
    const f = renderRoles(`/admin/roles?${new URLSearchParams({ focus: 'ghost' })}`);
    await waitFor(() => expect(f.calls).toHaveLength(1));
    expect(f.calls[0]).toEqual({ page: 1, pageSize: 25 });
    expect(await screen.findByText(/이 페이지에 없는 주체입니다\.|Principal not on this page\./)).toBeTruthy();
    await screen.findByText('Field Requester'); // the table still lists the page
    fireEvent.click(screen.getByRole('button', { name: /닫기|Close/ }));
    expect(url().has('focus')).toBe(false);
  });

  // W-350: the drawer tab is URL-owned (06 §13) — set, cleared on the default tab, restored on deep link.
  it('restores the drawer tab from the URL and clears it when the default tab is chosen', async () => {
    renderRoles('/admin/roles?focus=engineer');
    const dialog = await screen.findByRole('dialog');
    fireEvent.mouseDown(within(dialog).getByRole('tab', { name: /사이트 범위|Site scope/ }));
    expect(url().get('tab')).toBe('sites');
    fireEvent.mouseDown(within(dialog).getByRole('tab', { name: /권한|Permissions/ }));
    expect(url().has('tab')).toBe(false);
  });

  it('selects the URL tab on a drawer deep link', async () => {
    renderRoles('/admin/roles?v=1&focus=engineer&tab=sites');
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('tab', { name: /사이트 범위|Site scope/ }).getAttribute('aria-selected')).toBe('true');
  });

  it('alerts inside the drawer for an unknown tab while the table stays, and clears the tab from the alert button', async () => {
    const f = renderRoles('/admin/roles?v=1&focus=engineer&tab=bogus');
    // An unknown tab is a drawer alert, not a page parse failure: the adapter still answers.
    await waitFor(() => expect(f.calls).toHaveLength(1));
    await screen.findByText('Field Requester');
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('alert').textContent).toMatch(/등록되지 않은 탭입니다|This tab is not registered\./);
    fireEvent.click(within(dialog).getByRole('button', { name: /권한 열기|Open permissions/ }));
    expect(url().has('tab')).toBe(false);
    expect(within(dialog).getByRole('tab', { name: /권한|Permissions/ }).getAttribute('aria-selected')).toBe('true');
  });

  it('keeps the alert tab selected across history traversal while the same drawer stays mounted', async () => {
    renderRoles('/admin/roles?v=1&focus=engineer&tab=sites');
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('tab', { name: /사이트 범위|Site scope/ }).getAttribute('aria-selected')).toBe('true');
    const visit = (tab: string) => act(() => {
      window.history.pushState(null, '', `/admin/roles?v=1&focus=engineer&tab=${tab}`);
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    visit('bogus');
    expect(within(dialog).getByRole('alert').textContent).toMatch(/등록되지 않은 탭입니다|This tab is not registered\./);
    expect(within(dialog).getByRole('button', { name: /권한 열기|Open permissions/ })).toBeTruthy();
    visit('sites');
    expect(within(dialog).getByRole('tab', { name: /사이트 범위|Site scope/ }).getAttribute('aria-selected')).toBe('true');
  });

  it('clears focus and tab together when the drawer closes', async () => {
    renderRoles('/admin/roles?focus=engineer&tab=sites');
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /상세 닫기|Close details/ }));
    expect(url().has('focus')).toBe(false);
    expect(url().has('tab')).toBe(false);
  });

  it('clears page when a filter is applied in the same setPage, and the focused row leaves with it (#673)', async () => {
    // Total 50 keeps page 2 in range so the filter, not a clamp, clears it (#314).
    const response = okResponse();
    if (response.data) response.data.total = 50;
    const f = renderRoles('/admin/roles?page=2&focus=engineer&tab=sites', response);
    await waitFor(() => expect(f.calls).toHaveLength(1));
    expect(f.calls[0].page).toBe(2);
    await choosePermission('console:access');
    await waitFor(() => expect(f.calls).toHaveLength(2));
    expect(f.calls[1]).toMatchObject({ permission: 'console:access', page: 1 });
    expect(url().has('page')).toBe(false);
    expect(url().has('focus')).toBe(false);
    expect(url().has('tab')).toBe(false);
    expect(url().has('filter')).toBe(false); // hidden page key
  });

  it('applies both conditions as one query; 모두 지우기 removes them and returns to page 1', async () => {
    const f = renderRoles('/admin/roles');
    await waitFor(() => expect(f.calls).toHaveLength(1));
    await applyRole('en');
    await waitFor(() => expect(f.calls).toHaveLength(2));
    await choosePermission('console:access');
    await waitFor(() => expect(f.calls).toHaveLength(3));
    expect(f.calls[2]).toMatchObject({ role: 'en', permission: 'console:access', page: 1 });
    clearAll();
    await waitFor(() => expect(f.calls).toHaveLength(4));
    expect(f.calls[3]).toEqual({ page: 1, pageSize: 25 });
  });

  it('offers the clear in the empty state while a condition is applied, and it clears the condition', async () => {
    const f = renderRoles('/admin/roles', { outcome: 'empty', data: null, assessments: [], trust: null, correlationId: 'fixture' });
    await screen.findByText(/조건에 맞는 결과가 없습니다|No matching result/);
    await applyRole('ghost');
    await waitFor(() => expect(f.calls).toHaveLength(2));
    fireEvent.click(await screen.findByRole('button', { name: '필터 초기화' }));
    await waitFor(() => expect(f.calls).toHaveLength(3));
    expect(f.calls[2]).toEqual({ page: 1, pageSize: 25 });
  });

  it('모두 지우기 from a focused, tabbed, filtered state closes focus and tab in the same write (#673)', async () => {
    const f = renderRoles('/admin/roles?filter=role:equals:engineer&focus=engineer&tab=sites');
    await waitFor(() => expect(f.calls).toHaveLength(1));
    clearAll();
    await waitFor(() => expect(f.calls).toHaveLength(2));
    expect(f.calls[1]).toEqual({ page: 1, pageSize: 25 });
    expect(url().has('filter')).toBe(false);
    expect(url().has('focus')).toBe(false);
    expect(url().has('tab')).toBe(false);
  });

  it('the empty-state reset from a focused, tabbed, filtered state closes focus and tab too', async () => {
    const f = renderRoles('/admin/roles?filter=role:equals:ghost&focus=engineer&tab=sites', { outcome: 'empty', data: null, assessments: [], trust: null, correlationId: 'fixture' });
    fireEvent.click(await screen.findByRole('button', { name: '필터 초기화' }));
    await waitFor(() => expect(f.calls).toHaveLength(2));
    expect(url().has('filter')).toBe(false);
    expect(url().has('focus')).toBe(false);
    expect(url().has('tab')).toBe(false);
  });

  it.each([
    ['a malformed role', 'role:equals:a b', '역할'],
    ['an unregistered permission', 'permission:in:ghost:view', '권한'],
  ])('%s in the new filter key: a filter warning, no port query, the reset recovers', async (_name, condition, fragment) => {
    const f = renderRoles(`/admin/roles?${new URLSearchParams([['filter', condition]])}`);
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('필터 값이 올바르지 않습니다');
    expect(alert.textContent).toContain(fragment);
    expect(f.calls).toHaveLength(0);
    fireEvent.click(within(alert).getByRole('button', { name: '초기화' }));
    await waitFor(() => expect(f.calls).toHaveLength(1));
    expect(f.calls[0]).toEqual({ page: 1, pageSize: 25 });
  });

  it('the 역할 editor blocks a malformed token inline with Apply disabled', async () => {
    const f = renderRoles('/admin/roles');
    await waitFor(() => expect(f.calls).toHaveLength(1));
    fireEvent.click(document.querySelector<HTMLElement>('[data-filter-body="role"]')!);
    const dialog = await screen.findByRole('dialog', { name: '역할' });
    fireEvent.change(within(dialog).getByRole('textbox', { name: '값' }), { target: { value: 'a b' } });
    expect(within(dialog).getByRole('alert').textContent).toContain('80자');
    expect((within(dialog).getByRole('button', { name: '적용' }) as HTMLButtonElement).disabled).toBe(true);
    expect(f.calls).toHaveLength(1);
  });

  // UX B-06 / #301: every row shared the name 보기/View — a screen reader on the list cannot tell rows apart.
  it('names each row action after its actual principal id, keeping the short visible label', async () => {
    renderRoles('/admin/roles');
    await waitFor(() => expect(document.querySelectorAll('[data-row-id]')).toHaveLength(ITEMS.length));
    for (const row of document.querySelectorAll('[data-row-id]')) {
      const id = row.getAttribute('data-row-id');
      const button = [...row.querySelectorAll('button')].find(b => b.textContent === '보기');
      expect(button).toBeTruthy();
      expect(button?.getAttribute('aria-label')).toBe(`${id} 보기`);
      expect(button?.textContent).toBe('보기');
    }
  });
});

const equipmentAxes = [
  { id: 'stgroup', label: { ko: 'StGroup', en: 'StGroup' }, membershipHistory: false },
  { id: 'team', label: { ko: '분임조', en: 'Team' }, membershipHistory: false },
  { id: 'maker', label: { ko: 'Maker', en: 'Maker' }, membershipHistory: false },
  { id: 'model', label: { ko: 'Model', en: 'Model' }, membershipHistory: false, dependsOn: 'maker' },
];
