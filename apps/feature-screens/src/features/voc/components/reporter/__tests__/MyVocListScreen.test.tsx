import { REPORTER_STATUS_LABELS } from '@/lib/copy/reporter-status-labels';
import type { VocListItem } from '@ap/feature-shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MyVocListScreen } from '../MyVocListScreen';
import type { MyVocQuery } from '../my-voc-query';

const ID_1 = '11111111-1111-4111-8111-111111111111';
const ID_2 = '22222222-2222-4222-8222-222222222222';
const OWNER = '99999999-9999-4999-8999-999999999999';

// Carries every operator field the backend list row still holds for a reporter (read/mappers.ts).
function row(id: string, title: string, over: Partial<VocListItem> = {}): VocListItem {
  return {
    id,
    display_id: `VOC-${id.slice(0, 2)}`,
    title,
    primary_managed_system_id: '33333333-3333-4333-8333-333333333333',
    analytics_area_id: null,
    reporter_id: '44444444-4444-4444-8444-444444444444',
    owner_user_id: OWNER,
    owner_team_id: null,
    severity: 'critical',
    reporter_facing_status: 'reviewing',
    triage_state: 'triaged',
    review_postponed_at: null,
    source_context: 'direct_use',
    created_at: '2026-07-20T00:00:00.000Z',
    updated_at: '2026-07-21T00:00:00.000Z',
    similar_count: 3,
    attachment_count: 0,
    ...over,
  };
}

function stubFetch(items: VocListItem[], status = 200) {
  const paths: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      paths.push(String(input));
      return new Response(
        JSON.stringify(
          status === 200
            ? { items, page: { has_more: false } }
            : { code: 'internal.unexpected', message: 'x' },
        ),
        {
          status,
          headers: { 'content-type': 'application/json' },
        },
      );
    }),
  );
  return paths;
}

const QUERY: MyVocQuery = { q: '', statuses: [], sort: 'created_at:desc' };

function mount(over: Partial<React.ComponentProps<typeof MyVocListScreen>> = {}) {
  const onQueryChange = vi.fn();
  const onSelect = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MyVocListScreen
        query={QUERY}
        onQueryChange={onQueryChange}
        selectedId={null}
        onSelect={onSelect}
        {...over}
      />
    </QueryClientProvider>,
  );
  return { onQueryChange, onSelect };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('<MyVocListScreen>', () => {
  it('requests only GET /vocs?view=my, with the status filter, and shows no operator cue on a row that carries them', async () => {
    const paths = stubFetch([row(ID_1, '로그인이 안 됩니다')]);
    mount({ query: { q: '로그인', statuses: ['reviewing', 'closed'], sort: 'created_at:asc' } });
    const found = await screen.findByText('로그인이 안 됩니다');
    const rowEl = found.closest('[role="row"]') as HTMLElement;
    expect(within(rowEl).getByText(`VOC-${ID_1.slice(0, 2)}`)).toBeTruthy();
    expect(within(rowEl).getByText(REPORTER_STATUS_LABELS.reviewing)).toBeTruthy();
    // No severity badge or bar colour, no Analytics Area cue, no owner or unassigned cue.
    expect(rowEl.textContent).not.toMatch(/critical|심각|Critical|Analytics Area|미배정/);
    expect(rowEl.querySelector('[class*="severity"]')).toBeNull();
    expect(rowEl.querySelector('[data-testid="voc-row-left-bar"]')?.className).not.toContain(
      'severity',
    );

    expect(paths).toHaveLength(1);
    const url = new URL(paths[0] ?? '', 'http://x');
    expect(url.pathname).toBe('/vocs');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      view: 'my',
      q: '로그인',
      'filter.reporter_facing_status': 'reviewing,closed',
      sort: 'created_at:asc',
      limit: '50',
    });
  });

  it('selects a row on click and on Enter', async () => {
    stubFetch([row(ID_1, '첫째'), row(ID_2, '둘째')]);
    const { onSelect } = mount();
    await userEvent.setup().click(await screen.findByText('둘째'));
    expect(onSelect).toHaveBeenLastCalledWith(ID_2);
    screen.getByText('첫째').closest<HTMLElement>('[role="row"]')?.focus();
    await userEvent.setup().keyboard('{Enter}');
    expect(onSelect).toHaveBeenLastCalledWith(ID_1);
  });

  it.each([
    ['no VOC and no filter', QUERY, '내가 제출한 VOC가 없습니다'],
    ['a search', { ...QUERY, q: '없는말' }, '검색 결과가 없습니다.'],
    [
      'a status filter',
      { ...QUERY, statuses: ['closed' as const] },
      '현재 조건에 맞는 VOC가 없습니다',
    ],
  ])('shows the empty state for %s without any button', async (_name, query, title) => {
    stubFetch([]);
    mount({ query });
    const state = await screen.findByTestId('list-state-message');
    expect(within(state).getByText(title)).toBeTruthy();
    expect(within(state).queryByRole('button')).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('shows the load error with a retry button', async () => {
    stubFetch([], 500);
    mount();
    // The list query retries once (1 s) before it reports the error.
    const alert = await screen.findByRole('alert', {}, { timeout: 4000 });
    expect(within(alert).getByText('불러오기 실패')).toBeTruthy();
    expect(within(alert).getByRole('button', { name: '다시 시도' })).toBeTruthy();
  });

  it('offers exactly the 8 reporter statuses and 3 sorts, and reports changes', async () => {
    stubFetch([row(ID_1, '첫째')]);
    const user = userEvent.setup();
    const { onQueryChange } = mount();
    await screen.findByText('첫째');

    await user.click(screen.getByRole('button', { name: /필터/ }));
    expect(screen.getAllByRole('checkbox')).toHaveLength(8);
    expect(screen.getByText(REPORTER_STATUS_LABELS.closed)).toBeTruthy();
    await user.click(screen.getByText(REPORTER_STATUS_LABELS.closed));
    expect(onQueryChange).toHaveBeenLastCalledWith({ statuses: ['closed'] });
  });

  it('commits the search draft on Enter as onQueryChange({ q })', async () => {
    stubFetch([row(ID_1, '첫째')]);
    const user = userEvent.setup();
    const { onQueryChange } = mount();
    await screen.findByText('첫째');
    await user.type(screen.getByRole('searchbox'), '툴팁{Enter}');
    await waitFor(() => expect(onQueryChange).toHaveBeenCalledWith({ q: '툴팁' }));
  });
});
