import type { ReactNode } from 'react';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryStorage } from '@ap/kernel/testing';
import { setFeatureApi } from '@ap/feature-bridge/feature-api';
import { LAZY_MOUNT_WAIT } from '@ap/feature-bridge/testing';
import { useHostSeam } from '@/lib/host/host-seam';
import { mountAt, warmPages } from '../test-support';

type Parts = Record<string, unknown>;
/** The five feature entries are doubles that record how the pages drive them; the value checks (the feature screens' real integration-search schemas) are not mocked. */
const screenMock = vi.hoisted(() => ({
  requestClose: vi.fn(),
  dashboard: [] as { renderDetail: (parts: Parts) => ReactNode; renderRequestAccess?: unknown }[],
  evidence: [] as { renderDetail: (parts: Parts) => ReactNode }[],
  coverage: 0,
  links: 0,
  renderRecoveryRequestAccess: vi.fn(),
}));
vi.mock('@ap/feature-screens/operator-screens/integration-dashboard', () => ({
  renderRecoveryRequestAccess: screenMock.renderRecoveryRequestAccess,
  IntegrationDashboardScreen: (props: { renderDetail: (parts: Parts) => ReactNode; renderRequestAccess?: unknown }) => {
    screenMock.dashboard.push(props);
    const seam = useHostSeam();
    const selected = seam.useSearch!().selected;
    return <div data-testid="dashboard" data-selected={selected ?? ''} data-here={seam.useHere!()}>
      {selected !== undefined && props.renderDetail({ title: `복구 ${selected}`, body: <p>복구 본문 {selected}</p>, requestClose: screenMock.requestClose, itemKey: selected })}
    </div>;
  },
}));
vi.mock('@ap/feature-screens/operator-screens/evidence', () => ({
  EvidenceScreen: (props: { renderDetail: (parts: Parts) => ReactNode }) => {
    screenMock.evidence.push(props);
    const seam = useHostSeam();
    const selected = seam.useSearch!().selected;
    return <div data-testid="evidence" data-selected={selected ?? ''} data-here={seam.useHere!()}>
      {selected !== undefined && props.renderDetail({ title: `근거 ${selected}`, body: <p>근거 본문 {selected}</p>, requestClose: screenMock.requestClose })}
    </div>;
  },
}));
vi.mock('@ap/feature-screens/operator-screens/coverage', () => ({
  CoverageScreen: () => { screenMock.coverage += 1; const seam = useHostSeam(); return <div data-testid="coverage" data-here={seam.useHere!()} />; },
}));
vi.mock('@ap/feature-screens/operator-screens/entity-links', () => ({
  LinksScreen: () => { screenMock.links += 1; const seam = useHostSeam(); return <div data-testid="links" data-here={seam.useHere!()} />; },
}));

const SYSTEM = '33333333-3333-4333-8333-333333333333';
const ITEM = `r1_${'a'.repeat(23)}`;
const EVIDENCE = '99999999-9999-4999-8999-999999999999';
const request = vi.fn();
const hereOf = (testId: string) => new URL(screen.getByTestId(testId).getAttribute('data-here')!, 'http://x');

beforeAll(warmPages, 60_000);
beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
  vi.stubGlobal('fetch', request);
  screenMock.dashboard.length = 0; screenMock.evidence.length = 0; screenMock.coverage = 0; screenMock.links = 0; screenMock.requestClose.mockReset(); request.mockReset();
});
afterEach(() => { cleanup(); setFeatureApi(null); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });

describe.each([
  ['/operations/integration', '연동 액션 대시보드', 'dashboard'],
  ['/operations/evidence', 'Evidence', 'evidence'],
  ['/operations/coverage', '커버리지', 'coverage'],
  ['/operations/entity-links', '엔티티 링크', 'links'],
])('%s without a feature API (mock preview)', (path, title, testId) => {
  it('shows 실서버 필요 and mounts no screen', async () => {
    mountAt(path);
    await screen.findByRole('heading', { name: title }, LAZY_MOUNT_WAIT);
    expect(screen.getByRole('status').textContent).toContain('실서버 필요');
    expect(screen.queryByTestId(testId)).toBeNull();
  });
});

describe('연동 액션 대시보드 through the feature bridge', () => {
  beforeEach(() => { setFeatureApi({ basePath: '/api/features', onSessionLost: vi.fn() }); });

  it('mounts the screen reading the page as the screen /integration path and passes the standalone request-access renderer', async () => {
    mountAt(`/operations/integration?category=unassigned-voc&history=true&managedSystem=${SYSTEM}`);
    await screen.findByTestId('dashboard');
    const here = hereOf('dashboard');
    expect(here.pathname).toBe('/integration');
    expect(Object.fromEntries(here.searchParams)).toEqual({ category: 'unassigned-voc', history: 'true', managedSystem: SYSTEM });
    expect(screenMock.dashboard.at(-1)!.renderRequestAccess).toBe(screenMock.renderRecoveryRequestAccess);
  });

  it('renders the screen\'s renderDetail(parts) result as the drawer in place, and its close is requestClose', async () => {
    mountAt(`/operations/integration?focus=${ITEM}`);
    expect((await screen.findByTestId('dashboard')).getAttribute('data-selected')).toBe(ITEM);
    const dialog = await within(await screen.findByRole('complementary', { name: '상세 패널' })).findByRole('dialog');
    expect(within(dialog).getByText(`복구 본문 ${ITEM}`)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: '상세 닫기' }));
    expect(screenMock.requestClose).toHaveBeenCalledOnce();
    // The drawer never writes focus itself: the screen owns the close.
    expect(new URLSearchParams(window.location.search).get('focus')).toBe(ITEM);
  });
});

