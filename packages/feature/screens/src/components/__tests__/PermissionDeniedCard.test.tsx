import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { managedSystemNamesQueryKey } from '../../lib/cross-system/useManagedSystemNames';
import { PermissionDeniedCard } from '../PermissionDeniedCard';

const MS = '30000000-0000-0000-0000-000000000003';

describe('PermissionDeniedCard System name (#2768)', () => {
  it('shows the System name once the shared catalog arrives after the card mounted', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
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
  });
});
