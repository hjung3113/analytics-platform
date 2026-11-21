// #1175: Inbox and 내 VOC read GET /vocs in cursor pages of 50. Drives the real route,
// router and query client; only fetch is stubbed.

import { listVocsQuerySchema } from '@ap/feature-shared';
import type { QueryClient } from '@tanstack/react-query';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { permissionCheckQueryKey } from '../../../../lib/cross-system/usePermissionCheckBridge';
import {
  type AuthedVocsMount,
  type AuthedVocsRequest,
  ME,
  jsonResponse,
  mountAuthedVocs,
} from '../../../../test/mountVocs';

const MS = '00000000-0000-4000-8000-0000000000aa';

function voc(n: number, title: string) {
  return {
    id: `00000000-0000-4000-8000-00000000010${n}`,
    display_id: `VOC-P0${n}`,
    title,
    primary_managed_system_id: MS,
    analytics_area_id: null,
    reporter_id: '00000000-0000-4000-8000-0000000000bb',
    owner_user_id: null,
    owner_team_id: null,
    severity: 'high' as const,
    reporter_facing_status: 'received' as const,
    triage_state: 'untriaged' as const,
    source_context: 'direct_use' as const,
    created_at: '2026-10-08T00:00:00.000Z',
    updated_at: '2026-10-08T00:00:00.000Z',
    similar_count: 0,
    attachment_count: 0,
  };
}

const PAGE_ONE = [voc(1, '첫 페이지 A'), voc(2, '첫 페이지 B')];
const PAGE_TWO = [voc(3, '둘째 페이지 C')];

let mounted: AuthedVocsMount | undefined;
let nextPage: () => Response | Promise<Response> = () =>
  jsonResponse(200, { items: PAGE_TWO, page: { has_more: false } });
let firstPage: (request: AuthedVocsRequest) => Response | Promise<Response> = () =>
  jsonResponse(200, { items: PAGE_ONE, page: { has_more: true, cursor: 'cursor-1' } });

function vocsQuery(request: AuthedVocsRequest) {
  const raw = Object.fromEntries(new URL(request.url, 'http://localhost').searchParams);
  const parsed = listVocsQuerySchema.safeParse(raw);
  expect(parsed.success).toBe(true);
  return { raw, data: parsed.success ? parsed.data : undefined };
}

function mount(path: string, handle?: (request: AuthedVocsRequest) => Response | undefined) {
  mounted = mountAuthedVocs({
    initialPath: path,
    vocsShell: true,
    handle: (request) => {
      const handled = handle?.(request);
      if (handled !== undefined) return handled;
      if (request.method === 'GET' && request.url.startsWith('/vocs?')) {
        const { raw } = vocsQuery(request);
        return raw.cursor === 'cursor-1' ? nextPage() : firstPage(request);
      }
      if (request.url.startsWith('/saved-views')) return jsonResponse(200, { items: [] });
      return undefined;
    },
  });
  return mounted;
}

function listRequests(): AuthedVocsRequest[] {
  return (mounted?.requests ?? []).filter((r) => r.method === 'GET' && r.url.startsWith('/vocs?'));
}

async function navigateSearch(patch: Record<string, unknown>) {
  const router = mounted?.router;
  if (router === undefined) throw new Error('not mounted');
  await act(async () => {
    await router.navigate({
      to: '/vocs',
      search: ((prev: Record<string, unknown>) => ({ ...prev, ...patch })) as never,
    });
  });
}

afterEach(() => {
  expect(mounted?.unhandled ?? []).toEqual([]);
  vi.unstubAllGlobals();
  nextPage = () => jsonResponse(200, { items: PAGE_TWO, page: { has_more: false } });
  firstPage = () =>
    jsonResponse(200, { items: PAGE_ONE, page: { has_more: true, cursor: 'cursor-1' } });
});

const VIEWS = [
  ['inbox', '/vocs?view=inbox'],
  ['my', '/vocs?view=my'],
] as const;

const DENIAL_CODES = ['permission.denied', 'permission.scope_required'] as const;
const SUMMARY_COUNT = '3건의 VOC를 조회할 수 없습니다.';
const SEVERITY_SUMMARY = '심각도 분포: 높음=3';

function inboxDenial(code: (typeof DENIAL_CODES)[number]) {
  return jsonResponse(403, { code, message: 'VOC read denied' });
}

function deferredResponse() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((done) => { resolve = done; });
  return { promise, resolve };
}