describe('Evidence through the feature bridge', () => {
  beforeEach(() => { setFeatureApi({ basePath: '/api/features', onSessionLost: vi.fn() }); });

  it('mounts the screen reading the page as the screen /integration/evidence path', async () => {
    mountAt(`/operations/evidence?source=voc&q=pump&managedSystem=${SYSTEM}`);
    await screen.findByTestId('evidence');
    const here = hereOf('evidence');
    expect(here.pathname).toBe('/integration/evidence');
    expect(Object.fromEntries(here.searchParams)).toEqual({ source: 'voc', q: 'pump', managedSystem: SYSTEM });
  });

  it('renders the screen\'s renderDetail(parts) result as the drawer in place, and its close is requestClose', async () => {
    mountAt(`/operations/evidence?focus=${EVIDENCE}`);
    expect((await screen.findByTestId('evidence')).getAttribute('data-selected')).toBe(EVIDENCE);
    const dialog = await within(await screen.findByRole('complementary', { name: '상세 패널' })).findByRole('dialog');
    expect(within(dialog).getByText(`근거 본문 ${EVIDENCE}`)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: '상세 닫기' }));
    expect(screenMock.requestClose).toHaveBeenCalledOnce();
    expect(new URLSearchParams(window.location.search).get('focus')).toBe(EVIDENCE);
  });
});

describe('커버리지 and 엔티티 링크 through the feature bridge', () => {
  beforeEach(() => { setFeatureApi({ basePath: '/api/features', onSessionLost: vi.fn() }); });

  it('mounts Coverage reading view and area as the screen /integration/coverage path, with no drawer', async () => {
    mountAt(`/operations/coverage?view=areas&managedSystem=${SYSTEM}`);
    await screen.findByTestId('coverage');
    const here = hereOf('coverage');
    expect(here.pathname).toBe('/integration/coverage');
    expect(Object.fromEntries(here.searchParams)).toEqual({ view: 'areas', managedSystem: SYSTEM });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('mounts Links reading status and type as the screen /integration/links path, with no drawer', async () => {
    mountAt(`/operations/entity-links?status=stale&type=related_to&managedSystem=${SYSTEM}`);
    await screen.findByTestId('links');
    const here = hereOf('links');
    expect(here.pathname).toBe('/integration/links');
    expect(Object.fromEntries(here.searchParams)).toEqual({ status: 'stale', type: 'related_to', managedSystem: SYSTEM });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('mounts Links for any managedSystem string (its own schema is a plain string): no RejectedPage', async () => {
    mountAt('/operations/entity-links?managedSystem=x');
    await screen.findByTestId('links');
    expect(screen.queryByText('주소의 managedSystem 값이 올바르지 않습니다')).toBeNull();
  });
});

const REJECTED = [
  ['/operations/integration', 'presentation', 'x', 'dashboard'],
  ['/operations/integration', 'managedSystem', 'x', 'dashboard'],
  ['/operations/evidence', 'source', 'x', 'evidence'],
  ['/operations/evidence', 'managedSystem', 'x', 'evidence'],
  ['/operations/coverage', 'view', 'x', 'coverage'],
  ['/operations/coverage', 'managedSystem', 'x', 'coverage'],
  ['/operations/entity-links', 'status', 'x', 'links'],
] as const;

describe('연동 pages with an invalid address value', () => {
  beforeEach(() => { setFeatureApi({ basePath: '/api/features', onSessionLost: vi.fn() }); });

  it.each(REJECTED)('%s rejects %s=%s, keeps the address and mounts no screen', async (path, key, value, testId) => {
    const search = `?${key}=${encodeURIComponent(value)}`;
    mountAt(`${path}${search}`);
    expect(await screen.findByText(`주소의 ${key} 값이 올바르지 않습니다`, undefined, LAZY_MOUNT_WAIT)).toBeTruthy();
    expect(screen.queryByTestId(testId)).toBeNull();
    expect(screenMock.dashboard).toEqual([]);
    expect(screenMock.evidence).toEqual([]);
    expect(screenMock.coverage + screenMock.links).toBe(0);
    expect(request).not.toHaveBeenCalled();
    expect(window.location.search).toBe(search);
  });
});
