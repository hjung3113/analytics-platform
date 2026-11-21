// #1844 node 1844f1b — the bridge's blocked-place request slot (ADR-0154 decision 6). Synthetic site names only (ADR-0151).
import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PermissionRequestTarget } from '@ap/contracts';
import { useAccessRequestRead } from '@ap/components';
import { I18nProvider, PlatformProvider, usePlatform, type AccessRequestState } from '@ap/kernel';
import { memoryStorage } from '@ap/kernel/testing';
import { FeatureBridge, featureQueryClient } from '@ap/feature-bridge';
import { setFeatureApi } from '@ap/feature-bridge/feature-api';
import { accessRequestSlot } from '@ap/feature-bridge/access-request-slot';
import { RequestAccessButton } from '@ap/feature-screens/global-screens';
import { permissionCheckQueryOptions, permissionRequestsMineAllKey } from '@ap/feature-screens/global-screens/core';
import { eqvView, findingAccessRegistry, ID_A, ID_B, json, registry, stubFetch, switchableAdapter } from './feature/test-support';

const MINE = '/api/features/permission-requests/mine';
const CREATE = '/api/features/permission-requests';
const REQUEST_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1';
const AT = '2026-11-13T00:00:00.000Z';
const SITE: PermissionRequestTarget = { kind: 'site', site: 'site-alpha' };
const ME = '/api/features/me';
const SYSTEMS = '/api/features/managed-systems';
const CHECK = '/api/features/me/permissions/check';
const FINDINGS = `/findings?v=1&managedSystem=${ID_A}`;

const REQUEST_READ_LIMIT_MS = 8000;

function MenuPermissionActions({ state }: { state: AccessRequestState }) {
  const { shown, canRetry, retrying, run } = useAccessRequestRead(state);
  const href = shown.pending || shown.requestHref === undefined ? shown.statusHref : shown.requestHref;
  return <>
    <output data-testid="menu-permission-state">{JSON.stringify(shown)}</output>
    {href && <a href={href}>요청</a>}
    {shown.read === 'error' && canRetry && <button type="button" aria-busy={retrying || undefined} onClick={run}>다시 시도</button>}
  </>;
}

function ChangeSystem() {
  const { linkTo, navigate } = usePlatform();
  return <button type="button" onClick={() => navigate(linkTo('findings', { page: { managedSystem: ID_B } }))}>Beta</button>;
}

function mountMenuPermission(url: string, permission: 'features:access' | 'console:access' | typeof eqvView) {
  window.history.replaceState(null, '', url);
  const { Pending } = accessRequestSlot;
  return render(<I18nProvider><PlatformProvider adapter={switchableAdapter('developer').adapter} registry={findingAccessRegistry}>
    <ChangeSystem />
    <Pending target={{ kind: 'permission', permission }}>{state => <MenuPermissionActions state={state} />}</Pending>
  </PlatformProvider></I18nProvider>);
}

function menuPermissionState() {
  return JSON.parse(screen.getByTestId('menu-permission-state').textContent ?? '{}');
}

function heldResponse() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>(finish => { resolve = finish; });
  return { promise, resolve };
}

function stubFindingReads(overrides: (path: string, url: URL) => Response | Promise<Response> | undefined) {
  return stubFetch(url => {
    const address = new URL(url, window.location.origin);
    const { pathname } = address;
    const response = overrides(pathname, address);
    if (response !== undefined) return response;
    if (pathname === ME) return json({
      actor: { id: 'developer', external_id: 'developer', email: '', display_name: 'Developer', role_level: 'developer' },
      workspace_id: 'workspace',
    });
    if (pathname === SYSTEMS) return json({
      items: [{ id: ID_A, slug: 'alpha', name: 'Alpha' }, { id: ID_B, slug: 'beta', name: 'Beta' }].map(system => ({
        ...system, workspace_id: 'workspace', external_key: null,
        default_owner_actor_id: null, default_owner_team_id: null, default_reviewer_actor_id: null,
        default_reviewer_team_id: null, archived_at: null, archived_by_actor_id: null, created_at: AT, updated_at: AT })),
      page: { has_more: false },
    });
    if (pathname === CHECK) return json({ state: 'request_access', decision: { allow: false } });
    if (pathname === MINE) return json({ requests: [] });
    throw new Error(`Unexpected request: ${url}`);
  });
}

