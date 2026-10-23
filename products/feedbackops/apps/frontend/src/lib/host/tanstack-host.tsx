import { Link } from '@tanstack/react-router';
import { toast } from 'sonner';

import type { HostLinkProps, HostSeam } from './host-seam';

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
};
