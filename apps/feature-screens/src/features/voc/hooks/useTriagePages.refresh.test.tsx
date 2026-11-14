import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { expect, it, vi } from 'vitest';
import { useTriagePages } from './useTriagePages';

const apiClient = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api/client', () => ({ apiClient }));

it('refreshes appended pages after a triage mutation invalidates VOC reads', async () => {
  let processed = false;
  apiClient.mockImplementation(async (_method: string, url: string) => ({ data: url.includes('cursor=')
    ? { items: processed ? [] : [{ id: 'later', title: 'Later row' }], page: { has_more: false } }
    : { items: [{ id: 'first', title: 'First row' }], page: { has_more: true, cursor: 'next' } },
  }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const { result } = renderHook(() => useTriagePages({ view: 'triage', enabled: true }), { wrapper });
  await waitFor(() => expect(result.current.data?.items.map((item) => item.id)).toEqual(['first']));
  act(() => result.current.loadMore());
  await waitFor(() => expect(result.current.data?.items.map((item) => item.id)).toEqual(['first', 'later']));
  processed = true;
  await act(async () => { await client.invalidateQueries({ queryKey: ['vocs'] }); });
  await waitFor(() => expect(result.current.data?.items.map((item) => item.id)).toEqual(['first']));
});
