// #1291 B2 — the real 관리자 registry screens through the bridge: their one create/register button is drawn in the platform page head, once, and stays gated.
import { cleanup, screen, waitFor } from '@testing-library/react';
import { UserCog } from 'lucide-react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryStorage } from '@ap/kernel/testing';
import { setFeatureApi } from '@ap/feature-bridge/feature-api';
import { createFeatureMenuHarness, LAZY_MOUNT_WAIT } from '@ap/feature-bridge/testing';
import { harnessMenus, homeStub, mountAt, warmPages } from '../test-support';

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

/** Controlled server: the capability check answers `state`; every list is empty. */
function installFetch(state: 'approved' | 'blocked_non_requestable') {
  const request = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.includes('/me/permissions/check')) {
      return json({ state, decision: { allow: state === 'approved', ...(state === 'approved' ? { via: 'role' } : { reason: 'no_grant' }), requestable: null } });
    }
    if (url.includes('/actors/resolve')) return json({ actors: [], teams: [] });
    if (url.includes('/permissions/grants')) return json({ grants: [], items: [], count: 0, total: 0 });
    if (url.includes('/permissions/requests')) return json({ requests: [], count: 0 });
    if (url.includes('/default-diagnostics')) return json({ items: [] });
    if (url.includes('/default-candidates')) return json({ owners: [], reviewers: [] });
    if (url.includes('/managed-systems') || url.includes('/analytics-areas')) return json({ items: [], total: 0 });
    return json({});
  });
  vi.stubGlobal('fetch', request);
  return request;
}

const CASES = [
  ['Managed System 등록', '/operations/managed-systems', 'Managed System'],
  ['Analytics Area 생성', '/operations/analytics-areas', 'Analytics Area'],
] as const;
const GRANTS = '/operations/permission-grants';

beforeAll(warmPages, 60_000);
beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
  setFeatureApi({ basePath: '/api/features', onSessionLost: vi.fn() });
});
afterEach(() => { cleanup(); setFeatureApi(null); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });

describe.each(CASES)('%s through the bridge', (label, path, title) => {
  it('is drawn once, in the page head, and not in the screen body', async () => {
    installFetch('approved');
    const { container } = mountAt(path);
    const button = await screen.findByRole('button', { name: label }, LAZY_MOUNT_WAIT);
    expect(container.querySelector('header [data-feature-primary-action]')?.contains(button)).toBe(true);
    expect(screen.getAllByRole('button', { name: label })).toHaveLength(1);
  });

  it('is absent for a user the capability check refuses', async () => {
    const request = installFetch('blocked_non_requestable');
    const { container } = mountAt(path);
    await screen.findByRole('heading', { name: title }, LAZY_MOUNT_WAIT);
    await waitFor(() => expect(request.mock.calls.some(([input]) => String(input).includes('/me/permissions/check'))).toBe(true));
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(screen.queryByRole('button', { name: label })).toBeNull();
    expect(container.querySelector('header [data-feature-primary-action] button')).toBeNull();
  });
});

describe('권한 부여 through the bridge', () => {
  it('is drawn once, in the page head, and not in the screen body', async () => {
    installFetch('approved');
    const { container } = mountAt(GRANTS);
    const button = await screen.findByRole('button', { name: '권한 부여' }, LAZY_MOUNT_WAIT);
    expect(container.querySelector('header [data-feature-primary-action]')?.contains(button)).toBe(true);
    expect(screen.getAllByRole('button', { name: '권한 부여' })).toHaveLength(1);
  });

  it('is absent for a user without console:access (the menu gate refuses the page)', async () => {
    const request = installFetch('approved');
    const { mountAt: mountPlain } = createFeatureMenuHarness({ manifests: harnessMenus, homeMenuId: homeStub.id, group: { id: 'featureAdmin', label: { ko: '관리자', en: 'Admin' }, icon: UserCog } });
    const { container } = mountPlain(GRANTS);
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(screen.queryByRole('button', { name: '권한 부여' })).toBeNull();
    expect(container.querySelector('[data-feature-primary-action]')).toBeNull();
    expect(request).not.toHaveBeenCalled();
  });
});
