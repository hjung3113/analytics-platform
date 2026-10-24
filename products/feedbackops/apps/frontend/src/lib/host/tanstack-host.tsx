import { Link, useRouter, useRouterState } from '@tanstack/react-router';
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
    void router.navigate({ href: to, replace: options?.replace === true });
  };
}

function useTanstackSearch() {
  const searchStr = useRouterState({ select: (state) => state.location.searchStr });
  return Object.fromEntries(new URLSearchParams(searchStr));
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
};
