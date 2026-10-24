import { PlatformLink, usePlatform } from '@ap/kernel';
import type { HostLinkProps } from '@fops/frontend/global-screens/core';
import { UnlinkedLink } from './FoBridge';
import { isReachable } from './reachable';

export type PlatformTarget = { menuId: string; params?: Record<string, string>; page?: Record<string, string> };
export type TargetOf = (to: string) => PlatformTarget | null;

/**
 * The host seam's `canLink`/`Link` for the FeedbackOps paths any of `targets` maps to a platform destination (ADR-0071 decision 10, amended);
 * every other path is unlinked, and so is a path whose menu is not in the current registry (`Link`, `useNavigate`; `FoBridge` applies the same
 * rule to `canLink` when it is given `targetOf`). `returnTo` lands only where the destination declares it. `FoBridge` memoizes its seam on these
 * identities, so call this once at module level, never in render.
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
  /** `to` is the complete FeedbackOps path+query, rebuilt through `linkTo` from the mapped record only, so a key absent from `to` is cleared; an unmapped `to` moves nowhere (ADR-0071 decision 10). */
  function useNavigate() {
    const { linkTo, navigate, registry } = usePlatform();
    return (to: string, options?: { replace?: boolean }) => {
      const target = targetOf(to);
      if (!isReachable(registry, target)) return;
      navigate(linkTo(target.menuId, { params: target.params, page: target.page, returnTo: true }), { replace: options?.replace === true });
    };
  }
  function Link({ to, children, ...rest }: HostLinkProps) {
    const { linkTo, registry } = usePlatform();
    const target = targetOf(to);
    if (!isReachable(registry, target)) return <UnlinkedLink to={to} {...rest}>{children}</UnlinkedLink>;
    return <PlatformLink href={linkTo(target.menuId, { params: target.params, page: target.page, returnTo: true })} {...rest}>{children}</PlatformLink>;
  }
  return { canLink, Link, useNavigate, targetOf };
}

/** `/permission-requests` is the requester page (ADR-0070 decision 8). */
export function permissionRequestsTarget(to: string): PlatformTarget | null {
  return to === '/permission-requests' ? { menuId: 'permission-requests' } : null;
}
