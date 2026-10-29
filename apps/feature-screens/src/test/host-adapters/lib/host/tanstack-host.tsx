import { Link, useRouter, useRouterState } from '@tanstack/react-router';
import { useMemo } from 'react';
import { toast } from 'sonner';

import type { HostLinkProps, HostSeam } from '@/lib/host/host-seam';
import { sonnerDismiss, sonnerNotify } from '@/test/host-adapters/lib/host/sonner-notify';

function TanstackHostLink({ to, ...rest }: HostLinkProps) {
  const location = new URL(to, 'http://platform.local');
  return (
    <Link
      to={location.pathname as never}
      search={Object.fromEntries(location.searchParams) as never}
      {...rest}
    />
  );
}

function useTanstackNavigate() {
  const router = useRouter();
  return (to: string, options?: { replace?: boolean }) => {
    // Not `href`: that is parsed back with `parseAppSearch`, which turns a literal `q=true` into a boolean.
    // Search values go in as strings so `stringifyAppSearch` quotes the JSON-like ones as before.
    const location = new URL(to, 'http://platform.local');
    void router.navigate({
      to: location.pathname as never,
      search: Object.fromEntries(location.searchParams) as never,
      ...(location.hash === '' ? {} : { hash: location.hash.slice(1) }),
      replace: options?.replace === true,
    });
  };
}

/**
 * The router's parsed search (`parseAppSearch`) as the semantic strings a screen wrote: a legacy bare
 * `true`/`null`/number leaf becomes its text. A new object per router location, so a navigation back to
 * the same URL is still a new value for the screen.
 */
function useTanstackSearch() {
  const location = useRouterState({ select: (state) => state.location });
  return useMemo(
    () =>
      Object.fromEntries(
        // A hand-rolled test router may hand over only `searchStr`; the app router always has `search`.
        Object.entries(
          (location.search as Record<string, unknown> | undefined) ??
            Object.fromEntries(new URLSearchParams(location.searchStr ?? '')),
        ).map(([key, value]) => [key, typeof value === 'string' ? value : String(value)]),
      ),
    [location],
  );
}

function useTanstackHere() {
  const location = useRouterState({ select: (state) => state.location });
  // TanStack keeps the hash without its `#`.
  return `${location.pathname}${location.searchStr}${location.hash === '' ? '' : `#${location.hash}`}`;
}

/** The test-local TanStack Router host: router links and sonner toasts. */
export const tanstackHost: HostSeam = {
  canLink: () => true,
  Link: TanstackHostLink,
  notifyError: (message) => {
    toast.error(message);
  },
  notifySuccess: (message) => {
    toast.success(message);
  },
  useNavigate: useTanstackNavigate,
  useSearch: useTanstackSearch,
  // The title port stays on the seam (#1130 Q7 retired the standalone titles); no test host writes one.
  useTitle: () => undefined,
  notify: sonnerNotify,
  dismiss: sonnerDismiss,
  useHere: useTanstackHere,
  absoluteHref: (to) => `${window.location.origin}${to}`,
};
