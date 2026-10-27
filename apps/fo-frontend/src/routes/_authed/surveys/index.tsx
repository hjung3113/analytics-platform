// /surveys — the list is `SurveysScreen` (bridge-safe, entry `operator-screens/surveys`); this route composes it with the Survey
// detail aside through a route-local seam.

import { SurveyDetail } from '@/features/surveys/components/detail/SurveyDetail';
import { SurveysScreen, type SurveysScreenProps } from '@/features/surveys/routes/SurveysScreen';
import {
  surveysSearchSchema,
  validateSurveysSearch,
} from '@/features/surveys/routes/surveys-search';
export { CreateSurveyDialog } from '@/features/surveys/components/create/CreateSurveyDialog';
import { type HostNavigate, HostSeamProvider, useHostSeam } from '@/lib/host/host-seam';
import { createFileRoute, useNavigate, useSearch } from '@tanstack/react-router';
import * as React from 'react';

export { surveysSearchSchema, validateSurveysSearch };

// #982: the router plugin skips code-splitting when the route component is an
// exported local (hasExport check). The alias keeps the page exported for
// tests while letting the route component split into its own chunk.
const SurveysIndexRouteSplit = SurveysIndexRoute;

export const Route = createFileRoute('/_authed/surveys/')({
  validateSearch: validateSurveysSearch,
  component: SurveysIndexRouteSplit,
});

const SEARCH_KEYS = [
  'platformReturn',
  'managedSystem',
  'selected',
  'filter.analytics_area',
  'status',
  'follow_up',
] as const;

/** TanStack's search for this route as the strings the screen reads (`undefined` dropped), a new object per router search object. */
function useSurveysSearch(): Readonly<Record<string, string>> {
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  return React.useMemo(
    () =>
      Object.fromEntries(
        Object.entries(search).flatMap(([key, value]) =>
          value === undefined ? [] : [[key, String(value)]],
        ),
      ),
    [search],
  );
}

/**
 * The standalone host's navigate: TanStack `useNavigate()` with a functional `search`, so the URL keeps the keys the
 * screen does not own and the router's own handling of each write (push vs replace) is unchanged.
 */
function useSurveysNavigate(): HostNavigate {
  const navigate = useNavigate();
  return React.useCallback(
    (href, options) => {
      const location = new URL(href, 'http://feedbackops.local');
      const replace = options?.replace === true;
      if (location.pathname !== '/surveys') {
        // The detail route's `builder` is a boolean in the router's search.
        const search = Object.fromEntries(
          [...location.searchParams].map(([key, value]) => [
            key,
            key === 'builder' && value === 'true' ? true : value,
          ]),
        );
        void navigate({ to: location.pathname as never, search: search as never, replace });
        return;
      }
      void navigate({
        to: '/surveys',
        replace,
        search: ((previous: Record<string, unknown>) => {
          const next = { ...previous };
          for (const key of SEARCH_KEYS) delete next[key];
          for (const [key, value] of location.searchParams) next[key] = value;
          return next;
        }) as never,
      });
    },
    [navigate],
  );
}

const renderStandaloneDetail: SurveysScreenProps['renderDetail'] = (
  _selectedId,
  { close, survey, canManage, managedSystemNamesById, actorNamesById },
) =>
  survey ? (
    <SurveyDetail
      survey={survey}
      canManage={canManage}
      onClose={close}
      managedSystemNamesById={managedSystemNamesById}
      actorNamesById={actorNamesById}
    />
  ) : null;

export function SurveysIndexRoute() {
  const base = useHostSeam();
  const seam = React.useMemo(
    () => ({ ...base, useSearch: useSurveysSearch, useNavigate: useSurveysNavigate }),
    [base],
  );
  return (
    <HostSeamProvider value={seam}>
      <SurveysScreen renderDetail={renderStandaloneDetail} />
    </HostSeamProvider>
  );
}
