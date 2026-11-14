import { apiPath } from '@/lib/api/path';
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
      const query = new URLSearchParams();
      if (cursor) query.set('cursor', cursor);
      if (kind) query.set('kind', kind);
      const url = apiPath`/vocs/${vocId}/conversation` + (query.size ? '?' + query : '');
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
