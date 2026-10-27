import type { ClosableDetailParts } from '@/lib/host/detail-parts';
import { type HostSeam, HostSeamProvider } from '@/lib/host/host-seam';
import {
  getEvidenceInventoryResponseSchema,
  listEvidenceInventoryResponseSchema,
} from '@fops/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { type ReactNode, useSyncExternalStore } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { EvidenceScreen } from '../EvidenceScreen';

const listShell = vi.hoisted(() => ({ detailPanels: [] as unknown[] }));
vi.mock('@ap/ui', async (original) => ({
  ...(await original<typeof import('@ap/ui')>()),
  ListShell: ({ list, detailPanel }: { list: ReactNode; detailPanel?: ReactNode }) => {
    listShell.detailPanels.push(detailPanel);
    return <div>{list}</div>;
  },
}));

const ID = '11111111-1111-4111-8111-111111111111';
const PARENT = '22222222-2222-4222-8222-222222222222';
const MS = '33333333-3333-4333-8333-333333333333';
const item = getEvidenceInventoryResponseSchema.parse({
  id: ID,
  finding_id: PARENT,
  primary_managed_system_id: MS,
  analytics_area_id: null,
  sentiment: 'negative',
  importance: 'high',
  created_at: '2026-07-01T00:00:00.000Z',
  finding: { id: PARENT, display_id: 'FIN-42', title: '다운로드 실패' },
  source_type: 'note',
  content_state: 'available',
  quote_or_summary: '월간 다운로드가 느려졌습니다.',
});
const vocItem = getEvidenceInventoryResponseSchema.parse({
  ...item,
  source_type: 'voc',
  source: {
    id: PARENT,
    display_id: 'VOC-77',
    title: '원본 VOC',
    route: `/vocs?selected=${PARENT}`,
  },
});

type Search = Record<string, string>;
let current: Search = {};
const listeners = new Set<() => void>();
function setSearch(next: Search) {
  current = { ...next };
  for (const listener of listeners) listener();
}
const navigate = vi.fn<(href: string, options?: { replace?: boolean }) => void>();
const canLink = vi.fn<(to: string) => boolean>();
const seam: HostSeam = {
  canLink: (to) => canLink(to),
  Link: ({ to, children, className }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
  notifyError: () => {},
  notifySuccess: () => {},
  useNavigate: () => navigate,
  useSearch: () =>
    useSyncExternalStore(
      (listener) => {
        listeners.add(listener);
        return () => void listeners.delete(listener);
      },
      () => current,
    ),
  useTitle: () => {},
  notify: () => 'notice',
  dismiss: () => {},
};

const detailCalls: ClosableDetailParts[] = [];
function renderDetail(parts: ClosableDetailParts) {
  detailCalls.push(parts);
  return (
    <div data-testid="drawer">
      <h2>{parts.title}</h2>
      {parts.body}
      <button type="button" onClick={parts.requestClose}>
        drawer close
      </button>
    </div>
  );
}

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}
function installFetch(
  list: (url: URL) => Response = () =>
    response(
      listEvidenceInventoryResponseSchema.parse({ items: [item], page: { has_more: false } }),
    ),
  detail: Response | (() => Response) = () => response(item),
) {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: string) => {
      const url = new URL(input, 'http://localhost');
      if (url.pathname === '/me')
        return Promise.resolve(
          response({
            actor: {
              id: 'actor',
              external_id: 'external',
              email: 'actor@example.com',
              display_name: 'Actor',
              role_level: 'admin',
            },
            workspace_id: 'workspace',
          }),
        );
      if (url.pathname === '/evidence-highlights') return Promise.resolve(list(url));
      if (url.pathname.startsWith('/evidence-highlights/'))
        return Promise.resolve(typeof detail === 'function' ? detail() : detail);
      throw new Error(`Unexpected request ${url}`);
    }),
  );
}
function mount(search: Search) {
  current = { ...search };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <HostSeamProvider value={seam}>
        <EvidenceScreen renderDetail={renderDetail} />
      </HostSeamProvider>
    </QueryClientProvider>,
  );
}
/** Compares hrefs as parsed records, not as strings. */
function lastNavigation() {
  const call = navigate.mock.calls.at(-1);
  if (!call) throw new Error('no navigation');
  const url = new URL(call[0], 'http://feedbackops.local');
  return {
    path: url.pathname,
    record: Object.fromEntries(url.searchParams),
    options: call[1],
  };
}

