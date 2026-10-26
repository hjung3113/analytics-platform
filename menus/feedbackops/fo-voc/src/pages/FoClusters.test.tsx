import { useState } from 'react';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryStorage } from '@ap/kernel/testing';
import { setFoApi } from '@ap/fo-bridge/fo-api';
import { clustersRoute } from '@ap/fo-bridge';
import { useHostSeam } from '@/lib/host/host-seam';
import { manifests } from '../index';
import { mountAt, warmPages } from '../test-support';

const fo = vi.hoisted(() => ({
  render: undefined as undefined | ((id: string, options: { onClose: () => void }) => unknown),
  onCreated: undefined as undefined | ((id: string) => void),
  detailArgs: [] as { clusterId: string }[],
  mounts: 0,
  screens: 0,
}));
vi.mock('@fops/frontend/operator-screens/voc-clusters', async importOriginal => ({
  // The strict value check is FeedbackOps' real cluster schema, not a double.
  ...(await importOriginal<typeof import('@fops/frontend/operator-screens/voc-clusters')>()),
  ClusterListScreen: (props: { renderDetail: typeof fo.render; onCreated: (id: string) => void }) => {
    fo.screens += 1;
    fo.render = props.renderDetail;
    fo.onCreated = props.onCreated;
    const seam = useHostSeam();
    const here = seam.useHere!();
    const go = seam.useNavigate!();
    return <div data-testid="clusters" data-here={here} data-can-inbox={String(seam.canLink(`/vocs?view=inbox&selected=${VOC}`))} data-can-findings={String(seam.canLink('/findings/x'))}>
      <button type="button" onClick={() => go(`/voc-clusters?selected=${CLUSTER_Z}`)}>선택</button>
      <button type="button" onClick={() => go(`/voc-clusters?selected=${CLUSTER_A}`, { replace: true })}>첫 행</button>
    </div>;
  },
  useClusterDetailParts: ({ clusterId }: { clusterId: string }) => {
    // Per-instance state: a new instance (remount) takes the next number.
    const [instance] = useState(() => ++fo.mounts);
    fo.detailArgs.push({ clusterId });
    return { state: 'ready', title: `CL ${clusterId}`, body: <p data-instance={instance}>상세 본문 {clusterId}</p> };
  },
}));

const SYSTEM = '33333333-3333-4333-8333-333333333333';
const CLUSTER_A = 'c1821f1b-0000-4000-8000-00000000000a';
const CLUSTER_Z = 'c1821f1b-0000-4000-8000-00000000000f';
const VOC = 'a1821f1b-0000-4000-8000-00000000000a';
const request = vi.fn();

beforeAll(warmPages, 60_000);
beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
  vi.stubGlobal('fetch', request);
  request.mockReset();
  fo.detailArgs.length = 0;
  fo.mounts = 0;
  fo.screens = 0;
});
afterEach(() => { cleanup(); setFoApi(null); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });

describe('Clusters manifest', () => {
  it('declares the route table page keys and the permission of the space', () => {
    const clusters = manifests.find(menu => menu.id === 'fo-clusters')!;
    expect([...clusters.pageKeys!].sort()).toEqual([...clustersRoute.pageKeys, 'returnTo'].sort());
    expect(clusters).toMatchObject({ path: '/feedbackops/clusters', permission: 'feedbackops:access', requiresScope: false, label: { ko: 'Clusters', en: 'Clusters' } });
  });
});

