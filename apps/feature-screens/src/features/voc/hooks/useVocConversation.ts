import { apiRequest } from '@/lib/api/client';
import { type ConversationPage, conversationPageSchema } from '@ap/feature-shared';
import { type UseInfiniteQueryResult, useInfiniteQuery } from '@tanstack/react-query';

export type { ConversationPage };

export interface UseVocConversationParams {
  vocId: string;
  kind?: 'public_update' | 'reporter_reply' | 'internal_comment';
}

export function useVocConversation(
  params: UseVocConversationParams,
): UseInfiniteQueryResult<{ pages: ConversationPage[] }> {
  const { vocId, kind } = params;

  return useInfiniteQuery({
    queryKey: ['voc-conversation', vocId, kind] as const,
    queryFn: async ({ pageParam, signal }) => {
      const cursor = pageParam as string;
      const cursorPart = cursor ? `cursor=${encodeURIComponent(cursor)}` : '';
      const kindPart = kind ? `kind=${encodeURIComponent(kind)}` : '';
      const queryParts = [cursorPart, kindPart].filter(Boolean).join('&');
      const url = `/vocs/${vocId}/conversation${queryParts ? `?${queryParts}` : ''}`;
      const res = await apiRequest('GET', url, conversationPageSchema, { signal });
      return res.data;
    },
    initialPageParam: '',
    getNextPageParam: (lastPage: ConversationPage) =>
      lastPage.page.has_more ? lastPage.page.cursor : undefined,
    enabled: Boolean(vocId),
    staleTime: 10_000,
  });
}
