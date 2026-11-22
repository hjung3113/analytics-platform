import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { ListChecks } from 'lucide-react';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { groupId } from '@ap/contracts';
import { memoryStorage, noContext } from '@ap/kernel/testing';
import { setFeatureApi } from '@ap/feature-bridge/feature-api';
import { createFeatureMenuHarness, LAZY_MOUNT_WAIT } from '@ap/feature-bridge/testing';
import { manifests } from '../../index';
import { warmPages } from '../../test-support';

const label = { ko: '권한 요청', en: 'Access requests' };
const { mountAt } = createFeatureMenuHarness({
  manifests: [...manifests, {
    id: 'permission-requests', path: '/permission-requests', group: groupId('activity'),
    label, icon: ListChecks, primary: true, description: label, permission: 'platform:view',
    requiresScope: false, pageType: 'management', context: noContext,
    features: { export: false, savedView: false, annotate: false, compare: false },
    pageKeys: ['capability', 'managedSystem', 'returnTo'],
  }],
  homeMenuId: 'findings',
  group: { id: 'findings', label: { ko: 'Finding', en: 'Finding' }, icon: ListChecks },
  globalGroups: [{ id: 'activity', label, icon: ListChecks }],
});

beforeAll(warmPages);
beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
  setFeatureApi({ basePath: '/api/features', onSessionLost: vi.fn() });
});
afterEach(() => {
  cleanup();
  setFeatureApi(null);
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});

it('keeps focus on the hosted request card while history is read', async () => {
  let resolveRead!: () => void;
  const history = new Promise<void>(resolve => { resolveRead = resolve; });
  const fetch = vi.fn(async (input: RequestInfo | URL) => {
    const { pathname } = new URL(String(input), window.location.origin);
    if (pathname.endsWith('/permission-requests/mine')) {
      await history;
      return Response.json({ requests: [] });
    }
    if (pathname.endsWith('/findings')) return Response.json({
      code: 'permission.denied', message: 'denied', requestable_permission: {
        permission: 'finding.read', managed_system_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      },
    }, { status: 403 });
    return Response.json({ items: [], actors: [] });
  });
  vi.stubGlobal('fetch', fetch);
  mountAt('/flow/findings?v=1');

  const busy = await screen.findByRole('button', { name: '권한 요청' }, LAZY_MOUNT_WAIT);
  await waitFor(() => expect(fetch.mock.calls.some(([url]) => String(url).includes('/permission-requests/mine?status=all'))).toBe(true));
  expect(busy.getAttribute('aria-busy')).toBe('true');
  expect(screen.getByText('요청 상태를 확인하는 중입니다.')).toBeTruthy();
  busy.focus();
  expect(fireEvent.click(busy)).toBe(false);
  resolveRead();

  const request = await screen.findByRole('link', { name: '권한 요청' });
  expect(document.activeElement).toBe(request);
  expect(request.getAttribute('href')).toContain('capability=finding.read');
  expect(request.getAttribute('href')).toContain('managedSystem=bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
});
