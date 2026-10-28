import type { ReactNode } from 'react';
import { UserCog } from 'lucide-react';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryStorage } from '@ap/kernel/testing';
import { setFoApi } from '@ap/feature-bridge/fo-api';
import { createFoMenuHarness } from '@ap/feature-bridge/testing';
import { useHostSeam } from '@/lib/host/host-seam';
import { harnessMenus, homeStub, mountAt, warmPages } from '../test-support';

type Parts = Record<string, unknown>;
type DetailProps = { renderDetail?: (parts: Parts) => ReactNode };
/** The five FeedbackOps entries are doubles that record how the pages drive them; the value checks (FeedbackOps' real admin-search validators) are not mocked. */
const fo = vi.hoisted(() => ({
  managedSystems: 0,
  areas: [] as DetailProps[],
  requests: [] as (DetailProps & { autoSelect?: boolean })[],
  grants: [] as (DetailProps & { autoSelect?: boolean })[],
  settings: [] as { section?: string | null }[],
  requestClose: vi.fn(),
}));
const detail = (props: DetailProps) => props.renderDetail?.({ title: '상세 제목', body: <p>상세 본문</p>, requestClose: fo.requestClose });
vi.mock('@ap/feature-screens/operator-screens/managed-systems', () => ({
  ManagedSystemsAdminPage: () => {
    fo.managedSystems += 1;
    const seam = useHostSeam();
    return <div data-testid="managed-systems" data-here={seam.useHere!()} data-owns-title={String(seam.hostOwnsTitle)} />;
  },
}));
vi.mock('@ap/feature-screens/operator-screens/analytics-areas', () => ({
  AnalyticsAreasAdminPage: (props: DetailProps) => {
    fo.areas.push(props);
    const seam = useHostSeam();
    return <div data-testid="areas" data-here={seam.useHere!()}>{detail(props)}</div>;
  },
}));
vi.mock('@ap/feature-screens/operator-screens/permission-requests', () => ({
  PermissionRequestsScreen: (props: DetailProps & { autoSelect?: boolean }) => {
    fo.requests.push(props);
    const seam = useHostSeam();
    return <div data-testid="requests" data-here={seam.useHere!()}>{detail(props)}</div>;
  },
}));
vi.mock('@ap/feature-screens/operator-screens/permission-grants', () => ({
  PermissionGrantsScreen: (props: DetailProps & { autoSelect?: boolean }) => {
    fo.grants.push(props);
    const seam = useHostSeam();
    return <div data-testid="grants" data-here={seam.useHere!()}>{detail(props)}</div>;
  },
}));
vi.mock('@ap/feature-screens/operator-screens/settings', () => ({
  WorkspaceSettingsScreen: (props: { section?: string | null }) => {
    fo.settings.push(props);
    const seam = useHostSeam();
    return <div data-testid="settings" data-here={seam.useHere!()} />;
  },
}));

const SYSTEM = '33333333-3333-4333-8333-333333333333';
const ROW = '99999999-9999-4999-8999-99999999999a';
const MS = '/feedbackops/fo-managed-systems';
const AREAS = '/feedbackops/fo-analytics-areas';
const REQUESTS = '/feedbackops/fo-permission-requests';
const GRANTS = '/feedbackops/fo-permission-grants';
const SETTINGS = '/feedbackops/fo-settings';
const request = vi.fn();
const hereOf = (testId: string) => new URL(screen.getByTestId(testId).getAttribute('data-here')!, 'http://x');

beforeAll(warmPages, 60_000);
beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
  vi.stubGlobal('fetch', request);
  fo.managedSystems = 0; fo.areas.length = 0; fo.requests.length = 0; fo.grants.length = 0; fo.settings.length = 0; fo.requestClose.mockReset(); request.mockReset();
});
afterEach(() => { cleanup(); setFoApi(null); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });

describe('관리자 without a FeedbackOps API (mock preview)', () => {
  it.each([
    [MS, 'Managed System', 'managed-systems'],
    [AREAS, 'Analytics Area', 'areas'],
    [REQUESTS, '권한 요청 검토', 'requests'],
    [GRANTS, '부여 목록', 'grants'],
    [SETTINGS, 'FeedbackOps 설정', 'settings'],
  ])('%s shows 실서버 필요 and mounts no screen', async (path, title, testId) => {
    mountAt(path);
    await screen.findByRole('heading', { name: title }, { timeout: 3000 });
    expect(screen.getByRole('status').textContent).toContain('실서버 필요');
    expect(screen.queryByTestId(testId)).toBeNull();
  });
});

