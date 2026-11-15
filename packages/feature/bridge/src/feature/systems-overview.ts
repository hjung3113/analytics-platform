import { useQuery } from '@tanstack/react-query';
import { featureApi } from '../feature-api';
import { FeatureReadError, fetchAllManagedSystems, fetchSpaceLinks, type ManagedSystemRow, type SpaceLinks } from './space-links';

export type SystemsOverviewData = SpaceLinks & { systems: readonly ManagedSystemRow[] };

/**
 * The 「시스템」 screen's data: the space links and every Managed System (archived included), read together so a row never shows a link without its name.
 * Runs only inside `FeatureBridge` (its query client, cleared per session generation).
 */
export function useSystemsOverview() {
  const query = useQuery({
    // A 4xx answer (a lost session, a denial) will not change on a retry; anything else gets one more try.
    retry: (failureCount, error) => !(error instanceof FeatureReadError && error.status >= 400 && error.status < 500) && failureCount < 1,
    retryDelay: 500,
    queryKey: ['platform', 'systems-overview'],
    queryFn: async ({ signal }): Promise<SystemsOverviewData> => {
      const api = featureApi();
      if (api === null) throw new Error('no feature api');
      const [links, systems] = await Promise.all([fetchSpaceLinks(api, signal), fetchAllManagedSystems(api, signal)]);
      return { ...links, systems };
    },
  });
  return { status: query.status, data: query.data, refetch: () => { void query.refetch(); }, fetching: query.isFetching };
}
