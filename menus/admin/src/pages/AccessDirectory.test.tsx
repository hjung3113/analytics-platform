import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { AccessDirectoryPage, AccessDirectoryQuery, AccessPrincipal, ApiResponse, PlatformAdapter, Permission, Session } from '@ap/contracts';
import { House, Wrench } from 'lucide-react';
import { createRegistry, I18nProvider, PlatformProvider, type MenuEntry } from '@ap/kernel';
import { DetailPanelSlotProvider, useDetailPanelSlotHost } from '@ap/ui';
import { manifests } from '../index';
import AccessDirectory from './AccessDirectory';

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

const none = { time: 'unsupported', roomNames: 'unsupported', condition: 'unsupported', selection: 'unsupported', lot: 'unsupported', ppid: 'unsupported', recipe: 'unsupported', metric: 'unsupported' } as const;
const noFeatures = { export: false, savedView: false, annotate: false, compare: false } as const;
// A menu declared for equipment:view so a non-console principal has a joined (and space-gated) menu to show.
const fixtureMaster: MenuEntry = {
  id: 'fixture-master', group: 'admin', label: { ko: '설비 마스터', en: 'Equipment master' }, description: { ko: '', en: '' },
  path: '/admin/fixture-master', icon: Wrench, permission: 'equipment:view', requiresScope: true, pageType: 'management',
  context: none, features: noFeatures, pageKeys: [],
};
const registry = createRegistry({
  spaces: [{ id: 'operations', label: { ko: '운영 콘솔', en: 'Operations console' }, permission: 'console:access', homeMenuId: 'admin-roles' }],
  groups: [{ id: 'admin', label: { ko: '관리·감사', en: 'Administration' }, icon: House, space: 'operations' }],
  menus: [...manifests, fixtureMaster],
});

const session: Session = {
  user: { id: 'admin-a', name: 'admin-a', title: { ko: '관리자', en: 'Administrator' }, permissions: ['console:access', 'platform:view'] },
  scopes: [],
};

const sites = (rooms: Record<string, string[]>): AccessPrincipal['sites'] => [
  { id: 'ICH', label: 'ICH · Site A', grantedRooms: rooms.ICH ?? [], totalRooms: 4 },
  { id: 'CJU', label: 'CJU · Site B', grantedRooms: rooms.CJU ?? [], totalRooms: 3 },
  { id: 'XIA', label: 'XIA · Site C', grantedRooms: rooms.XIA ?? [], totalRooms: 2 },
];
const principal = (id: string, name: string, title: { ko: string; en: string }, permissions: Permission[], rooms: Record<string, string[]>): AccessPrincipal =>
  ({ id, name, title, role: id, permissions, sites: sites(rooms) });

const VIEWER = principal('viewer', 'Field Requester', { ko: '현업 문의자', en: 'Field requester' },
  ['platform:view', 'metrics:view', 'notice:view', 'voc:view'], { ICH: ['PH-101'] });
const ENGINEER = principal('engineer', 'Process Engineer', { ko: '공정 엔지니어', en: 'Process engineer' },
  ['platform:view', 'equipment:view', 'master:view', 'analytics:view', 'metrics:view', 'notice:view', 'voc:view'],
  { ICH: ['PH-101', 'ET-102', 'CVD-201'], CJU: ['PH-301'] });
const ADMIN = principal('admin', 'Platform Admin', { ko: '플랫폼 관리자', en: 'Platform admin' },
  ['platform:view', 'equipment:view', 'master:view', 'analytics:view', 'metrics:view', 'notice:view', 'voc:view', 'console:access'],
  { ICH: ['PH-101', 'ET-102', 'CVD-201', 'DIF-202'], CJU: ['PH-301', 'ET-302', 'CMP-303'], XIA: ['PH-501', 'ET-502'] });
// Payload order is deliberately NOT the server default (role asc): the table must not re-sort a page.
const ITEMS = [VIEWER, ADMIN, ENGINEER];

const okResponse = (items: readonly AccessPrincipal[] = ITEMS): ApiResponse<AccessDirectoryPage> =>
  ({ outcome: 'ok', data: { items: [...items], total: items.length }, assessments: [], trust: null, correlationId: 'fixture' });

type ResponseForCall = (query: AccessDirectoryQuery, call: number) => ApiResponse<AccessDirectoryPage> | Promise<ApiResponse<AccessDirectoryPage>>;

function fixture(response: ApiResponse<AccessDirectoryPage> | ResponseForCall) {
  const calls: AccessDirectoryQuery[] = [];
  const adapter: PlatformAdapter = {
    menuQuery: async () => ({ outcome: 'forbidden', data: null, assessments: [], trust: null, correlationId: 'fixture' }),
    session: () => session,
    validateScope: async () => ({ status: 'valid', grantedRooms: [] }),
    publishedMetrics: () => [],
    defaultRangeTo: () => '2026-09-26T09:00:00',
    contextOptions: async () => ({ stgroup: [], team: [], makerModel: [] }),
    evaluateSelection: async () => ({ inCondition: [], outOfCondition: [] }),
    getEntity: async () => ({ outcome: 'empty', data: null, assessments: [], trust: null, correlationId: 'fixture' }),
    recordUsage: async () => ({ accepted: 0 }),
    listAnnotations: async () => ({ outcome: 'empty', data: null, assessments: [], trust: null, correlationId: 'fixture' }),
    saveAnnotation: async () => ({ outcome: 'forbidden', data: null, assessments: [], trust: null, correlationId: 'fixture' }),
    reportClientError: async () => ({ accepted: true }),
    usageSummary: async () => ({ outcome: 'forbidden', data: null, assessments: [], trust: null, correlationId: 'fixture' }),
    auditTrail: async () => ({ outcome: 'forbidden', data: null, assessments: [], trust: null, correlationId: 'fixture' }),
    entityAudit: async () => ({ outcome: 'forbidden', data: null, assessments: [], trust: null, correlationId: 'fixture' }),
    accessDirectory: async (query: AccessDirectoryQuery) => {
      calls.push(query);
      return typeof response === 'function' ? response(query, calls.length) : response;
    },
    subscribe: () => () => undefined,
  };
  return { adapter, calls };
}

