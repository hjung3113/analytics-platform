// #1291 B2 — the real 권한 부여 screen through the bridge: its one grant button is drawn in the platform page head, once, and stays behind the menu gate.
import { cleanup, screen } from '@testing-library/react';
import { KeyRound } from 'lucide-react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryStorage } from '@ap/kernel/testing';
import { setFeatureApi } from '@ap/feature-bridge/feature-api';
import { createFeatureMenuHarness, LAZY_MOUNT_WAIT } from '@ap/feature-bridge/testing';
import { harnessMenus, homeStub, mountAt, warmPages } from '../test-support';

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

/** Controlled server: the capability check approves; every list is empty. */
function installFetch() {
  const request = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.includes('/me/permissions/check')) return json({ state: 'approved', decision: { allow: true, via: 'role', requestable: null } });
    if (url.includes('/actors/resolve')) return json({ actors: [], teams: [] });
    if (url.includes('/permissions/grants')) return json({ grants: [], items: [], count: 0, total: 0 });
    if (url.includes('/permissions/requests')) return json({ requests: [], count: 0 });
    if (url.includes('/default-diagnostics')) return json({ items: [] });
    if (url.includes('/default-candidates')) return json({ owners: [], reviewers: [] });
    return json({});
  });
  vi.stubGlobal('fetch', request);
  return request;
}

const GRANTS = '/operations/permission-grants';

beforeAll(warmPages, 60_000);
beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
  setFeatureApi({ basePath: '/api/features', onSessionLost: vi.fn() });
});
afterEach(() => { cleanup(); setFeatureApi(null); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });

describe('권한 부여 through the bridge', () => {
  it('is drawn once, in the page head, and not in the screen body', async () => {
    installFetch();
    const { container } = mountAt(GRANTS);
    const button = await screen.findByRole('button', { name: '권한 부여' }, LAZY_MOUNT_WAIT);
    expect(container.querySelector('header [data-feature-primary-action]')?.contains(button)).toBe(true);
    expect(screen.getAllByRole('button', { name: '권한 부여' })).toHaveLength(1);
  });

  it('is absent for a user without console:access (the menu gate refuses the page)', async () => {
    const request = installFetch();
    const { mountAt: mountPlain } = createFeatureMenuHarness({ manifests: harnessMenus, homeMenuId: homeStub.id, group: { id: 'access', label: { ko: '권한', en: 'Access' }, icon: KeyRound }, space: { id: 'operations', label: { ko: '운영 콘솔', en: 'Operations console' } } });
    const { container } = mountPlain(GRANTS);
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(screen.queryByRole('button', { name: '권한 부여' })).toBeNull();
    expect(container.querySelector('[data-feature-primary-action]')).toBeNull();
    expect(request).not.toHaveBeenCalled();
  });
});
