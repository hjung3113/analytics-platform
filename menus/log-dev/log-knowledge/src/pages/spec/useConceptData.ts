/**
 * Hook-level data access of the concept mapping review and the spec detail's «관련 Item» list (#1196 e/f), the node d
 * pattern: reads through `useMenuQuery` / `usePlatformQuery`, writes through `useMenuAction`. Screens only render.
 * A concept write invalidates the mapping list and the suggestions (the action declares it), so a screen that holds
 * these queries re-reads after `run` by bumping its `epoch`.
 */
import { useMenuAction, useMenuFetch, useMenuQuery, usePlatformQuery, type QueryState } from '@ap/kernel';
import {
  conceptConfirm, conceptMappingsEndpoint, conceptPropose, conceptReject, conceptSuggestionsEndpoint, specSubjectItemsEndpoint,
  type ConceptKind, type ConceptMappingRow, type ConceptMappingsParams, type ConceptSuggestionsResult, type SpecSubjectItemRow,
} from '../../endpoints';

const PAGE = 200;

/**
 * A requested server page, or all pages when no page is supplied (newest proposal first). Omit `modelId` for the partner rows of other models
 * (a concept's other members); pass `conceptId` to read one concept.
 */
export function useConceptMappings(filter: ConceptMappingsParams, enabled: boolean, epoch = 0): QueryState<{ rows: ConceptMappingRow[]; total: number }> {
  const read = useMenuFetch(conceptMappingsEndpoint);
  return usePlatformQuery(async signal => {
    const rows: ConceptMappingRow[] = [];
    for (let page = filter.page ?? 0; ; page++) {
      const response = await read.fetch({ ...filter, page, pageSize: filter.pageSize ?? PAGE }, signal);
      if (response.outcome !== 'ok' || !response.data) return response;
      rows.push(...response.data.rows);
      if (filter.page !== undefined || rows.length >= response.data.total || response.data.rows.length === 0) return { ...response, data: { rows, total: response.data.total } };
    }
  }, [filter.modelId, filter.conceptId, filter.reviewState, filter.kind, filter.page, filter.pageSize, epoch], enabled);
}

/** The similarity proposals of one model (`proposal: true`, never an equivalence); `data.truncated` = the list is incomplete. */
export function useConceptSuggestions(modelId: string, kind: ConceptKind | undefined, enabled: boolean, epoch = 0, pageNumber?: number): QueryState<ConceptSuggestionsResult> {
  const read = useMenuFetch(conceptSuggestionsEndpoint);
  return usePlatformQuery(async signal => {
    const rows: ConceptSuggestionsResult['rows'] = [];
    for (let page = pageNumber ?? 0; ; page++) {
      const response = await read.fetch({ modelId, ...(kind ? { kind } : {}), page, pageSize: pageNumber === undefined ? PAGE : 20 }, signal);
      if (response.outcome !== 'ok' || !response.data) return response;
      rows.push(...response.data.rows);
      if (pageNumber !== undefined || rows.length >= response.data.total || !response.data.rows.length) return { ...response, data: { ...response.data, rows } };
    }
  }, [modelId, kind, epoch, pageNumber], enabled);
}

/** The three concept writes. `confirm` / `reject` take the row's `version` as `expectedVersion`; a `conflict` answer means re-read first. */
export function useConceptActions() {
  const propose = useMenuAction(conceptPropose), confirm = useMenuAction(conceptConfirm), reject = useMenuAction(conceptReject);
  return {
    ready: propose.ready && confirm.ready && reject.ready,
    pending: propose.pending || confirm.pending || reject.pending,
    propose: propose.run,
    confirm: (mappingId: string, version: number | string) => confirm.run({ mappingId }, { expectedVersion: String(version) }),
    reject: (mappingId: string, reason: string, version: number | string) => reject.run({ mappingId, reason }, { expectedVersion: String(version) }),
  };
}

/** Published Items whose latest revision is about one module / event (the spec detail's «이 이벤트를 다룬 Item»). */
export function useSpecSubjectItems(modelId: string, targetKey: string | null, enabled: boolean, page = 0): QueryState<{ rows: SpecSubjectItemRow[]; total: number }> {
  return useMenuQuery(specSubjectItemsEndpoint, { modelId, targetKey: targetKey ?? '', page, pageSize: PAGE }, enabled && targetKey !== null && targetKey !== '');
}
