import { Link, useRouter, useRouterState } from '@tanstack/react-router';
import { useMemo } from 'react';
import { toast } from 'sonner';

import { useDocumentTitle } from '@/lib/router/document-title';
import type { HostLinkProps, HostSeam } from './host-seam';
import { sonnerDismiss, sonnerNotify } from './sonner-notify';

function TanstackHostLink({ to, ...rest }: HostLinkProps) {
  const location = new URL(to, 'http://feedbackops.local');
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
    const location = new URL(to, 'http://feedbackops.local');
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

/** The standalone app's host: TanStack Router links and sonner toasts. */
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
  useTitle: useDocumentTitle,
  notify: sonnerNotify,
  dismiss: sonnerDismiss,
  useHere: useTanstackHere,
  absoluteHref: (to) => `${window.location.origin}${to}`,
};
