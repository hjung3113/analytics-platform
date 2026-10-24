import { PlatformLink, usePlatform } from '@ap/kernel';
import type { HostLinkProps } from '@fops/frontend/global-screens/core';
import { UnlinkedLink } from './FoBridge';

export type PlatformTarget = { menuId: string; params?: Record<string, string> };
export type TargetOf = (to: string) => PlatformTarget | null;

/**
 * The host seam's `canLink`/`Link` for the FeedbackOps paths any of `targets` maps to a platform destination (ADR-0071 decision 10, amended);
 * every other path is unlinked. `returnTo` lands only where the destination declares it. `FoBridge` memoizes its seam on these two identities,
 * so call this once at module level, never in render.
 */
export function hostLinks(...targets: TargetOf[]) {
  const targetOf: TargetOf = to => {
    for (const target of targets) {
      const found = target(to);
      if (found !== null) return found;
    }
    return null;
  };
  const canLink = (to: string) => targetOf(to) !== null;
  function Link({ to, children, ...rest }: HostLinkProps) {
    const { linkTo } = usePlatform();
    const target = targetOf(to);
    if (target === null) return <UnlinkedLink to={to} {...rest}>{children}</UnlinkedLink>;
    return <PlatformLink href={linkTo(target.menuId, { params: target.params, returnTo: true })} {...rest}>{children}</PlatformLink>;
  }
  return { canLink, Link };
}

/** `/permission-requests` is the requester page (ADR-0070 decision 8). */
export function permissionRequestsTarget(to: string): PlatformTarget | null {
  return to === '/permission-requests' ? { menuId: 'permission-requests' } : null;
}
