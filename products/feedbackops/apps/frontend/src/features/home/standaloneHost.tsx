import { toast } from 'sonner';

import type { HostLinkProps, HostSeam } from '@/lib/host/host-seam';
import { InternalLink } from '@/lib/router/InternalLink';

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
};
