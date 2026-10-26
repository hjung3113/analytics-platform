// LinksScreen.seam.test.tsx — every URL write of the entity-link list through the host seam (#762 c): the
// complete FeedbackOps href, `managedSystem` carried and never set by the screen, absent means cleared, push.

import { type HostSeam, HostSeamProvider } from '@/lib/host/host-seam';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LinksScreen } from '../LinksScreen';

const MS = '77777777-0000-0000-0000-0000000000a1';
const ACTOR = '88888888-0000-0000-0000-0000000000a1';

const LINKS = [
  {
    id: '11111111-0000-0000-0000-0000000000a1',
    source_type: 'voc',
    source_id: '33333333-0000-0000-0000-0000000000a1',
    target_type: 'voc',
    target_id: '44444444-0000-0000-0000-0000000000b1',
    relation_type: 'related_to',
    visibility: 'internal_only',
    status: 'active',
    managed_system_id: MS,
    created_by: ACTOR,
    created_at: '2026-06-18T01:00:00.000Z',
    updated_at: '2026-06-18T01:00:00.000Z',
    visibility_state: 'allowed',
  },
];

const navigated: Array<{ href: string; options: { replace?: boolean } | undefined }> = [];
const requests: URL[] = [];

const SearchContext = React.createContext<Record<string, string>>({});

function Harness({
  initial,
  children,
}: { initial: Record<string, string>; children: React.ReactNode }) {
  const [search, setSearch] = React.useState(initial);
  const navigate = React.useCallback((href: string, options?: { replace?: boolean }) => {
    navigated.push({ href, options });
    setSearch(Object.fromEntries(new URL(href, 'http://feedbackops.local').searchParams));
  }, []);
  const seam = React.useMemo<HostSeam>(
    () => ({
      canLink: () => true,
      Link: ({ to, children: content }) => <a href={to}>{content}</a>,
      notifyError: () => {},
      notifySuccess: () => {},
      useNavigate: () => navigate,
      useSearch: () => React.useContext(SearchContext),
    }),
    [navigate],
  );
  return (
    <SearchContext.Provider value={search}>
      <HostSeamProvider value={seam}>{children}</HostSeamProvider>
    </SearchContext.Provider>
  );
}

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status });
}

beforeEach(() => {
  navigated.length = 0;
  requests.length = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string) => {
      const url = new URL(input, 'http://localhost');
      requests.push(url);
      if (url.pathname.endsWith('/entity-links')) {
        const status = url.searchParams.get('status');
        return json({
          items: status === null ? LINKS : LINKS.filter((link) => link.status === status),
        });
      }
      if (url.pathname === '/managed-systems') return json({ items: [], total: 0 });
      if (url.pathname.endsWith('/actors/resolve')) return json({ actors: [], teams: [] });
      return json({ code: 'internal.unexpected', message: input }, 500);
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function mount(initial: Record<string, string>) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <Harness initial={initial}>
        <LinksScreen />
      </Harness>
    </QueryClientProvider>,
  );
  await waitFor(() => expect(screen.getAllByRole('tab').length).toBeGreaterThan(0));
}

function written(index = -1) {
  const entry = navigated.at(index);
  if (entry === undefined) throw new Error('nothing was written');
  const url = new URL(entry.href, 'http://feedbackops.local');
  return {
    path: url.pathname,
    search: Object.fromEntries(url.searchParams),
    replace: entry.options?.replace === true,
  };
}

describe('LinksScreen writes through the host seam', () => {
  it('a status tab sets status and keeps type and managedSystem', async () => {
    await mount({ type: 'related_to', managedSystem: 'x' });
    await userEvent.click(screen.getByRole('tab', { name: /^활성/ }));
    expect(written()).toEqual({
      path: '/integration/links',
      search: { status: 'active', type: 'related_to', managedSystem: 'x' },
      replace: false,
    });
  });

  it('the all tab drops status and keeps type and managedSystem', async () => {
    await mount({ status: 'active', type: 'related_to', managedSystem: 'x' });
    await userEvent.click(screen.getByRole('tab', { name: /^전체/ }));
    expect(written().search).toEqual({ type: 'related_to', managedSystem: 'x' });
  });

  it('clearing the type filter keeps status and managedSystem', async () => {
    await mount({ status: 'active', type: 'related_to', managedSystem: 'x' });
    await userEvent.click(screen.getByRole('button', { name: /^필터/ }));
    await userEvent.click(screen.getByRole('checkbox', { name: '관련 항목' }));
    expect(written().search).toEqual({ status: 'active', managedSystem: 'x' });
  });

  it('resetting a filtered miss keeps only managedSystem', async () => {
    await mount({ status: 'revoked', managedSystem: 'x' });
    await userEvent.click(await screen.findByRole('button', { name: '필터 초기화' }));
    expect(written()).toEqual({
      path: '/integration/links',
      search: { managedSystem: 'x' },
      replace: false,
    });
  });
});

describe('LinksScreen reads', () => {
  it.each(['x', 'all'])('sends managedSystem %s to the inventory read', async (managedSystem) => {
    await mount({ managedSystem });
    await screen.findByText('11111111');
    const scoped = requests
      .filter((url) => url.pathname.endsWith('/entity-links'))
      .map((url) => url.searchParams.get('managed_system_id'));
    expect(scoped.length).toBeGreaterThan(0);
    if (managedSystem === 'all') expect(scoped.every((value) => value === null)).toBe(true);
    else expect(scoped.every((value) => value === 'x')).toBe(true);
  });

  it('keeps the inert search box and the row checkboxes (D8)', async () => {
    await mount({});
    expect(screen.getByPlaceholderText('엔티티 링크 검색…')).toBeInTheDocument();
    expect(await screen.findAllByRole('checkbox', { name: /선택$/ })).toHaveLength(1);
  });
});