const mineRow = (site: string) => ({
  id: REQUEST_ID, requested_scope_kind: 'site', requested_scope_site: site, requested_scope_room: null, requested_capability: 'scope.read',
  requested_managed_system_id: null, reason: '조회', requested_object_type: null, requested_object_id: null, source_object_type: null,
  source_object_id: null, source_action_id: null, revision: 1, requested_expiration: null, updated_at: AT, return_route_intent: '/blocked', status: 'pending', created_at: AT,
});

/** A place stand-in: the state label and the request button sit inside `Pending`'s children, the dialog beside it (as the SDK places draw them). */
function Place({ target }: { target: PermissionRequestTarget }) {
  const [open, setOpen] = useState(false);
  const { Pending, Dialog } = accessRequestSlot;
  return <>
    <Pending target={target}>{state => <p data-testid="state">
      {`pending=${String(state.pending)} href=${String(state.statusHref)}`}
      <button type="button" onClick={() => setOpen(true)}>열기</button>
    </p>}</Pending>
    <Dialog target={target} returnTo="/blocked" open={open} onOpenChange={setOpen} />
  </>;
}

function mount(target: PermissionRequestTarget) {
  return render(<I18nProvider><PlatformProvider adapter={switchableAdapter().adapter} registry={registry}><Place target={target} /></PlatformProvider></I18nProvider>);
}

// jsdom has no `scrollIntoView`; the dialog's Radix Select calls it when its list opens (feature-screens' test setup stubs it the same way).
const scrollIntoView = Element.prototype.scrollIntoView;
beforeEach(() => { vi.stubGlobal('localStorage', memoryStorage()); Element.prototype.scrollIntoView = () => undefined; });
afterEach(() => { cleanup(); window.history.replaceState(null, '', '/'); setFeatureApi(null); vi.unstubAllGlobals(); Element.prototype.scrollIntoView = scrollIntoView; });

