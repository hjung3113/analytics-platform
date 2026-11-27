import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, expect, it, vi } from 'vitest';
import { PlatformPage, QueryView } from '@ap/components';
import { defineEndpoint, groupId, spaceId } from '@ap/contracts';
import { createRegistry, I18nProvider, PlatformProvider, useMenuQuery } from '@ap/kernel';
import { memoryStorage, noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { accessRequestSlot } from '../access-request-slot';
import { setFeatureApi } from '../feature-api';
import { featureQueryClient } from '../feature/session';
import { LAZY_MOUNT_WAIT } from '../testing';

const SITE = 'SITE-B';
const ROOM = 'RB4';
const REQUEST_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1';
const context = { ...noContext, roomNames: 'apply' as const };
const registry = createRegistry({
  spaces: [testSpace()],
  groups: [{ id: groupId('overview'), space: spaceId('mars'), icon: House, label: { ko: '개요', en: 'Overview' } }],
  menus: [{ id: 'home', group: groupId('overview'), primary: true, path: '/', icon: House,
    label: { ko: '홈', en: 'Home' }, description: { ko: '', en: '' }, permission: 'platform:view',
    requiresScope: true, pageType: 'overview', context, features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: [] }],
});
const endpoint = defineEndpoint<null, unknown>({
  id: 'home.denied', menuId: 'home', paramKeys: {}, permission: 'platform:view', requiresScope: true,
  context: { roomNames: 'apply' }, kinds: [], mergeTimeDomain: false,
});

function DeniedQuery() {
  return <QueryView query={useMenuQuery(endpoint, null)}>{() => null}</QueryView>;
}

afterEach(() => {
  cleanup();
  featureQueryClient.clear();
  setFeatureApi(null);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});

it('posts and receipts the exact query denial even when the Scope has another requestable room', async () => {
  vi.stubGlobal('localStorage', memoryStorage());
  window.history.replaceState(null, '', '/?v=1&scopeId=SITE-B&roomNames=RB4');
  const posts: unknown[] = [];
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    if (path.endsWith('/permission-requests/mine')) return json({ requests: [] });
    if (path.endsWith('/permission-requests/scope-candidates')) {
      return json({ sites: [{ site: SITE, label: SITE, siteGranted: false,
        rooms: [{ room: 'RB3', granted: false }, { room: ROOM, granted: false }] }] });
    }
    if (path.endsWith('/permission-requests') && init?.method === 'POST') {
      posts.push(JSON.parse(String(init.body)));
      return json({ id: REQUEST_ID, status: 'pending', created_at: '2026-11-12T00:00:00.000Z',
        requested_scope_kind: 'site_room', requested_scope_site: SITE, requested_scope_room: ROOM }, 201);
    }
    return json({}, 500);
  }));
  setFeatureApi({ basePath: '/api/features', onSessionLost: vi.fn() });
  const session = { ...testSession(['platform:view'], { scopes: [{ id: SITE, label: SITE, grantedRooms: 1, totalRooms: 3 }] }), requestableScopes: [] };
  const adapter = testAdapter({
    session: () => session,
    validateScope: async () => ({ status: 'valid', grantedRooms: ['RB1'] }),
    menuQuery: async () => ({ outcome: 'forbidden', data: null, assessments: [], trust: null, correlationId: 'denied',
      recovery: { deniedScope: { kind: 'site_room', site: SITE, room: ROOM } } }),
  });
  render(<I18nProvider><PlatformProvider registry={registry} adapter={adapter} slots={{ accessRequest: accessRequestSlot }}>
    <PlatformPage><DeniedQuery /></PlatformPage>
  </PlatformProvider></I18nProvider>);
  await waitFor(() => expect(screen.getByRole('button', { name: '권한 요청' }).getAttribute('aria-disabled')).not.toBe('true'));
  fireEvent.click(screen.getByRole('button', { name: '권한 요청' }));
  const reason = await screen.findByTestId('permission-request-reason', undefined, LAZY_MOUNT_WAIT);
  const scopeKind = screen.queryByRole('combobox', { name: '범위 종류' });
  if (scopeKind) {
    const scrollIntoView = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView');
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: () => {} });
    try {
      fireEvent.keyDown(scopeKind, { key: 'Enter' });
      fireEvent.keyDown(await screen.findByRole('option', { name: /Site 전체/ }), { key: 'Enter' });
    } finally {
      if (scrollIntoView) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', scrollIntoView);
      else Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
    }
  }
  fireEvent.change(reason, { target: { value: '공정 데이터 확인' } });
  fireEvent.click(screen.getByRole('button', { name: '요청 제출' }));
  await waitFor(() => expect(posts).toEqual([{
    requested_capability: 'scope.read', requested_scope_kind: 'site_room', requested_scope_site: SITE,
    requested_scope_room: ROOM, reason: '공정 데이터 확인', return_route_intent: '/mars/home?v=1&scopeId=SITE-B&roomNames=RB4',
  }]));
  expect(await screen.findByText('권한 요청 완료')).toBeTruthy();
  expect(screen.getByTestId('permission-request-id').textContent).toBe(REQUEST_ID);
});
