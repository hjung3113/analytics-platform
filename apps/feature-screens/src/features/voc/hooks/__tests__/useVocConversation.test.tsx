import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { ReactNode } from 'react';

import { useVocConversation } from '../useVocConversation';

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const ENTRY = {
  id: '11111111-1111-4111-8111-111111111111',
  kind: 'public_update',
  actor_id: '22222222-2222-4222-8222-222222222222',
  body_rich_content: null,
  created_at: '2026-05-01T00:00:00Z',
  visibility: 'public',
  attachments: [],
};
const ENTRY_2 = { ...ENTRY, id: '33333333-3333-4333-8333-333333333333' };

describe('useVocConversation', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  test('fetches first page of conversation', async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      expect(url).toContain('/vocs/voc-1/conversation');
      return jsonResponse({ items: [ENTRY], page: { has_more: false } });
    }) as typeof globalThis.fetch;

    const { result } = renderHook(
      () => useVocConversation({ vocId: 'voc-1' }),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.pages[0]?.items).toHaveLength(1);
    expect(result.current.data?.pages[0]?.items[0]?.id).toBe(ENTRY.id);
  });

  test('includes kind filter in URL when specified', async () => {
    let capturedUrl = '';
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      capturedUrl = typeof input === 'string' ? input : input.toString();
      return jsonResponse({ items: [], page: { has_more: false } });
    }) as typeof globalThis.fetch;

    const { result } = renderHook(
      () => useVocConversation({ vocId: 'voc-1', kind: 'internal_comment' }),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(capturedUrl).toContain('kind=internal_comment');
  });

  test('getNextPageParam returns undefined when has_more=false (no more pages)', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({ items: [ENTRY], page: { cursor: 'cursor-abc', has_more: false } }),
    ) as typeof globalThis.fetch;

    const { result } = renderHook(
      () => useVocConversation({ vocId: 'voc-1' }),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // hasNextPage should be false when has_more=false
    expect(result.current.hasNextPage).toBe(false);
  });

  test('hasNextPage is true when has_more=true', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({ items: [ENTRY], page: { cursor: 'cursor-abc', has_more: true } }),
    ) as typeof globalThis.fetch;

    const { result } = renderHook(
      () => useVocConversation({ vocId: 'voc-1' }),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.hasNextPage).toBe(true);
  });

  test('fetchNextPage sends the server cursor and appends the second page', async () => {
    const urls: string[] = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      urls.push(url);
      return url.includes('cursor=cursor-abc')
        ? jsonResponse({ items: [ENTRY_2], page: { has_more: false } })
        : jsonResponse({ items: [ENTRY], page: { cursor: 'cursor-abc', has_more: true } });
    }) as typeof globalThis.fetch;

    const { result } = renderHook(
      () => useVocConversation({ vocId: 'voc-1' }),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.hasNextPage).toBe(true));
    await act(async () => {
      await result.current.fetchNextPage();
    });
    await waitFor(() => expect(result.current.data?.pages).toHaveLength(2));
    expect(urls[1]).toContain('cursor=cursor-abc');
    expect(result.current.data?.pages[1]?.items[0]?.id).toBe(ENTRY_2.id);
    expect(result.current.hasNextPage).toBe(false);
  });
});
