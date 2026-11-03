// #1291 B2 — the real Cluster list through the bridge: Cluster 생성 is drawn in the platform page head, once, for admin/developer only. (수신함 VOC 생성: see the report, U1 — the platform has no create destination for it.)
import { cleanup, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryStorage } from '@ap/kernel/testing';
import { setFeatureApi } from '@ap/feature-bridge/feature-api';
import { expectHeadPrimaryAction, LAZY_MOUNT_WAIT, settleFetch } from '@ap/feature-bridge/testing';
import { mountAt } from '../test-support';

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
const CLUSTERS = '/flow/clusters';

function installFetch(role: string) {
  const request = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.includes('/api/features/me')) return json({ actor: { id: 'a1', external_id: 'a1', email: 'a@x', display_name: 'Admin', role_level: role }, workspace_id: 'w1' });
    return json({ items: [], total: 0 });
  });
  vi.stubGlobal('fetch', request);
  return request;
}

beforeAll(() => import('./FeatureClusters'), 60_000);
beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
  setFeatureApi({ basePath: '/api/features', onSessionLost: vi.fn() });
});
afterEach(() => { cleanup(); setFeatureApi(null); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });

describe('Cluster 생성 through the bridge', () => {
  it('is drawn once in the page head, not in the list toolbar', async () => {
    installFetch('admin');
    const { container } = mountAt(CLUSTERS);
    await expectHeadPrimaryAction({ container, locate: { testId: 'cluster-create-button' }, drawn: true });
  });

  it('is absent for a viewer; the permission hint stays in the list toolbar', async () => {
    const request = installFetch('viewer');
    const { container } = mountAt(CLUSTERS);
    await screen.findByTestId('cluster-create-hint', undefined, LAZY_MOUNT_WAIT);
    await expectHeadPrimaryAction({ container, locate: { testId: 'cluster-create-button' }, drawn: false, settled: () => settleFetch(request, '/api/features/me') });
  });
});