function DetailSlotHost() {
  const slot = useDetailPanelSlotHost();
  return <aside ref={slot.ref} aria-label="상세 패널" />;
}

function renderRoles(path: string, response: ApiResponse<AccessDirectoryPage> | ResponseForCall = okResponse()) {
  window.history.replaceState(null, '', path);
  const f = fixture(response);
  render(<I18nProvider><PlatformProvider adapter={f.adapter} registry={registry}><DetailPanelSlotProvider><AccessDirectory /><DetailSlotHost /></DetailPanelSlotProvider></PlatformProvider></I18nProvider>);
  return f;
}

const roleInput = () => screen.getByRole('textbox', { name: /Exact role|역할 정확 일치/ });
const permissionSelect = () => screen.getByRole('combobox', { name: /Permission|권한/ });
const applyButton = () => screen.getByRole('button', { name: /Apply|적용/ });
const choosePermission = async (value: string) => {
  fireEvent.keyDown(permissionSelect(), { key: 'ArrowDown' });
  fireEvent.click(await screen.findByRole('option', { name: value }));
};
const url = () => new URLSearchParams(window.location.search);
const dataRows = () => [...document.querySelectorAll('[data-row-id]')].map(el => el.textContent ?? '');

beforeEach(() => { window.history.replaceState(null, '', '/admin/roles'); });
afterEach(() => { cleanup(); window.history.replaceState(null, '', '/'); });

describe('AccessDirectory (issue #49: /admin/roles)', () => {
  it('sends the mapped query only — no focus, no scopeId, no user id, no default sort — and lists server order', async () => {
    const f = renderRoles('/admin/roles');
    expect(screen.getByTestId('page-filter-bar')).toBeTruthy();
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

  it('maps role, permission and page onto the query and never sends focus', async () => {
    const path = `/admin/roles?${new URLSearchParams({ role: 'engineer', permission: 'console:access', page: '2', focus: 'admin' })}`;
    const f = renderRoles(path);
    await waitFor(() => expect(f.calls).toHaveLength(1));
    expect(f.calls[0]).toEqual({ role: 'engineer', permission: 'console:access', page: 2, pageSize: 25 });
  });

  it('maps the sort wire form onto the sort field', async () => {
    const f = renderRoles(`/admin/roles?${new URLSearchParams({ sort: 'grantCount:desc' })}`);
    await waitFor(() => expect(f.calls).toHaveLength(1));
    expect(f.calls[0].sort).toEqual({ field: 'grantCount', desc: true });
  });

  it.each([
    ['malformed role', `/admin/roles?${new URLSearchParams({ role: 'a b' })}`],
    ['malformed permission', `/admin/roles?${new URLSearchParams({ permission: 'console:write' })}`],
    ['malformed sort', `/admin/roles?${new URLSearchParams({ sort: 'name:up' })}`],
    ['malformed page', '/admin/roles?page=0'],
    ['malformed focus', `/admin/roles?${new URLSearchParams({ focus: 'a b' })}`],
  ])('alerts on %s without calling the adapter, keeping the form mounted', async (_name, path) => {
    const f = renderRoles(path);
    expect(screen.getByRole('alert').textContent).toMatch(/Invalid filter value|필터 값이 잘못되었습니다/);
    expect(f.calls).toHaveLength(0);
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('keeps a malformed URL role editable and uncoerced, and applies the typed draft', async () => {
    const f = renderRoles(`/admin/roles?${new URLSearchParams({ role: 'a b' })}`);
    expect((roleInput() as HTMLInputElement).value).toBe('a b');
    expect(url().get('role')).toBe('a b');
    fireEvent.change(roleInput(), { target: { value: 'engineer' } });
    expect((roleInput() as HTMLInputElement).value).toBe('engineer');
    fireEvent.click(applyButton());
    await waitFor(() => expect(f.calls).toHaveLength(1));
    expect(f.calls[0]).toMatchObject({ role: 'engineer', page: 1, pageSize: 25 });
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
    const ichRow = within(drawer).getByText('ICH · Site A').closest('li')!;
    const cjuRow = within(drawer).getByText('CJU · Site B').closest('li')!;
    expect(ichRow.textContent).toContain('3/4');
    expect(within(ichRow).getByText('PH-101, ET-102, CVD-201')).toBeTruthy();
    expect(cjuRow.textContent).toContain('1/3');
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
    secondary(within(dialog).getByText('/admin/fixture-master'));
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

    await choosePermission('console:access');
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

    await choosePermission('console:access');
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

    fireEvent.change(roleInput(), { target: { value: 'engineer' } });
    fireEvent.click(applyButton());
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

  it('clears page when a filter is applied in the same setPage', async () => {
    const f = renderRoles('/admin/roles?page=2');
    await waitFor(() => expect(f.calls).toHaveLength(1));
    expect(f.calls[0].page).toBe(2);
    await choosePermission('console:access');
    await waitFor(() => expect(f.calls).toHaveLength(2));
    expect(f.calls[1]).toMatchObject({ permission: 'console:access', page: 1 });
    expect(url().has('page')).toBe(false);
  });
});
