import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useVocCreateMutation } from '../useVocCreateMutation';

const apiClientMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  apiClient: apiClientMock,
}));

describe('useVocCreateMutation', () => {
  it('marks the VOC lists stale once the VOC is created, so reopening a list shows it', async () => {
    apiClientMock.mockResolvedValue({ data: { id: 'voc-1', display_id: 'VOC-1001' } });
    const queryClient = new QueryClient();
    const listKey = ['vocs', 'public', 'pages', { mine: false }];
    const pickerKey = ['findings', 'voc-source-picker', 'system-1', ''];
    queryClient.setQueryData(listKey, { pages: [] });
    queryClient.setQueryData(pickerKey, { items: [] });
    const wrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useVocCreateMutation({ idempotencyKey: 'key-1' }), { wrapper });

    expect(queryClient.getQueryState(listKey)?.isInvalidated).toBe(false);
    await act(async () => {
      result.current.mutate({} as never);
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryState(listKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(pickerKey)?.isInvalidated).toBe(true);
  });
});
