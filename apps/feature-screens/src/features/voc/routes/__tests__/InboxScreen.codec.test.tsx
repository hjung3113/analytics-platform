// InboxScreen.codec.test.tsx — the inbox under the standalone router with the app's search codec (#761 i, F1):
// a JSON-like search term keeps its meaning in the box, the list query and the URL after another write.

import { stringifyAppSearch } from '@/test/host-adapters/lib/router/search-serialization';
import { parseAppSearch } from '@/test/host-adapters/lib/router/search-serialization';
import { DetailPanelSlotProvider, useDetailPanelSlotHost } from '@ap/ui';
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InboxScreen } from '../InboxScreen';

const VOC = '33333333-3333-4333-8333-333333333333';
const listParams = vi.hoisted(() => vi.fn());

vi.mock('../../hooks/useVocListPages', () => ({
  useVocListPages: (params: unknown) => {
    listParams(params);
    return {
      data: { pages: [{ items: [], page: { has_more: false } }], pageParams: [undefined] },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
      isFetchNextPageError: false,
      fetchNextPage: vi.fn(),
    };
  },
}));
vi.mock('../../components/VocAreaFilterSelect', () => ({ VocAreaFilterSelect: () => null }));
vi.mock('@/lib/useAnalyticsAreaFilterLabel', () => ({ useAnalyticsAreaFilterLabel: () => 'Area' }));
vi.mock('../../components/list/VocList', () => ({
  VocList: ({ onSelect }: { onSelect: (id: string) => void }) => (
    <button type="button" onClick={() => onSelect(VOC)}>
      VOC 선택
    </button>
  ),
}));

function DetailPanelSlotHost() {
  const { ref } = useDetailPanelSlotHost();
  return <div ref={ref} />;
}
function Inbox() {
  return (
    <DetailPanelSlotProvider>
      <InboxScreen view="inbox" renderDetail={() => null} />
      <DetailPanelSlotHost />
    </DetailPanelSlotProvider>
  );
}

function mountAt(entry: string) {
  const root = createRootRoute({ component: Outlet });
  const route = createRoute({ getParentRoute: () => root, path: '/vocs', component: Inbox });
  const router = createRouter({
    routeTree: root.addChildren([route]),
    history: createMemoryHistory({ initialEntries: [entry] }),
    parseSearch: parseAppSearch,
    stringifySearch: stringifyAppSearch,
  });
  render(<RouterProvider router={router} />);
  return router;
}

const urlOf = (q: string) => `/vocs?view=inbox&${stringifyAppSearch({ q }).slice(1)}`;

beforeEach(() => listParams.mockClear());

describe('InboxScreen search term through the standalone codec', () => {
  it.each([
    ['true', urlOf('true'), 'true', urlOf('true')],
    ['null', urlOf('null'), 'null', urlOf('null')],
    ['"quoted"', urlOf('"quoted"'), '"quoted"', urlOf('"quoted"')],
    ['a legacy quoted number', '/vocs?view=inbox&q=%22123%22', '123', '/vocs?view=inbox&q=123'],
    ['a bare number', '/vocs?view=inbox&q=123', '123', '/vocs?view=inbox&q=123'],
    ['a legacy bare true', '/vocs?view=inbox&q=true', 'true', urlOf('true')],
  ])(
    'keeps %s as the same text in the box, the list query and the URL',
    async (_name, entry, q, after) => {
      const router = mountAt(entry);
      const box = await screen.findByRole('searchbox', { name: '제목 또는 ID' });
      expect(box).toHaveValue(q);
      expect(listParams).toHaveBeenLastCalledWith(expect.objectContaining({ q }));
      fireEvent.click(screen.getByRole('button', { name: 'VOC 선택' }));
      await waitFor(() =>
        expect((router.state.location.search as Record<string, unknown>).selected).toBe(VOC),
      );
      const expected = new URL(after, 'http://x');
      const actual = new URL(router.history.location.href, 'http://x');
      expect(actual.searchParams.get('q')).toBe(expected.searchParams.get('q'));
      expect(parseAppSearch(actual.search).q).toBe(q);
    },
  );

  it('typing a JSON-like term writes it as that text', async () => {
    vi.useFakeTimers();
    try {
      const router = mountAt('/vocs?view=inbox');
      await vi.advanceTimersByTimeAsync(0);
      fireEvent.change(screen.getByRole('searchbox', { name: '제목 또는 ID' }), {
        target: { value: 'true' },
      });
      fireEvent.keyDown(screen.getByRole('searchbox', { name: '제목 또는 ID' }), { key: 'Enter' });
      await vi.advanceTimersByTimeAsync(500);
      expect(router.history.location.search).toBe(
        `?view=inbox&${stringifyAppSearch({ q: 'true' }).slice(1)}`,
      );
      expect(screen.getByRole('searchbox', { name: '제목 또는 ID' })).toHaveValue('true');
    } finally {
      vi.useRealTimers();
    }
  });
});