beforeEach(() => {
  navigate.mockReset();
  canLink.mockReset();
  canLink.mockReturnValue(true);
  detailCalls.length = 0;
  listShell.detailPanels.length = 0;
  current = {};
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('pushes a source tab with every other key kept and the cursor dropped', async () => {
  installFetch();
  mount({ managedSystem: MS, q: '다운로드', cursor: 'c', selected: ID });
  fireEvent.mouseDown(await screen.findByRole('tab', { name: 'VOC' }), { button: 0 });
  expect(navigate).toHaveBeenCalledTimes(1);
  expect(lastNavigation()).toEqual({
    path: '/integration/evidence',
    record: { managedSystem: MS, source: 'voc', q: '다운로드', selected: ID },
    options: undefined,
  });
});

it('commits a trimmed search as a push without the cursor, and nothing for an unchanged draft', async () => {
  installFetch();
  mount({ source: 'note', cursor: 'c' });
  const box = await screen.findByRole('searchbox');
  fireEvent.change(box, { target: { value: ' x ' } });
  fireEvent.keyDown(box, { key: 'Enter' });
  expect(navigate).toHaveBeenCalledTimes(1);
  expect(lastNavigation()).toEqual({
    path: '/integration/evidence',
    record: { source: 'note', q: 'x' },
    options: undefined,
  });
  navigate.mockClear();
  cleanup();
  mount({ q: 'x' });
  const same = await screen.findByRole('searchbox');
  fireEvent.change(same, { target: { value: ' x ' } });
  fireEvent.keyDown(same, { key: 'Enter' });
  expect(navigate).not.toHaveBeenCalled();
});

it('pushes the page cursor for 더 보기 and drops it for 처음부터 보기', async () => {
  installFetch((url) =>
    response(
      url.searchParams.has('cursor')
        ? { items: [item], page: { has_more: false } }
        : { items: [item], page: { has_more: true, cursor: 'next-page' } },
    ),
  );
  mount({ source: 'note' });
  fireEvent.click(await screen.findByRole('button', { name: '더 보기' }));
  expect(navigate).toHaveBeenCalledTimes(1);
  expect(lastNavigation()).toEqual({
    path: '/integration/evidence',
    record: { source: 'note', cursor: 'next-page' },
    options: undefined,
  });
  navigate.mockClear();
  cleanup();
  mount({ source: 'note', cursor: 'later' });
  fireEvent.click(await screen.findByRole('button', { name: '처음부터 보기' }));
  expect(navigate).toHaveBeenCalledTimes(1);
  expect(lastNavigation()).toEqual({
    path: '/integration/evidence',
    record: { source: 'note' },
    options: undefined,
  });
});

it('replaces a rejected cursor with every other key kept', async () => {
  installFetch((url) =>
    url.searchParams.has('cursor')
      ? response(
          {
            code: 'validation.failed',
            detail: { fields: [{ path: ['cursor'], code: 'invalid_cursor' }] },
          },
          422,
        )
      : response({ items: [item], page: { has_more: false } }),
  );
  mount({ cursor: 'rejected', source: 'note', q: '다운로드', managedSystem: MS });
  await waitFor(() => expect(navigate).toHaveBeenCalledTimes(1));
  expect(lastNavigation()).toEqual({
    path: '/integration/evidence',
    record: { source: 'note', q: '다운로드', managedSystem: MS },
    options: { replace: true },
  });
});

it('selects a row by push and hands the panel to the host, never to ListShell', async () => {
  installFetch();
  mount({});
  fireEvent.click(await screen.findByRole('button', { name: /월간 다운로드/ }));
  expect(navigate).toHaveBeenCalledTimes(1);
  expect(lastNavigation()).toEqual({
    path: '/integration/evidence',
    record: { selected: ID },
    options: undefined,
  });
  expect(detailCalls).toHaveLength(0);
  act(() => setSearch({ selected: ID }));
  await screen.findByTestId('drawer');
  await waitFor(() => expect(detailCalls.length).toBeGreaterThan(0));
  expect(detailCalls[0]?.title).toBe('Evidence');
  expect(typeof detailCalls[0]?.requestClose).toBe('function');
  expect(listShell.detailPanels.length).toBeGreaterThan(0);
  expect(listShell.detailPanels.every((panel) => panel === undefined)).toBe(true);
});

it('does not select or navigate on its own without a selected key', async () => {
  installFetch();
  mount({ source: 'note' });
  await screen.findByRole('button', { name: /월간 다운로드/ });
  expect(detailCalls).toHaveLength(0);
  expect(navigate).not.toHaveBeenCalled();
});

it('closes by replace and returns focus to the originating row, or to the searchbox for a direct link', async () => {
  installFetch();
  mount({});
  const row = await screen.findByRole('button', { name: /월간 다운로드/ });
  fireEvent.click(row);
  act(() => setSearch({ selected: ID }));
  await screen.findByTestId('drawer');
  navigate.mockClear();
  fireEvent.click(screen.getByRole('button', { name: 'drawer close' }));
  expect(navigate).toHaveBeenCalledTimes(1);
  expect(lastNavigation()).toEqual({
    path: '/integration/evidence',
    record: {},
    options: { replace: true },
  });
  act(() => setSearch({}));
  await waitFor(() =>
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /월간 다운로드/ })),
  );
  cleanup();
  navigate.mockClear();
  mount({ selected: ID });
  await screen.findByTestId('drawer');
  fireEvent.click(screen.getByRole('button', { name: 'drawer close' }));
  expect(lastNavigation().options).toEqual({ replace: true });
  expect(lastNavigation().record).toEqual({});
  act(() => setSearch({}));
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('searchbox')));
});

