import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchManagedSystems } from '../../lib/api/registry-reads';
import { PERMISSION_BLOCKED_REASONS } from '../../lib/copy/permission-reasons';
import { managedSystemNamesQueryKey } from '../../lib/cross-system/useManagedSystemNames';
import { PermissionDeniedCard } from '../PermissionDeniedCard';
import { ScopedListDenialCard } from '../ScopedListDenialCard';

vi.mock('../../lib/api/registry-reads', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/api/registry-reads')>()),
  fetchManagedSystems: vi.fn(),
}));

const MS = '30000000-0000-0000-0000-000000000003';
const catalog = vi.mocked(fetchManagedSystems);

function newClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

beforeEach(() => {
  catalog.mockReset();
});

describe('PermissionDeniedCard System name (#2768)', () => {
  it('shows the System name once the shared catalog arrives after the card mounted, without reading it itself', async () => {
    const client = newClient();
    render(
      <QueryClientProvider client={client}>
        <PermissionDeniedCard layout="card" category="Task 목록" capability="task.read" managedSystemId={MS} />
      </QueryClientProvider>,
    );
    expect(screen.queryByText(/Billing Ops/)).not.toBeInTheDocument();

    act(() => {
      client.setQueryData(managedSystemNamesQueryKey, { items: [{ id: MS, name: 'Billing Ops', archived_at: null }] });
    });

    expect(await screen.findByText(/· Billing Ops$/)).toBeInTheDocument();
    expect(catalog).not.toHaveBeenCalled();
  });
});

describe('ScopedListDenialCard after a failed catalog read (#2768)', () => {
  it('does not read the catalog again on mount and offers the read, then names the archive', async () => {
    const client = newClient();
    catalog.mockRejectedValueOnce(new Error('catalog down'));
    await client.prefetchQuery({ queryKey: managedSystemNamesQueryKey, queryFn: () => fetchManagedSystems({}) });
    catalog.mockClear();
    catalog.mockResolvedValue({ items: [{ id: MS, name: 'Billing Ops', archived_at: '2026-01-01T00:00:00Z' }] } as never);

    render(
      <QueryClientProvider client={client}>
        <ScopedListDenialCard
          category="Task 목록"
          reason={PERMISSION_BLOCKED_REASONS.taskList}
          returnRouteIntent="/tasks"
          deniedRef={createRef<HTMLDivElement>()}
          capability="finding.manage"
          managedSystemId={MS}
        />
      </QueryClientProvider>,
    );
    expect(screen.getByText(PERMISSION_BLOCKED_REASONS.taskList)).toBeInTheDocument();
    expect(catalog).not.toHaveBeenCalled();
    // Owner A: the card's one button row holds every action, the retry first.
    const retry = screen.getByRole('button', { name: '다시 시도' });
    expect(retry.closest('[data-state="denied"]')).not.toBeNull();
    expect(retry.parentElement?.firstElementChild).toBe(retry);

    await userEvent.click(retry);

    expect(await screen.findByText(PERMISSION_BLOCKED_REASONS.archivedSystem)).toBeInTheDocument();
    expect(catalog).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: '다시 시도' })).not.toBeInTheDocument();
  });
});
