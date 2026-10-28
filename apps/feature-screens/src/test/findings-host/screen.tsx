// Test-local screen host; retained fixtures exercise URL writes and history.
// /findings — ADR-0020 ListShell finding list + right detail panel. The list is `FindingsScreen` (bridge-safe, entry
// `operator-screens/findings`); this route composes it with the Finding detail panel through a route-local seam.

import {
  FindingEmptyDetail,
  FindingsScreen,
  type FindingsScreenProps,
} from '@/features/findings/routes/FindingsScreen';
import { type HostNavigate, HostSeamProvider, useHostSeam } from '@/lib/host/host-seam';
import { FindingDetailPanel } from '@/test/host-adapters/features/findings/components/FindingDetail/index';
import { InternalLink } from '@/test/host-adapters/lib/router/InternalLink';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { ChevronLeft } from 'lucide-react';
import * as React from 'react';

export {
  findingsSearchSchema,
  validateFindingsSearch,
} from '@/features/findings/routes/findings-search';

// #982: the router plugin skips code-splitting when the route component is an
// exported local (hasExport check). The alias keeps FindingsListPage exported
// for tests while letting the route component split into its own chunk.

const SEARCH_KEYS = [
  'q',
  'filter.analytics_area',
  'status',
  'managedSystem',
  'selected',
  'execution',
  'assignment',
  'returnTo',
] as const;

/** TanStack's search for this route as the strings the screen reads (`undefined` dropped), a new object per router search object. */
function useFindingsSearch(): Readonly<Record<string, string>> {
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
function useFindingsNavigate(): HostNavigate {
  const navigate = useNavigate();
  return React.useCallback(
    (href, options) => {
      const location = new URL(href, 'http://feedbackops.local');
      const replace = options?.replace === true;
      if (location.pathname !== '/findings') {
        void navigate({
          to: location.pathname as never,
          search: Object.fromEntries(location.searchParams) as never,
          replace,
        });
        return;
      }
      void navigate({
        to: '/findings',
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

/** The VOC back link: the stored URL stays as written (the app codec's string), and a plain left click navigates by href through the router. */
function VocReturnLink({ returnTo }: { returnTo: string }): React.ReactElement {
  const navigate = useNavigate({ from: '/findings/' });
  return (
    <InternalLink
      href={returnTo}
      onClick={(event) => {
        if (
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey ||
          event.button !== 0
        ) {
          return;
        }
        event.preventDefault();
        void navigate({ href: returnTo });
      }}
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-text-muted hover:bg-surface-canvas hover:text-text-primary"
    >
      <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
      <span>원래 VOC로 돌아가기</span>
    </InternalLink>
  );
}

const renderStandaloneDetail: FindingsScreenProps['renderDetail'] = (
  findingId,
  { listDenied, returnTo },
) =>
  listDenied ? null : findingId !== null ? (
    <FindingDetailPanel
      findingId={findingId}
      {...(returnTo !== null ? { headerExtras: <VocReturnLink returnTo={returnTo} /> } : {})}
    />
  ) : (
    <FindingEmptyDetail />
  );

export function FindingsListPage(): React.ReactElement {
  const base = useHostSeam();
  const seam = React.useMemo(
    () => ({ ...base, useSearch: useFindingsSearch, useNavigate: useFindingsNavigate }),
    [base],
  );
  return (
    <HostSeamProvider value={seam}>
      <FindingsScreen renderDetail={renderStandaloneDetail} />
    </HostSeamProvider>
  );
}
