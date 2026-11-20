import type { QueryClient } from '@tanstack/react-query';
import { resetNavCounts } from '../../../lib/query/navCounts';

const DETAIL_PREFIXES = [
  ['voc'],
  ['voc-conversation'],
  ['voc-public'],
  ['voc-public-update-candidates'],
  ['voc-recommendations'],
] as const;

export function evictDeniedVocRead(client: QueryClient, deniedListKeyHash: string): void {
  const lists = { queryKey: ['vocs'] };
  for (const query of client.getQueryCache().findAll(lists)) {
    // The observer can retain the previous query for search placeholders after removal.
    query.setState({ data: undefined });
  }
  // Keep the active 403 and its observer in place so settlement cannot start another read.
  client.removeQueries({ ...lists, predicate: (query) => query.queryHash !== deniedListKeyHash });
  for (const queryKey of DETAIL_PREFIXES) client.removeQueries({ queryKey });
  resetNavCounts(client);
}
