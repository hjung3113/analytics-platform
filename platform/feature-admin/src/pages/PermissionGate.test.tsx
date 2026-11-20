import { cleanup, screen, within } from '@testing-library/react';
import { afterEach, assert, beforeAll, expect, it, vi } from 'vitest';
import { memoryStorage } from '@ap/kernel/testing';
import { featureQueryClient, setFeatureApi } from '@ap/feature-bridge';
import { LAZY_MOUNT_WAIT } from '@ap/feature-bridge/testing';
import { mountAt, warmPages } from '../test-support';

beforeAll(warmPages, 60_000);
afterEach(() => {
  cleanup();
  featureQueryClient.clear();
  setFeatureApi(null);
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});

it('shows the permitted Home in the real Managed Systems Admin gate', async () => {
  vi.stubGlobal('localStorage', memoryStorage());
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const path = new URL(String(input), 'http://localhost').pathname;
    if (path === '/api/features/me/permissions/check') return Response.json({
      state: 'blocked_non_requestable', decision: { allow: false, reason: 'explicit_deny', requestable: null },
    });
    if (path === '/api/features/actors') return Response.json({ actors: [] });
    return Response.json({ code: 'test.unhandled_request', message: path }, { status: 500 });
  }));
  setFeatureApi({ basePath: '/api/features', onSessionLost: vi.fn() });
  mountAt('/flow/managed-systems');
  const heading = await screen.findByRole('heading', { name: '접근할 수 없습니다.', level: 2 }, LAZY_MOUNT_WAIT);
  const card = heading.closest<HTMLElement>('[data-request-status]');
  assert(card);
  const home = within(card).getByRole('link', { name: '홈으로' });
  expect(new URL(home.getAttribute('href') ?? '', window.location.origin).pathname).toBe('/flow/feature-home-stub');
  expect(home.closest('[aria-live], [role="status"]')).toBeNull();
  expect(within(card).queryByRole('button', { name: '권한 요청' })).toBeNull();
});
