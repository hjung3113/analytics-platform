import { useCallback } from 'react';
import type { ApiResponse, EndpointSpec } from '@ap/contracts';
import { isAnswered } from '@ap/contracts';
import { useMenuFetch } from '@ap/kernel';
import type { PageConditionOptions, PageConditionOptionsLoader } from './pageConditionOptions';

/** Keeps the server outcome taxonomy when adapting the declared endpoint to a loader. */
export class PageConditionOptionsError extends Error {
  constructor(readonly response: ApiResponse<unknown>) {
    super(response.message ?? response.outcome);
    this.name = 'PageConditionOptionsError';
  }
}
/**
 * One declared endpoint, retaining useMenuFetch's permission/Scope gates and abort signal.
 * Compose loaders for multiple endpoints at the caller. Include session generation, Scope,
 * projected Context, params and readiness in the renderer's inputsKey; no shared option cache.
 */
export function usePageConditionOptionsLoader<P, T extends PageConditionOptions>(spec: EndpointSpec<P, T>, params: P): { ready: boolean; loadOptions: PageConditionOptionsLoader } {
  const { ready, fetch } = useMenuFetch(spec);
  const loadOptions = useCallback<PageConditionOptionsLoader>(async (category, { signal }) => {
    const kind = category.kind;
    let endpoint: string | undefined;
    if (kind.type === 'groupedChecks') endpoint = kind.source;
    else if ((kind.type === 'select' || kind.type === 'multi') && 'endpoint' in kind.options) endpoint = kind.options.endpoint;
    if (endpoint !== spec.id) throw new Error('Option endpoint does not match the category declaration');
    const response = await fetch(params, signal);
    if (isAnswered(response.outcome) && response.data !== undefined && response.data !== null) return response.data;
    throw new PageConditionOptionsError(response);
  }, [fetch, params, spec.id]);
  return { ready, loadOptions };
}
