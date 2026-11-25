import { isAnswered, type AnalysisSelection, type ApiResponse, type Text } from '@ap/contracts';
import { formatText, type QueryState } from '@ap/kernel';
import { COMPONENTS_MESSAGES } from '../messages';

export type AnalysisSelectionFilter =
  | { kind: 'waiting' }
  | { kind: 'unfiltered' }
  | { kind: 'filtered'; selection: AnalysisSelection };

/** Pair the valid selection before availability checks with the receiver's applied filter. */
export function resolveAnalysisSelectionFilter({ requested, applied, source }: {
  requested: boolean;
  applied: AnalysisSelection | undefined;
  source: { availabilityCurrent: boolean; query?: Pick<QueryState<unknown>, 'status' | 'showingPrevious'> | undefined };
}): AnalysisSelectionFilter {
  const { availabilityCurrent, query } = source;
  // Only a requested selection waits; the applied filter alone decides filtering, as before the move (#2887 F1).
  if (requested && (!availabilityCurrent || query?.status === 'loading' || query?.showingPrevious)) return { kind: 'waiting' };
  return applied === undefined ? { kind: 'unfiltered' } : { kind: 'filtered', selection: applied };
}

/** Build the workspace badge from the receiving panel's current filtered response. */
export function getAnalysisSelectionFilterBadge<T>(
  filter: AnalysisSelectionFilter,
  query: { showingPrevious?: boolean; response: Pick<ApiResponse<T>, 'outcome' | 'data'> | null } | undefined,
  countPopulation: (data: T) => number | undefined,
): { count: number; description: Text } | undefined {
  if (filter.kind !== 'filtered' || query?.showingPrevious || !query?.response) return undefined;
  const { outcome, data } = query.response;
  if (!isAnswered(outcome)) return undefined;
  let count: number | undefined;
  if (outcome === 'empty') count = 0;
  else if (data !== null) count = countPopulation(data);
  if (count === undefined) return undefined;
  const message = COMPONENTS_MESSAGES.analysisSelectionFiltered;
  return { count, description: { ko: formatText(message, 'ko', { count }), en: formatText(message, 'en', { count }) } };
}