describe('Inbox permission denial (#2619)', () => {
  it.each([
    { name: 'server-pointed System', url: '/vocs?view=inbox', target: MS },
    { name: 'selected System', url: `/vocs?view=inbox&managedSystem=${MS}`, target: null },
  ])('checks the $name again before offering Request (#2622)', async ({ url, target }) => {
    const denial = deferredResponse();
    const freshCheck = deferredResponse();
    mounted = mountAuthedVocs({
      initialPath: url,
      vocsShell: true,
      handle: (request) => {
        const { pathname } = new URL(request.url, 'http://localhost');
        if (pathname === '/vocs') return denial.promise;
        if (pathname === '/me/permissions/check') return freshCheck.promise;
        if (pathname === '/permission-requests/mine') {
          return jsonResponse(200, { requests: [], count: 0 });
        }
        return undefined;
      },
    });
    const { queryClient } = mounted.router.options.context as { queryClient: QueryClient };
    queryClient.setQueryData(permissionCheckQueryKey({ capability: 'voc.read', managedSystemId: MS }), {
      state: 'request_access',
      decision: { allow: false, requestable: [{ workspace_id: ME.workspace_id, managed_system_id: MS }] },
    });
    denial.resolve(jsonResponse(403, {
      code: 'permission.scope_required',
      message: 'VOC read denied',
      requestable_permission: { permission: 'voc.read', managed_system_id: target },
    }));

    const heading = await screen.findByRole('heading', { name: 'VOC 처리함', level: 3 });
    expect(screen.getByText('확인 중')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '권한 요청' })).not.toBeInTheDocument();
    const { requests } = mounted;
    await waitFor(() => expect(requests).toContainEqual({
      method: 'GET',
      url: `/me/permissions/check?capability=voc.read&managed_system_id=${MS}`,
    }));

    freshCheck.resolve(jsonResponse(200, {
      state: 'blocked_non_requestable',
      decision: { allow: false, requestable: null },
    }));

    await waitFor(() => expect(heading.closest('[data-request-status]')).toHaveAttribute(
      'data-request-status', 'not-requestable',
    ));
    expect(screen.queryByText('확인 중')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '권한 요청' })).not.toBeInTheDocument();
  });

  it.each(DENIAL_CODES)('hides cached rows, controls and summary after refetch returns %s', async (code) => {
    firstPage = () =>
      jsonResponse(200, {
        items: PAGE_ONE,
        page: { has_more: true, cursor: 'cursor-1' },
        out_of_scope_summary: { count: 3, severity_distribution: { high: 3 } },
      });
    const { router } = mount('/vocs?view=inbox');
    expect(await screen.findByText(SUMMARY_COUNT)).toBeInTheDocument();
    expect(screen.getByText(SEVERITY_SUMMARY)).toBeInTheDocument();
    expect(screen.getByText('첫 페이지 A')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '더 불러오기' })).toBeInTheDocument();

    firstPage = () => inboxDenial(code);
    const { queryClient } = router.options.context as { queryClient: QueryClient };
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: ['vocs', 'inbox', 'pages'] });
    });

    expect(await screen.findByRole('heading', { name: 'VOC 처리함', level: 3 })).toBeInTheDocument();
    expect(screen.queryByText('첫 페이지 A')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '더 불러오기' })).not.toBeInTheDocument();
    expect(screen.queryByText(SUMMARY_COUNT)).not.toBeInTheDocument();
    expect(screen.queryByText(SEVERITY_SUMMARY)).not.toBeInTheDocument();
  });

  it.each(DENIAL_CODES)('hides loaded rows when the next page returns %s', async (code) => {
    mount('/vocs?view=inbox');
    await screen.findByText('첫 페이지 A');
    nextPage = () => inboxDenial(code);
    fireEvent.click(screen.getByRole('button', { name: '더 불러오기' }));

    const panel = await screen.findByRole('heading', { name: 'VOC 처리함', level: 3 }, { timeout: 5000 });
    expect(panel.closest('[data-state]')).toHaveAttribute('data-state', 'blocked_not_requestable');
    expect(screen.queryByText('첫 페이지 A')).not.toBeInTheDocument();
    expect(screen.queryByText('첫 페이지 B')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '다시 시도' })).not.toBeInTheDocument();
  });

  it.each([
    { name: 'default URL', url: '/vocs', requestable: false },
    { name: 'ineligible System', url: `/vocs?managedSystem=${MS}`, requestable: false },
    { name: 'eligible System', url: `/vocs?managedSystem=${MS}`, requestable: true },
  ])('uses the server-confirmed target for a Developer with zero read scope ($name)', async ({
    url,
    requestable,
  }) => {
    const { requests } = mount(url, (request) => {
      const { pathname, searchParams } = new URL(request.url, 'http://localhost');
      if (pathname === '/me') {
        return jsonResponse(200, { ...ME, actor: { ...ME.actor, role_level: 'developer' } });
      }
      if (pathname === '/vocs') {
        return jsonResponse(403, {
          code: 'permission.scope_required',
          message: 'Developer has no VOC read scope',
          requestable_permission: { permission: 'voc.read', managed_system_id: null },
        });
      }
      if (pathname === '/me/permissions/scope') {
        return jsonResponse(200, { scope: { kind: 'scoped', managed_system_ids: [] } });
      }
      if (pathname === '/me/permissions/check') {
        expect(searchParams.get('capability')).toBe('voc.read');
        expect(searchParams.get('managed_system_id')).toBe(MS);
        return jsonResponse(200, {
          state: requestable ? 'request_access' : 'blocked_non_requestable',
          decision: {
            allow: false,
            reason: 'no_grant',
            requestable: requestable ? [{ workspace_id: ME.workspace_id }] : null,
          },
        });
      }
      if (pathname === '/permission-requests/mine') {
        return jsonResponse(200, { requests: [], count: 0 });
      }
      return undefined;
    });

    if (requestable) {
      fireEvent.click(await screen.findByRole('button', { name: '권한 요청' }, { timeout: 5000 }));
      const dialog = within(await screen.findByRole('dialog', { name: '권한 요청' }));
      expect(dialog.getByText(MS)).toBeInTheDocument();
      expect(dialog.queryByText('전체')).not.toBeInTheDocument();
    } else {
      const guidance = await screen.findByText(
        '시스템을 선택한 뒤 VOC 조회 권한을 요청하세요.', {}, { timeout: 3000 },
      );
      // The next step sits inside the blocked card, not as a loose line under it.
      expect(guidance.closest('[data-state="blocked_not_requestable"]')).not.toBeNull();
      expect(screen.queryByRole('button', { name: '권한 요청' })).not.toBeInTheDocument();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    }
    expect(requests.filter(({ url }) => url.startsWith('/me/permissions/check'))).toHaveLength(
      url.includes('managedSystem=') ? 1 : 0,
    );
  });
});

