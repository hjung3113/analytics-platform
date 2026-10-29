import { useRouter } from '@tanstack/react-router';
import { useCallback, useSyncExternalStore } from 'react';
import { toast } from 'sonner';

import type { HostLinkProps, HostSeam } from '@/lib/host/host-seam';
import { sonnerDismiss, sonnerNotify } from '@/test/host-adapters/lib/host/sonner-notify';
import { InternalLink } from '@/test/host-adapters/lib/router/InternalLink';

function useDashboardNavigate() {
  const router = useRouter({ warn: false });
  return (to: string, options?: { replace?: boolean }) => {
    void router?.navigate({ href: to, replace: options?.replace === true });
  };
}

function useDashboardSearch() {
  // No router to read; the dashboard has no search of its own.
  return {};
}

function useDashboardHere() {
  const router = useRouter({ warn: false });
  // `useRouterState` needs a router; without one the dashboard has no location to report.
  const subscribe = useCallback(
    (onChange: () => void) => router?.subscribe('onResolved', onChange) ?? (() => undefined),
    [router],
  );
  const getHere = useCallback(() => {
    if (!router) return '';
    const { pathname, searchStr, hash } = router.state.location;
    return `${pathname}${searchStr}${hash === '' ? '' : `#${hash}`}`;
  }, [router]);
  return useSyncExternalStore(subscribe, getHere, getHere);
}

/**
 * The standalone `/home` dashboard's host: the same `InternalLink` anchors it used before the body moved behind the
 * host seam (they also render without a router), and sonner toasts. The platform bridge supplies its own seam.
 */
export const standaloneDashboardHost: HostSeam = {
  canLink: () => true,
  Link: ({ to, ...rest }: HostLinkProps) => <InternalLink href={to} {...rest} />,
  notifyError: (message) => {
    toast.error(message);
  },
  notifySuccess: (message) => {
    toast.success(message);
  },
  useNavigate: useDashboardNavigate,
  useSearch: useDashboardSearch,
  useTitle: () => undefined,
  notify: sonnerNotify,
  dismiss: sonnerDismiss,
  useHere: useDashboardHere,
};
