import { Inbox } from 'lucide-react';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, assert, beforeAll, describe, expect, it, vi } from 'vitest';
import { carrySetId, groupId, spaceId, type Permission } from '@ap/contracts';
import { createRegistry } from '@ap/kernel';
import { memoryStorage } from '@ap/kernel/testing';
import { featureQueryClient, setFeatureApi } from '@ap/feature-bridge';
import { LAZY_MOUNT_WAIT, settleFetch } from '@ap/feature-bridge/testing';
import { manifests } from '../index';
import { ME } from '../retained-voc/test-support';
import { mountAt, warmPages } from '../test-support';

const SYSTEM = '10000000-0000-4000-8000-000000000001';
const AT = '2026-11-20T00:00:00.000Z';
const ROW = {
  id: '10000000-0000-4000-8000-000000000002', requested_capability: 'voc.read',
  requested_managed_system_id: SYSTEM, requested_object_type: null, requested_object_id: null,
  source_object_type: null, source_object_id: null, source_action_id: null,
  requested_expiration: null, return_route_intent: null, revision: 1,
  status: 'pending', reason: 'VOC 조회', created_at: AT, updated_at: AT,
};

beforeAll(warmPages, 60_000);
afterEach(() => {
  cleanup();
  featureQueryClient.clear();
  setFeatureApi(null);
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});

function mountGate(route: 'inbox' | 'triage', homePermission: Permission, spaceHomePermission: Permission, { zeroReadScope = false, namedEligibility }: { zeroReadScope?: boolean; namedEligibility?: boolean } = {}) {
  const base = manifests[0];
  assert(base && base.module === undefined);
  const global = groupId('global');
  const flow = spaceId('flow');
  const registry = createRegistry({
    platformHomeMenuId: 'home',
    spaces: [{ id: flow, label: base.label, description: base.label, homeMenuId: 'flow-home' }],
    groups: [
      { id: base.group, space: flow, icon: Inbox, label: base.label },
      { id: global, space: null, icon: Inbox, label: base.label },
    ],
    carrySets: [{ id: carrySetId('features'), pageKeys: ['managedSystem', 'returnTo'] }],
    menus: [
      ...manifests,
      { ...base, id: 'flow-home', primary: false, path: '/flow/flow-home', permission: spaceHomePermission },
      { ...base, id: 'home', group: global, path: '/', permission: homePermission },
      { ...base, id: 'permission-requests', primary: false, group: global, path: '/permission-requests', permission: 'platform:view' },
    ],
  });
  vi.stubGlobal('localStorage', memoryStorage());
  const request = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://localhost');
    const path = url.pathname.replace('/api/features', '');
    if (path === '/vocs') return Response.json({
      code: 'permission.denied', message: 'denied',
      requestable_permission: { permission: 'voc.read', managed_system_id: zeroReadScope ? null : SYSTEM, reason_required: true },
    }, { status: 403 });
    if (path === '/me') return Response.json(zeroReadScope ? { ...ME, actor: { ...ME.actor, role_level: 'developer' } } : ME);
    if (path === '/me/permissions/check') {
      if (route === 'inbox') {
        expect(url.searchParams.get('capability')).toBe('voc.read');
        expect(url.searchParams.get('managed_system_id')).toBe(SYSTEM);
        const eligible = namedEligibility ?? true;
        return Response.json({
          state: eligible ? 'request_access' : 'blocked_non_requestable',
          decision: { allow: false, reason: 'no_grant', requestable: eligible ? [{ workspace_id: ME.workspace_id }] : null },
        });
      }
      return Response.json({ state: 'approved', decision: { allow: true } });
    }
    if (path === '/me/permissions/scope' && zeroReadScope) return Response.json({ scope: { kind: 'scoped', managed_system_ids: [] } });
    if (path === '/me/permissions/scope') return Response.json({ scope: { kind: 'all' } });
    if (path === '/nav/counts') return Response.json({ counts: {} });
    if (path === '/managed-systems') return Response.json({ items: [], total: 0 });
    if (path === '/analytics-areas') return Response.json({ items: [] });
    if (path === '/permission-requests/mine') return Response.json({ requests: zeroReadScope || namedEligibility !== undefined ? [] : [ROW] });
    return Response.json({ code: 'test.unhandled_request', message: path }, { status: 500 });
  });
  vi.stubGlobal('fetch', request);
  setFeatureApi({ basePath: '/api/features', onSessionLost: vi.fn() });
  mountAt(`/flow/${route}?managedSystem=${SYSTEM}`, { registry });
  return request;
}

describe('permission cards in the live feature host', () => {
  it('opens the exact request for the confirmed System when the Developer has zero read scope', async () => {
    mountGate('inbox', 'platform:view', 'console:access', { zeroReadScope: true });
    const action = await screen.findByText('권한 요청', { selector: 'a, button' }, LAZY_MOUNT_WAIT);
    expect(action.tagName).toBe('BUTTON');
    fireEvent.click(action);
    const request = within(await screen.findByRole('dialog', { name: '권한 요청' }));
    expect(request.getByText(SYSTEM)).toBeTruthy();
    expect(request.queryByText('전체')).toBeNull();
  });

  it.each([false, true])('uses point-check eligibility %s for a System named by the Inbox denial', async (eligible) => {
    const request = mountGate('inbox', 'platform:view', 'console:access', { namedEligibility: eligible });
    await screen.findByRole('heading', { name: 'VOC 처리함', level: 3 }, LAZY_MOUNT_WAIT);
    await settleFetch(request, '/vocs?');
    if (eligible) {
      const link = await screen.findByRole('link', { name: '권한 요청' });
      expect(new URL(link.getAttribute('href') ?? '', window.location.origin).pathname).toBe('/permission-requests');
    } else {
      expect(screen.queryByRole('link', { name: '권한 요청' })).toBeNull();
      expect(screen.queryByRole('button', { name: '권한 요청' })).toBeNull();
    }
    expect(request.mock.calls.filter(([input]) => String(input).includes('/me/permissions/check'))).toHaveLength(1);
  });

  it.each([
    ['inbox', 'platform:view', 'console:access', '/'],
    ['inbox', 'console:access', 'console:access', null],
    ['triage', 'console:access', 'features:access', '/flow/flow-home'],
  ] as const)('%s resolves Home under platform %s and space %s', async (route, home, spaceHome, expectedPath) => {
    mountGate(route, home, spaceHome);
    const status = await screen.findByRole('link', { name: '내 권한 요청 보기' }, LAZY_MOUNT_WAIT);
    expect(new URL(status.getAttribute('href') ?? '', window.location.origin).pathname).toBe('/permission-requests');
    const card = status.closest<HTMLElement>('[data-request-status]');
    assert(card);
    const exit = within(card).queryByRole('link', { name: '홈으로' });
    if (expectedPath !== null) {
      assert(exit);
      expect(new URL(exit.getAttribute('href') ?? '', window.location.origin).pathname).toBe(expectedPath);
      expect(Array.from(status.parentElement?.children ?? [])).toEqual([status, exit]);
    } else {
      expect(exit).toBeNull();
    }
  });
});