describe('Inbox and 내 VOC cursor paging (#1175)', () => {
  it.each(VIEWS)(
    '%s: 더 불러오기 sends the returned cursor and appends rows',
    async (view, path) => {
      mount(path);
      expect(await screen.findByText('첫 페이지 A')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: '더 불러오기' }));

      expect(await screen.findByText('둘째 페이지 C')).toBeInTheDocument();
      expect(screen.getByText('첫 페이지 A')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '더 불러오기' })).not.toBeInTheDocument();
      const [first, second] = listRequests();
      if (first === undefined || second === undefined)
        throw new Error('expected two list requests');
      const one = vocsQuery(first);
      const two = vocsQuery(second);
      expect(one.raw.cursor).toBeUndefined();
      expect(one.data?.limit).toBe(50);
      expect(two.raw.cursor).toBe('cursor-1');
      const { cursor: _cursor, ...rest } = two.raw;
      expect(rest).toEqual(one.raw);
      expect(one.data?.view).toBe(view);
    },
  );

  it.each([
    ['inbox', '/vocs?view=inbox', { sort: 'created_at:asc' }],
    ['inbox', '/vocs?view=inbox', { 'filter.owner': 'assigned' }],
    ['inbox', '/vocs?view=inbox', { tab: 'high' }],
    ['inbox', '/vocs?view=inbox', { managedSystem: MS }],
    ['my', '/vocs?view=my', { sort: 'created_at:asc' }],
    ['my', '/vocs?view=my', { 'filter.owner': 'assigned' }],
    ['my', '/vocs?view=my', { managedSystem: MS }],
  ] as const)(
    '%s: a %j change restarts at page one without a cursor',
    async (_view, path, patch) => {
      mount(path);
      await screen.findByText('첫 페이지 A');
      fireEvent.click(screen.getByRole('button', { name: '더 불러오기' }));
      await screen.findByText('둘째 페이지 C');
      const before = listRequests().length;
      let release: (response: Response) => void = () => {};
      firstPage = () =>
        new Promise<Response>((resolve) => {
          release = resolve;
        });

      await navigateSearch(patch);

      await waitFor(() => expect(listRequests().length).toBe(before + 1));
      const request = listRequests().at(-1);
      if (request === undefined) throw new Error('missing request');
      expect(vocsQuery(request).raw.cursor).toBeUndefined();
      // Not a q-only change: the old pages are gone while page one loads.
      expect(screen.queryByText('둘째 페이지 C')).not.toBeInTheDocument();
      expect(screen.queryByText('첫 페이지 A')).not.toBeInTheDocument();
      await act(async () => {
        release(jsonResponse(200, { items: [voc(4, '새 조건 D')], page: { has_more: false } }));
      });
      expect(await screen.findByText('새 조건 D')).toBeInTheDocument();
      expect(screen.queryByText('둘째 페이지 C')).not.toBeInTheDocument();
    },
  );

  it('keeps the loaded rows while a q-only change loads its first page', async () => {
    mount('/vocs?view=inbox&tab=untriaged&q=abc');
    await screen.findByText('첫 페이지 A');
    let release: (response: Response) => void = () => {};
    firstPage = () =>
      new Promise<Response>((resolve) => {
        release = resolve;
      });

    await navigateSearch({ q: 'abd' });

    await waitFor(() =>
      expect(listRequests().some((r) => vocsQuery(r).raw.q === 'abd')).toBe(true),
    );
    expect(screen.getByText('첫 페이지 A')).toBeInTheDocument();
    expect(screen.queryByRole('rowgroup', { name: 'VOC 목록 로딩 중' })).not.toBeInTheDocument();
    await act(async () => {
      release(jsonResponse(200, { items: [voc(5, '검색 결과 E')], page: { has_more: false } }));
    });
    expect(await screen.findByText('검색 결과 E')).toBeInTheDocument();
    expect(screen.queryByText('첫 페이지 A')).not.toBeInTheDocument();
  });

  it('keeps rows for actual search start, pending q edits and clear with tab restoration', async () => {
    mount('/vocs?view=inbox&tab=high');
    await screen.findByText('첫 페이지 A');
    firstPage = () => new Promise<Response>(() => {});
    const box = screen.getByRole('searchbox', { name: '제목 또는 ID' });
    for (const q of ['abc', 'abd']) {
      fireEvent.change(box, { target: { value: q } });
      fireEvent.keyDown(box, { key: 'Enter' });
      await waitFor(() => expect(mounted?.router.state.location.search.q).toBe(q));
      expect(screen.getByText('첫 페이지 A')).toBeInTheDocument();
    }
    fireEvent.keyDown(box, { key: 'Escape' });
    await waitFor(() => expect(mounted?.router.state.location.search.tab).toBe('high'));
    expect(mounted?.router.state.location.search.q).toBeUndefined();
    expect(screen.getByText('첫 페이지 A')).toBeInTheDocument();
  });

  it('keeps the search rows while clearing to an uncached default tab loads', async () => {
    mount('/vocs?view=inbox&q=abc');
    await screen.findByText('첫 페이지 A');
    firstPage = () => new Promise<Response>(() => {});
    fireEvent.keyDown(screen.getByRole('searchbox', { name: '제목 또는 ID' }), { key: 'Escape' });
    await waitFor(() => expect(mounted?.router.state.location.search.q).toBeUndefined());
    await waitFor(() => {
      const request = listRequests().at(-1);
      if (request === undefined) throw new Error('missing request');
      expect(vocsQuery(request).raw.tab).toBe('untriaged');
    });
    expect(screen.getByText('첫 페이지 A')).toBeInTheDocument();
  });

  it.each(['pending-search tab click', 'saved-view tab and q'])(
    '%s clears old-tab rows while the request is pending',
    async (transition) => {
      mount('/vocs?view=inbox&tab=high');
      await screen.findByText('첫 페이지 A');
      firstPage = () => new Promise<Response>(() => {});
      if (transition === 'pending-search tab click') {
        const box = screen.getByRole('searchbox', { name: '제목 또는 ID' });
        fireEvent.change(box, { target: { value: 'abc' } });
        fireEvent.keyDown(box, { key: 'Enter' });
        await waitFor(() =>
          expect(listRequests().some((r) => vocsQuery(r).raw.q === 'abc')).toBe(true),
        );
        expect(screen.getByText('첫 페이지 A')).toBeInTheDocument();
        fireEvent.mouseDown(screen.getByRole('tab', { name: /미배정/ }));
      } else {
        await navigateSearch({ tab: 'unassigned', q: 'abc' });
      }
      await waitFor(() => {
        const request = listRequests().at(-1);
        if (request === undefined) throw new Error('missing request');
        expect(vocsQuery(request).raw.tab).toBe('unassigned');
      });
      expect(screen.queryByText('첫 페이지 A')).not.toBeInTheDocument();
      expect(screen.getByRole('rowgroup', { name: 'VOC 목록 로딩 중' })).toBeInTheDocument();
    },
  );

  it.each(VIEWS)(
    '%s: a failed next page keeps the loaded rows and offers 다시 시도',
    async (_view, path) => {
      mount(path);
      await screen.findByText('첫 페이지 A');
      nextPage = () => jsonResponse(500, { error: { code: 'internal.unexpected', message: 'x' } });

      fireEvent.click(screen.getByRole('button', { name: '더 불러오기' }));

      const retry = await screen.findByRole('button', { name: '다시 시도' }, { timeout: 5000 });
      expect(screen.getByText('첫 페이지 A')).toBeInTheDocument();
      expect(screen.queryByText('불러오기 실패')).not.toBeInTheDocument();
      nextPage = () => jsonResponse(200, { items: PAGE_TWO, page: { has_more: false } });
      fireEvent.click(retry);
      expect(await screen.findByText('둘째 페이지 C')).toBeInTheDocument();
    },
  );
});