describe('a user with feedbackops:access but without console:access', () => {
  const { mountAt: mountPlain } = createFoMenuHarness({ manifests: harnessMenus, homeMenuId: homeStub.id, group: { id: 'foAdmin', label: { ko: '관리자', en: 'Admin' }, icon: UserCog } });
  beforeEach(() => { setFoApi({ basePath: '/api/fo', onSessionLost: vi.fn() }); });

  it.each([[MS], [AREAS], [REQUESTS], [GRANTS], [SETTINGS]])('%s never mounts its screen and requests nothing', async path => {
    mountPlain(path);
    await new Promise(resolve => setTimeout(resolve, 300));
    for (const testId of ['managed-systems', 'areas', 'requests', 'grants', 'settings']) expect(screen.queryByTestId(testId)).toBeNull();
    expect(request).not.toHaveBeenCalled();
  });
});

describe('관리자 through the FeedbackOps bridge', () => {
  beforeEach(() => { setFoApi({ basePath: '/api/fo', onSessionLost: vi.fn() }); });

  it('mounts Managed System reading the page as /admin/managed-systems with the host owning the title; the carried scope is ignored', async () => {
    mountAt(`${MS}?managedSystem=${SYSTEM}`);
    const el = await screen.findByTestId('managed-systems');
    expect(el.getAttribute('data-owns-title')).toBe('true');
    const here = hereOf('managed-systems');
    expect(here.pathname).toBe('/admin/managed-systems');
    expect([...here.searchParams]).toEqual([]);
  });

  it('mounts Analytics Area with system as its own filter, and focus as the selected area in the shell detail slot', async () => {
    mountAt(`${AREAS}?system=${SYSTEM}&includeArchived=true&focus=${ROW}&managedSystem=${SYSTEM}`);
    await screen.findByTestId('areas');
    const here = hereOf('areas');
    expect(here.pathname).toBe('/admin/analytics-areas');
    expect(Object.fromEntries(here.searchParams)).toEqual({ managedSystem: SYSTEM, includeArchived: 'true', selected: ROW });
    const dialog = await within(await screen.findByRole('complementary', { name: '상세 패널' })).findByRole('dialog');
    expect(within(dialog).getByText('상세 본문')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '상세 닫기' }));
    expect(fo.requestClose).toHaveBeenCalledOnce();
  });

  it.each([
    [REQUESTS, 'requests', '/admin/permissions/requests', 'approved', () => fo.requests],
    [GRANTS, 'grants', '/admin/permissions/grants', 'denies', () => fo.grants],
  ])('%s mounts the console with no auto-select, tab and focus from the address, and the detail in the shell slot', async (path, testId, foPath, tab, calls) => {
    mountAt(`${path}?tab=${tab}&focus=${ROW}`);
    await screen.findByTestId(testId);
    const here = hereOf(testId);
    expect(here.pathname).toBe(foPath);
    expect(Object.fromEntries(here.searchParams)).toEqual({ tab, selected: ROW });
    expect(calls().at(-1)!.autoSelect).toBe(false);
    expect(within(await screen.findByRole('complementary', { name: '상세 패널' })).getByText('상세 본문')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '상세 닫기' }));
    expect(fo.requestClose).toHaveBeenCalledOnce();
  });

  it('mounts 설정 reading the page as /admin/settings#coverage on section=coverage and passes the section to the screen', async () => {
    mountAt(`${SETTINGS}?section=coverage`);
    await screen.findByTestId('settings');
    const here = hereOf('settings');
    expect(here.pathname).toBe('/admin/settings');
    expect(here.hash).toBe('#coverage');
    expect(fo.settings.at(-1)!.section).toBe('coverage');
  });

  it('mounts 설정 without a section as plain /admin/settings with section null', async () => {
    mountAt(SETTINGS);
    await screen.findByTestId('settings');
    expect(hereOf('settings').hash).toBe('');
    expect(fo.settings.at(-1)!.section).toBeNull();
  });
});

describe('관리자 with an invalid address value', () => {
  beforeEach(() => { setFoApi({ basePath: '/api/fo', onSessionLost: vi.fn() }); });

  it.each([
    [AREAS, 'system', 'x'],
    [AREAS, 'includeArchived', 'yes'],
    [AREAS, 'focus', 'not-a-uuid'],
    [REQUESTS, 'tab', 'x'],
    [REQUESTS, 'focus', 'not-a-uuid'],
    [GRANTS, 'tab', 'x'],
    [GRANTS, 'focus', 'not-a-uuid'],
    [SETTINGS, 'section', 'other'],
  ])('%s rejects %s=%s, keeps the address and requests nothing', async (path, key, value) => {
    const search = `?${key}=${encodeURIComponent(value)}`;
    mountAt(`${path}${search}`);
    expect(await screen.findByText(`주소의 ${key} 값이 올바르지 않습니다`, undefined, { timeout: 3000 })).toBeTruthy();
    for (const testId of ['areas', 'requests', 'grants', 'settings']) expect(screen.queryByTestId(testId)).toBeNull();
    expect(fo.areas).toEqual([]);
    expect(fo.requests).toEqual([]);
    expect(fo.grants).toEqual([]);
    expect(fo.settings).toEqual([]);
    expect(request).not.toHaveBeenCalled();
    expect(window.location.search).toBe(search);
  });
});
