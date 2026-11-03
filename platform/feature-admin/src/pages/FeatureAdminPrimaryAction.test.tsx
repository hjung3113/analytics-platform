// #1291 B2 — the real 흐름 설정 registry screens through the bridge: their one create/register button is drawn in the platform page head, once, and stays gated.
import { cleanup, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryStorage } from '@ap/kernel/testing';
import { setFeatureApi } from '@ap/feature-bridge/feature-api';
import { LAZY_MOUNT_WAIT } from '@ap/feature-bridge/testing';
import { mountAt, warmPages } from '../test-support';

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
  ['Managed System 등록', '/flow/managed-systems', '시스템'],
  ['Analytics Area 생성', '/flow/analytics-areas', '분석 영역'],
] as const;

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