describe('Clusters without a FeedbackOps API (mock preview)', () => {
  it('shows 실서버 필요 and mounts no screen', async () => {
    mountAt('/feedbackops/clusters');
    expect(await screen.findByRole('heading', { name: 'Clusters' }, { timeout: 3000 })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain('실서버 필요');
    expect(screen.queryByTestId('clusters')).toBeNull();
  });
});

describe('Clusters through the FeedbackOps bridge', () => {
  beforeEach(() => { setFoApi({ basePath: '/api/fo', onSessionLost: vi.fn() }); });

  it('renders the list with the page read as the cluster FO path; VOC member links are live, Finding links are not', async () => {
    mountAt(`/feedbackops/clusters?managedSystem=${SYSTEM}`);
    const clusters = await screen.findByTestId('clusters');
    const here = new URL(clusters.getAttribute('data-here')!, 'http://x');
    expect(here.pathname).toBe('/voc-clusters');
    expect(Object.fromEntries(here.searchParams)).toEqual({ managedSystem: SYSTEM });
    expect(clusters.getAttribute('data-can-inbox')).toBe('true');
    expect(clusters.getAttribute('data-can-findings')).toBe('false');
  });

  it('moves a screen navigation through the platform URL (selected becomes focus)', async () => {
    mountAt(`/feedbackops/clusters?managedSystem=${SYSTEM}`);
    fireEvent.click(await screen.findByRole('button', { name: '선택' }));
    await waitFor(() => expect(window.location.search).toContain(`focus=${CLUSTER_Z}`));
    expect(new URLSearchParams(window.location.search).get('managedSystem')).toBe(SYSTEM);
  });

  it('opens the drawer for the first-row default by replace, without a new history entry', async () => {
    mountAt('/feedbackops/clusters');
    const before = window.history.length;
    fireEvent.click(await screen.findByRole('button', { name: '첫 행' }));
    const aside = await screen.findByRole('complementary', { name: '상세 패널' });
    expect(await within(aside).findByText(`상세 본문 ${CLUSTER_A}`)).toBeTruthy();
    expect(window.history.length).toBe(before);
  });

  it('returns no detail node to FO (its ListShell would draw it outside the FeedbackOps providers)', async () => {
    mountAt('/feedbackops/clusters');
    await screen.findByTestId('clusters');
    expect(fo.render!(CLUSTER_A, { onClose: vi.fn() })).toBeUndefined();
  });

  it('draws no drawer without focus', async () => {
    mountAt('/feedbackops/clusters');
    await screen.findByTestId('clusters');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(fo.detailArgs).toEqual([]);
  });

  it('opens the cluster detail in the shell detail slot on focus', async () => {
    mountAt(`/feedbackops/clusters?focus=${CLUSTER_A}`);
    const aside = await screen.findByRole('complementary', { name: '상세 패널' });
    const dialog = await within(aside).findByRole('dialog');
    expect(within(dialog).getByText(`상세 본문 ${CLUSTER_A}`)).toBeTruthy();
    // One tab draws no tab row (06 §13, #886 UX-8): the panel's own tabs are the only row.
    expect(within(dialog).queryByRole('tablist', { name: '상세 탭' })).toBeNull();
    expect(fo.detailArgs.at(-1)).toEqual({ clusterId: CLUSTER_A });
  });

  it('closing the drawer removes focus and keeps the rest of the page', async () => {
    mountAt(`/feedbackops/clusters?focus=${CLUSTER_A}&managedSystem=${SYSTEM}`);
    fireEvent.click(await screen.findByRole('button', { name: '상세 닫기' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const params = new URLSearchParams(window.location.search);
    expect(params.has('focus')).toBe(false);
    expect(params.get('managedSystem')).toBe(SYSTEM);
  });

  it('remounts the detail for another cluster', async () => {
    mountAt(`/feedbackops/clusters?focus=${CLUSTER_A}`);
    expect((await screen.findByText(`상세 본문 ${CLUSTER_A}`)).getAttribute('data-instance')).toBe('1');
    fireEvent.click(screen.getByRole('button', { name: '선택' }));
    expect((await screen.findByText(`상세 본문 ${CLUSTER_Z}`)).getAttribute('data-instance')).toBe('2');
    expect(screen.queryByText(`상세 본문 ${CLUSTER_A}`)).toBeNull();
  });

  it('opens the new cluster after a create (onCreated sets focus)', async () => {
    mountAt('/feedbackops/clusters');
    await screen.findByTestId('clusters');
    fo.onCreated!(CLUSTER_Z);
    await waitFor(() => expect(window.location.search).toContain(`focus=${CLUSTER_Z}`));
    expect(await screen.findByText(`상세 본문 ${CLUSTER_Z}`)).toBeTruthy();
  });

  it.each([['focus', 'abc'], ['managedSystem', 'not-a-uuid'], ['focus', ''], ['managedSystem', '']])('rejects an invalid %s, keeps the address and requests nothing', async (key, value) => {
    const search = `?${key}=${encodeURIComponent(value)}`;
    mountAt(`/feedbackops/clusters${search}`);
    expect(await screen.findByText(`주소의 ${key} 값이 올바르지 않습니다`, undefined, { timeout: 3000 })).toBeTruthy();
    expect(screen.queryByTestId('clusters')).toBeNull();
    expect(fo.screens).toBe(0);
    expect(fo.detailArgs).toEqual([]);
    expect(request).not.toHaveBeenCalled();
    expect(window.location.search).toBe(search);
  });

  it('accepts managedSystem=all like FeedbackOps does (no scope)', async () => {
    mountAt('/feedbackops/clusters?managedSystem=all');
    expect(await screen.findByTestId('clusters')).toBeTruthy();
  });
});