it('leaves the Finding link and footer out when the host cannot link there', async () => {
  installFetch();
  canLink.mockImplementation((to) => to !== `/findings?selected=${PARENT}`);
  mount({ selected: ID });
  await waitFor(() => expect(screen.getAllByText('월간 다운로드가 느려졌습니다.')).toHaveLength(2));
  expect(screen.queryByRole('link', { name: 'Finding 보기' })).toBeNull();
  expect(document.querySelector('footer')).toBeNull();
  cleanup();
  canLink.mockReturnValue(true);
  mount({ selected: ID });
  const link = await screen.findByRole('link', { name: 'Finding 보기' });
  expect(link.getAttribute('href')).toBe(`/findings?selected=${PARENT}`);
});

it('links a VOC source only when the host can link to its route', async () => {
  installFetch(
    () => response({ items: [vocItem], page: { has_more: false } }),
    () => response(vocItem),
  );
  const route = `/vocs?selected=${PARENT}`;
  mount({ selected: ID });
  const link = await screen.findByRole('link', { name: 'VOC-77 · 원본 VOC' });
  expect(link.getAttribute('href')).toBe(route);
  cleanup();
  canLink.mockImplementation((to) => to !== route);
  mount({ selected: ID });
  await screen.findByTestId('drawer');
  await waitFor(() => expect(screen.getAllByText('VOC-77 · 원본 VOC').length).toBeGreaterThan(0));
  expect(screen.queryByRole('link', { name: 'VOC-77 · 원본 VOC' })).toBeNull();
});