describe('accessRequest slot', () => {
  it('without a feature API reports unknown and requests nothing', async () => {
    setFeatureApi(null);
    const calls = stubFetch(() => json({ requests: [] }));
    mount(SITE);
    expect(screen.getByTestId('state').textContent).toContain('pending=null');
    expect(calls).toEqual([]);
  });

  describe('with a feature API', () => {
    beforeEach(() => { setFeatureApi({ basePath: '/api/features', onSessionLost: vi.fn() }); });

    it('builds the blocked Finding card link with the platform address and form inputs', async () => {
      stubFindingReads(() => undefined);
      const origin = `/mars${FINDINGS}`;
      window.history.replaceState(null, '', origin);
      render(<I18nProvider><PlatformProvider adapter={switchableAdapter('developer').adapter} registry={findingAccessRegistry}>
        <FeatureBridge>
          <RequestAccessButton capability="finding.read" managedSystemId={ID_A} returnRouteIntent="/surveys"
            layout="card" renderTrigger={(_open, panel) => panel?.requestAction} />
        </FeatureBridge>
      </PlatformProvider></I18nProvider>);
      const link = await screen.findByRole('link', { name: '권한 요청' });
      const target = new URL(link.getAttribute('href')!, window.location.origin);
      expect(target.pathname).toBe('/permission-requests');
      expect(Object.fromEntries(target.searchParams)).toEqual({
        v: '1', capability: 'finding.read', managedSystem: ID_A, returnTo: origin,
      });
    });

    it.each(['slot', 'card'])('opens plain request status from the pending Finding %s', async entry => {
      stubFindingReads(path => path === CHECK ? json({ state: 'pending_request', decision: { allow: false } }) : undefined);
      if (entry === 'slot') {
        mountMenuPermission(FINDINGS, 'features:access');
      } else {
        window.history.replaceState(null, '', FINDINGS);
        render(<I18nProvider><PlatformProvider adapter={switchableAdapter('developer').adapter} registry={findingAccessRegistry}>
          <FeatureBridge>
            <RequestAccessButton capability="finding.read" managedSystemId={ID_A} returnRouteIntent="/surveys" pending
              layout="card" renderTrigger={(_open, panel) => panel?.requestAction} />
          </FeatureBridge>
        </PlatformProvider></I18nProvider>);
      }
      const link = await screen.findByRole('link', { name: entry === 'slot' ? '요청' : '내 권한 요청 보기' });
      const href = new URL(link.getAttribute('href')!, window.location.origin);
      expect(href.pathname).toBe('/permission-requests');
      expect(Object.fromEntries(href.searchParams)).toEqual({ v: '1' });
    });

    it('a submit through the dialog flips Pending without remounting the place (mine-list invalidation)', async () => {
      let rows: unknown[] = [];
      const calls = stubFetch((path, method) => {
        if (path === MINE) return json({ requests: rows });
        if (path === CREATE && method === 'POST') {
          rows = [mineRow('site-alpha')];
          return json({ id: REQUEST_ID, status: 'pending', created_at: AT, requested_scope_kind: 'site', requested_scope_site: 'site-alpha', requested_scope_room: null }, 201);
        }
        return json({ sites: [] });
      });
      mount(SITE);
      // The status link is the 권한 요청 menu's address as the Kernel builds it (`linkTo`), not a hard-coded path.
      await waitFor(() => expect(screen.getByTestId('state').textContent).toMatch(/^pending=false href=\/permission-requests(\?|열기)/));
      const place = screen.getByTestId('state');

      const user = userEvent.setup();
      await user.click(screen.getByRole('button', { name: '열기' }));
      const dialog = await screen.findByTestId('permission-request-dialog');
      expect(within(dialog).getByText('Site site-alpha')).toBeTruthy();
      within(dialog).getByRole('combobox', { name: '범위 종류' }).focus();
      await user.keyboard('{Enter}');
      await user.click(await screen.findByRole('option', { name: 'Site 전체 (이후 추가되는 공정 포함)' }));
      await user.type(within(dialog).getByTestId('permission-request-reason'), '조회');
      await user.click(within(dialog).getByRole('button', { name: '요청 제출' }));

      await waitFor(() => expect(screen.getByTestId('state').textContent).toContain('pending=true'));
      expect(screen.getByTestId('state')).toBe(place);
      const post = calls.find(call => call.method === 'POST');
      expect(post?.path).toBe(CREATE);
      expect(calls.filter(call => call.path === MINE).length).toBe(2);
    });

    it('a duplicate 409 keeps the dialog open with the status notice and a working link, and refetches the mine list (#1907)', async () => {
      const calls = stubFetch((path, method) => {
        if (path === MINE) return json({ requests: [] });
        if (path === CREATE && method === 'POST') return json({ code: 'conflict.permission_request_duplicate', message: 'dup' }, 409);
        return json({ sites: [] });
      });
      mount(SITE);
      await waitFor(() => expect(screen.getByTestId('state').textContent).toContain('pending=false'));
      const user = userEvent.setup();
      await user.click(screen.getByRole('button', { name: '열기' }));
      const dialog = await screen.findByTestId('permission-request-dialog');
      within(dialog).getByRole('combobox', { name: '범위 종류' }).focus();
      await user.keyboard('{Enter}');
      await user.click(await screen.findByRole('option', { name: 'Site 전체 (이후 추가되는 공정 포함)' }));
      await user.type(within(dialog).getByTestId('permission-request-reason'), '조회');
      await user.click(within(dialog).getByRole('button', { name: '요청 제출' }));

      const notice = await within(dialog).findByTestId('permission-request-conflict');
      expect(notice.getAttribute('role')).toBe('status');
      // The bridge host maps `/permission-requests` to the 권한 요청 menu, so the link exists (it is absent under the default no-link host).
      const link = within(notice).getByRole('link', { name: '요청 상태 보기' });
      expect(link.getAttribute('href')).toMatch(/^\/permission-requests/);
      expect(screen.getByTestId('permission-request-dialog')).toBe(dialog);
      await waitFor(() => expect(calls.filter(call => call.path === MINE).length).toBe(2));
    });

    it('a retained dialog follows a changed target: cancel on one room, reopen on another (review C1)', async () => {
      const calls = stubFetch((path) => path === MINE ? json({ requests: [] }) : json({ sites: [{ site: 'site-alpha', label: 'Site alpha', rooms: [{ room: 'room-one', granted: false }, { room: 'room-two', granted: false }], siteGranted: false }] }));
      const { adapter } = switchableAdapter();
      const tree = (target: PermissionRequestTarget) => <I18nProvider><PlatformProvider adapter={adapter} registry={registry}><Place target={target} /></PlatformProvider></I18nProvider>;
      const view = render(tree({ kind: 'site_room', site: 'site-alpha', room: 'room-one' }));
      const user = userEvent.setup();
      await user.click(screen.getByRole('button', { name: '열기' }));
      const first = await screen.findByTestId('permission-request-dialog');
      expect((await within(first).findByRole('combobox', { name: '공정' })).textContent).toContain('room-one');
      await user.keyboard('{Escape}');
      await waitFor(() => expect(screen.queryByTestId('permission-request-dialog')).toBeNull());
      view.rerender(tree({ kind: 'site_room', site: 'site-alpha', room: 'room-two' }));
      await user.click(screen.getByRole('button', { name: '열기' }));
      const dialog = await screen.findByTestId('permission-request-dialog');
      expect((await within(dialog).findByRole('combobox', { name: '공정' })).textContent).toContain('room-two');
      expect(calls.some(call => call.method === 'POST')).toBe(false);
    });

    it.each([
      { permission: eqvView, href: /^pending=null href=\/permission-requests(\?|열기)/ },
      { permission: 'features:access' as const, href: /^pending=null href=null/ },
    ])('a routeless $permission reports unknown and reads nothing (#1940)', async ({ permission, href }) => {
      const calls = stubFetch(() => json({ requests: [mineRow('site-alpha')] }));
      mount({ kind: 'permission', permission });
      await userEvent.setup().click(screen.getByRole('button', { name: '열기' }));
      expect(screen.getByTestId('state').textContent).toMatch(href);
      expect(screen.queryByTestId('permission-request-dialog')).toBeNull();
      expect(calls).toEqual([]);
    });

    describe('menu permission regression', () => {
      it('checks and requests the capability declared by a new menu', async () => {
        const calls = stubFindingReads(() => undefined);
        mountMenuPermission(`/declared-capability?v=1&managedSystem=${ID_A}`, 'features:access');
        const link = await screen.findByRole('link', { name: '요청' });
        const target = new URL(link.getAttribute('href')!, window.location.origin);
        expect(Object.fromEntries(target.searchParams)).toMatchObject({ capability: 'survey.read', managedSystem: ID_A });
        const check = calls.map(call => new URL(call.path, window.location.origin)).find(url => url.pathname === CHECK);
        expect(Object.fromEntries(check!.searchParams)).toEqual({ capability: 'survey.read', managed_system_id: ID_A });
      });

      it.each([false, true])('gives the next Managed System a fresh deadline (previous read retried: %s)', async retried => {
        vi.useFakeTimers();
        const hold = heldResponse();
        const checks: Array<string | null> = [];
        stubFindingReads((path, url) => {
          if (path !== CHECK) return;
          checks.push(url.searchParams.get('managed_system_id'));
          return hold.promise;
        });
        const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
        try {
          mountMenuPermission(FINDINGS, 'features:access');
          await act(async () => vi.waitFor(() => expect(checks).toEqual([ID_A])));
          if (retried) {
            await advance(REQUEST_READ_LIMIT_MS);
            fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
            expect(checks).toEqual([ID_A, ID_A]);
            expect(screen.getByRole('button', { name: '다시 시도' }).getAttribute('aria-busy')).toBe('true');
          }
          await advance(6000);
          fireEvent.click(screen.getByRole('button', { name: 'Beta' }));
          await advance(3000);
          expect(checks.at(-1)).toBe(ID_B);
          expect(menuPermissionState()).toMatchObject({ read: 'checking', missing: { system: 'Beta' } });
          expect(screen.queryByRole('button', { name: '다시 시도' })).toBeNull();
          await advance(5000);
          fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
          expect(checks.slice(-2)).toEqual([ID_B, ID_B]);
        } finally {
          hold.resolve(json({ state: 'blocked_not_requestable', decision: { allow: false } }));
          vi.useRealTimers();
        }
      });

      it('withholds the request during history checking and error, then retries only history', async () => {
        const history = heldResponse();
        let historyReads = 0;
        const calls = stubFindingReads(path => {
          if (path === MINE && ++historyReads === 1) return history.promise;
        });
        mountMenuPermission(FINDINGS, 'features:access');
        await waitFor(() => expect(historyReads).toBe(1));
        expect.soft(menuPermissionState()).toMatchObject({ read: 'checking', pending: null });
        expect.soft(menuPermissionState()).not.toHaveProperty('requestHref');
        expect.soft(screen.queryByRole('link', { name: '요청' })).toBeNull();
        await act(async () => { history.resolve(json({}, 500)); });
        const retry = await screen.findByRole('button', { name: '다시 시도' });
        expect.soft(menuPermissionState()).toMatchObject({ read: 'error', pending: null });
        expect.soft(menuPermissionState()).not.toHaveProperty('requestHref');
        expect.soft(screen.queryByRole('link', { name: '요청' })).toBeNull();
        const beforeRetry = calls.length;
        await userEvent.setup().click(retry);
        expect((await screen.findByRole('link', { name: '요청' })).getAttribute('href')).toMatch(/^\/permission-requests(?:\?|$)/);
        expect(calls.slice(beforeRetry).map(call => new URL(call.path, window.location.origin).pathname)).toEqual([MINE]);
      });

      it('exposes retry after a point check error and retries only the check', async () => {
        let checkReads = 0;
        const calls = stubFindingReads(path => {
          if (path !== CHECK) return;
          if (++checkReads === 1) return json({}, 500);
          return json({ state: 'blocked_not_requestable', decision: { allow: false } });
        });
        mountMenuPermission(FINDINGS, 'features:access');
        const retry = await screen.findByRole('button', { name: '다시 시도' });
        expect.soft(menuPermissionState()).toMatchObject({ read: 'error', pending: null });
        expect.soft(menuPermissionState()).not.toHaveProperty('requestHref');
        expect.soft(screen.queryByRole('link', { name: '요청' })).toBeNull();
        const beforeRetry = calls.length;
        await userEvent.setup().click(retry);
        await waitFor(() => expect(menuPermissionState()).toMatchObject({ requestHref: null }));
        expect(calls.slice(beforeRetry).map(call => new URL(call.path, window.location.origin).pathname)).toEqual([CHECK]);
      });

      it('restarts the first history fetch when it stalls', async () => {
        const history = heldResponse();
        let historyReads = 0;
        const calls = stubFindingReads(path => {
          if (path === MINE && ++historyReads === 1) return history.promise;
        });
        mountMenuPermission(FINDINGS, 'features:access');
        try {
          const retry = await screen.findByRole('button', { name: '다시 시도' }, { timeout: REQUEST_READ_LIMIT_MS + 2000 });
          expect(menuPermissionState()).toHaveProperty('read', 'error');
          const beforeRetry = calls.length;
          await userEvent.setup().click(retry);
          await waitFor(() => expect(calls.slice(beforeRetry).map(call => new URL(call.path, window.location.origin).pathname)).toEqual([MINE]));
          await screen.findByRole('link', { name: '요청' });
        } finally {
          history.resolve(json({ requests: [] }));
        }
      }, REQUEST_READ_LIMIT_MS + 4000);

      it.each([
        { label: 'point check', endpoint: CHECK, queryKey: permissionCheckQueryOptions({ capability: 'finding.read', managedSystemId: ID_A }).queryKey },
        { label: 'history', endpoint: MINE, queryKey: permissionRequestsMineAllKey },
      ])('withholds the link during a background $label refetch', async ({ endpoint, queryKey }) => {
        const refetch = heldResponse();
        let hold = false;
        const calls = stubFindingReads(path => path === endpoint && hold ? refetch.promise : undefined);
        mountMenuPermission(FINDINGS, 'features:access');
        await screen.findByRole('link', { name: '요청' });
        const beforeRefetch = calls.length;
        hold = true;
        try {
          await act(async () => { void featureQueryClient.invalidateQueries({ queryKey }); });
          expect(calls).toHaveLength(beforeRefetch + 1);
          await waitFor(() => expect(menuPermissionState()).toMatchObject({ read: 'checking', pending: null }));
          expect(menuPermissionState()).not.toHaveProperty('requestHref');
          expect(screen.queryByRole('link', { name: '요청' })).toBeNull();
        } finally {
          await act(async () => {
            refetch.resolve(endpoint === CHECK ? json({ state: 'request_access', decision: { allow: false } }) : json({ requests: [] }));
          });
        }
        await screen.findByRole('link', { name: '요청' });
      });

      it.each([
        { url: '/eqv/topview', permission: eqvView, requestable: true },
        { url: '/flow/inbox', permission: 'features:access' as const, requestable: false },
        { url: '/eqv/topview', permission: 'console:access' as const, requestable: false },
      ])('sets requester availability for routed $permission', ({ url, permission, requestable }) => {
        const calls = stubFetch(() => json({ requests: [] }));
        mountMenuPermission(url, permission);
        const href = requestable ? expect.stringMatching(/^\/permission-requests(?:\?|$)/) : null;
        expect(menuPermissionState()).toMatchObject({ requestHref: href, statusHref: href, pending: null });
        expect(calls).toEqual([]);
      });
    });

    it('checks the exact Finding target before offering the plain request form to a Developer and clears it on switch to a User', async () => {
      let finishRole: (response: Response) => void = () => undefined;
      const userRole = new Promise<Response>(resolve => { finishRole = resolve; });
      let role: 'developer' | 'user' = 'developer';
      const actor = (roleLevel: string) => json({
        actor: { id: roleLevel, external_id: roleLevel, email: '', display_name: roleLevel, role_level: roleLevel },
        workspace_id: 'workspace',
      });
      const calls = stubFetch(path => {
        if (path === '/api/features/me') return role === 'developer' ? actor(role) : userRole;
        if (path.startsWith('/api/features/managed-systems?')) return json({
          items: [{ id: ID_A, workspace_id: 'workspace', slug: 'alpha', name: 'Alpha', external_key: null,
            default_owner_actor_id: null, default_owner_team_id: null, default_reviewer_actor_id: null,
            default_reviewer_team_id: null, archived_at: null, archived_by_actor_id: null, created_at: AT, updated_at: AT }],
          page: { has_more: false },
        });
        if (path.startsWith('/api/features/me/permissions/check?')) {
          const query = new URL(path, window.location.origin).searchParams;
          expect(query.get('capability')).toBe('finding.read');
          expect(query.get('managed_system_id')).toBe(ID_A);
          return json({ state: 'request_access', decision: { allow: false } });
        }
        return json({ requests: [] });
      });
      const host = switchableAdapter('developer');
      window.history.replaceState(null, '', `/findings?v=1&managedSystem=${ID_A}`);
      const { Pending } = accessRequestSlot;
      render(<I18nProvider><PlatformProvider adapter={host.adapter} registry={findingAccessRegistry}>
        <Pending target={{ kind: 'permission', permission: 'features:access' }}>{state => <>
          {state.requestHref && <a href={state.requestHref}>요청</a>}
          <p>{state.missing?.permission}</p><p>{state.missing?.system}</p>
        </>}</Pending>
      </PlatformProvider></I18nProvider>);
      const href = (await screen.findByRole('link', { name: '요청' })).getAttribute('href')!;
      const requestUrl = new URL(href, window.location.origin);
      expect(requestUrl.pathname).toBe('/permission-requests');
      expect(Object.fromEntries(requestUrl.searchParams)).toEqual({
        v: '1', capability: 'finding.read', managedSystem: ID_A, returnTo: `/mars${FINDINGS}`,
      });
      expect(screen.getByText('Alpha')).toBeTruthy();
      role = 'user';
      act(() => { host.setUser('user'); host.notify(); });
      expect(screen.queryByRole('link', { name: '요청' })).toBeNull();
      expect(screen.queryByText('Alpha')).toBeNull();
      await act(async () => { finishRole(actor(role)); });
      await screen.findByText('Developer 이상 역할 필요');
      expect(screen.queryByRole('link', { name: '요청' })).toBeNull();
      expect(calls.filter(call => call.path.startsWith('/api/features/me/permissions/check?'))).toHaveLength(1);
    });

    it('a denied console:access gets no request page address: the requester page cannot ask for the workspace-admin permission (#1940)', () => {
      stubFetch(() => json({ requests: [] }));
      mount({ kind: 'permission', permission: 'console:access' });
      expect(screen.getByTestId('state').textContent).toMatch(/^pending=null href=null/);
    });
  });
});
