import type { ReactNode } from 'react';
import { KeyRound } from 'lucide-react';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryStorage } from '@ap/kernel/testing';
import { setFeatureApi } from '@ap/feature-bridge/feature-api';
import { createFeatureMenuHarness, LAZY_MOUNT_WAIT } from '@ap/feature-bridge/testing';
import { useHostSeam } from '@/lib/host/host-seam';
import { harnessMenus, homeStub, mountAt, warmPages } from '../test-support';

type Parts = Record<string, unknown>;
type DetailProps = { autoSelect?: boolean; renderDetail?: (parts: Parts) => ReactNode };
/** The two feature entries are doubles that record how the pages drive them; the value checks (the feature screens' real admin-search validators) are not mocked. */
const screenMock = vi.hoisted(() => ({
  requests: [] as DetailProps[],
  grants: [] as DetailProps[],
  requestClose: vi.fn(),
}));
const detail = (props: DetailProps) => props.renderDetail?.({ title: '상세 제목', body: <p>상세 본문</p>, requestClose: screenMock.requestClose });
vi.mock('@ap/feature-screens/operator-screens/permission-requests', () => ({
  PermissionRequestsScreen: (props: DetailProps) => {
    screenMock.requests.push(props);
    const seam = useHostSeam();
    return <div data-testid="requests" data-here={seam.useHere!()}>{detail(props)}</div>;
  },
}));
vi.mock('@ap/feature-screens/operator-screens/permission-grants', () => ({
  PermissionGrantsScreen: (props: DetailProps) => {
    screenMock.grants.push(props);
    const seam = useHostSeam();
    return <div data-testid="grants" data-here={seam.useHere!()}>{detail(props)}</div>;
  },
}));

const ROW = '99999999-9999-4999-8999-99999999999a';
const REQUESTS = '/operations/permission-request-review';
const GRANTS = '/operations/permission-grants';
const request = vi.fn();
const hereOf = (testId: string) => new URL(screen.getByTestId(testId).getAttribute('data-here')!, 'http://x');

beforeAll(warmPages, 60_000);
beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
  vi.stubGlobal('fetch', request);
  screenMock.requests.length = 0; screenMock.grants.length = 0; screenMock.requestClose.mockReset(); request.mockReset();
});
afterEach(() => { cleanup(); setFeatureApi(null); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });

describe('권한 without a feature API (mock preview)', () => {
  it.each([
    [REQUESTS, '권한 요청 검토', 'requests'],
    [GRANTS, '부여 목록', 'grants'],
  ])('%s shows 실서버 필요 and mounts no screen', async (path, title, testId) => {
    mountAt(path);
    await screen.findByRole('heading', { name: title }, LAZY_MOUNT_WAIT);
    expect(screen.getByRole('status').textContent).toContain('실서버 필요');
    expect(screen.queryByTestId(testId)).toBeNull();
  });
});

describe('a user with features:access but without console:access', () => {
  const { mountAt: mountPlain } = createFeatureMenuHarness({ manifests: harnessMenus, homeMenuId: homeStub.id, group: { id: 'access', label: { ko: '권한', en: 'Access' }, icon: KeyRound }, space: { id: 'operations', label: { ko: '운영 콘솔', en: 'Operations console' } } });
  beforeEach(() => { setFeatureApi({ basePath: '/api/features', onSessionLost: vi.fn() }); });

  it.each([[REQUESTS], [GRANTS]])('%s never mounts its screen and requests nothing', async path => {
    mountPlain(path);
    await new Promise(resolve => setTimeout(resolve, 300));
    for (const testId of ['requests', 'grants']) expect(screen.queryByTestId(testId)).toBeNull();
    expect(request).not.toHaveBeenCalled();
  });
});

describe('권한 through the feature bridge', () => {
  beforeEach(() => { setFeatureApi({ basePath: '/api/features', onSessionLost: vi.fn() }); });

  it.each([
    [REQUESTS, 'requests', '/admin/permissions/requests', 'approved', () => screenMock.requests],
    [GRANTS, 'grants', '/admin/permissions/grants', 'denies', () => screenMock.grants],
  ])('%s mounts the console with no auto-select, tab and focus from the address, and the detail in the shell slot', async (path, testId, screenPath, tab, calls) => {
    mountAt(`${path}?tab=${tab}&focus=${ROW}`);
    await screen.findByTestId(testId);
    const here = hereOf(testId);
    expect(here.pathname).toBe(screenPath);
    expect(Object.fromEntries(here.searchParams)).toEqual({ tab, selected: ROW });
    expect(calls().at(-1)!.autoSelect).toBe(false);
    expect(within(await screen.findByRole('complementary', { name: '상세 패널' })).getByText('상세 본문')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '상세 닫기' }));
    expect(screenMock.requestClose).toHaveBeenCalledOnce();
  });
});

describe('권한 with an invalid address value', () => {
  beforeEach(() => { setFeatureApi({ basePath: '/api/features', onSessionLost: vi.fn() }); });

  it.each([
    [REQUESTS, 'tab', 'x'],
    [REQUESTS, 'focus', 'not-a-uuid'],
    [GRANTS, 'tab', 'x'],
    [GRANTS, 'focus', 'not-a-uuid'],
  ])('%s rejects %s=%s, keeps the address and requests nothing', async (path, key, value) => {
    const search = `?${key}=${encodeURIComponent(value)}`;
    mountAt(`${path}${search}`);
    expect(await screen.findByText(`주소의 ${key} 값이 올바르지 않습니다`, undefined, LAZY_MOUNT_WAIT)).toBeTruthy();
    for (const testId of ['requests', 'grants']) expect(screen.queryByTestId(testId)).toBeNull();
    expect(screenMock.requests).toEqual([]);
    expect(screenMock.grants).toEqual([]);
    expect(request).not.toHaveBeenCalled();
    expect(window.location.search).toBe(search);
  });
});
