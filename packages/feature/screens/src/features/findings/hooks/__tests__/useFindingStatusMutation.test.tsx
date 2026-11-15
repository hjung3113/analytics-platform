import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { PropsWithChildren } from 'react';
import { useFindingStatusMutation } from '../useFindingStatusMutation';

const id = '00000000-0000-4000-8000-000000000001';
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('accepts metadata without replacing the Finding detail cache', async () => {
  const metadata = { id, updated_at: '2026-11-15T00:00:00.000Z' };
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(metadata), { status: 200 })));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const original = { id, title: 'Synthetic cached Finding' };
  client.setQueryData(['finding', id], original);
  const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const { result } = renderHook(() => useFindingStatusMutation({ findingId: id, idempotencyKey: id }), { wrapper });
  await act(async () => { expect(await result.current.mutateAsync({ status: 'not_actionable' })).toEqual(metadata); });
  expect(client.getQueryData(['finding', id])).toEqual(original);
});
