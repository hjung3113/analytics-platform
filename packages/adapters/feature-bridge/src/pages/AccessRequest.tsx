import type { PermissionRequestTarget } from '@ap/contracts';
import { RequestAccessButton, type RequestAccessScopeTarget } from '@ap/feature-screens/global-screens';
import { FeatureBridge } from '../feature/FeatureBridge';
import { hostLinks, permissionRequestsTarget } from '../feature/links';

// Module level: `FeatureBridge` memoizes its seam on these two identities. The duplicate-request notice links to the requester page (`/permission-requests`).
const ACCESS_REQUEST_LINKS = hostLinks(permissionRequestsTarget);

/** The Kernel request target of a site or room place → the feature dialog's scope target. A `permission` place has none here (node 1844f1c). */
export function scopeTargetOf(target: PermissionRequestTarget): RequestAccessScopeTarget | null {
  if (target.kind === 'site') return { kind: 'site', site: target.site };
  if (target.kind === 'site_room') return { kind: 'site_room', site: target.site, room: target.room };
  return null;
}

/**
 * The blocked-place «권한 요청» dialog (ADR-0154 decision 6): feature's request dialog in controlled mode inside the bridge, so its
 * submit invalidates the mine list in `featureQueryClient` and the slot's `Pending` flips without a reload. Opened lazily by
 * `access-request-slot.tsx` only in a ready session.
 */
export default function AccessRequest({ target, returnTo, open, onOpenChange }: { target: PermissionRequestTarget; returnTo: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const scopeTarget = scopeTargetOf(target);
  if (scopeTarget === null) return null;
  // Keyed by the target: the form keeps its draft and completion step only for the same site/room (review C1); a changed target is a new form.
  const key = scopeTarget.kind === 'site_room' ? `site_room\u0000${scopeTarget.site}\u0000${scopeTarget.room}` : `site\u0000${scopeTarget.site}`;
  return <FeatureBridge canLink={ACCESS_REQUEST_LINKS.canLink} Link={ACCESS_REQUEST_LINKS.Link}>
    <RequestAccessButton key={key} scopeTarget={scopeTarget} returnRouteIntent={returnTo} open={open} onOpenChange={onOpenChange} />
  </FeatureBridge>;
}
