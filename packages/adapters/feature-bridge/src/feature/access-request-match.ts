import type { PermissionRequestTarget } from '@ap/contracts';

/** The fields of one of the user's own permission requests the pending rule reads (`GET /permission-requests/mine` rows). */
export type PendingRequestRow = {
  status: string;
  requested_scope_kind?: 'managed_system' | 'site' | 'site_room' | undefined;
  requested_scope_site?: string | null | undefined;
  requested_scope_room?: string | null | undefined;
};

/** Open requests: the admin has not decided (`needs_more_info` is still the user's open request). Approved, rejected, cancelled and expired ones are closed. */
const OPEN_STATUSES: ReadonlySet<string> = new Set(['pending', 'needs_more_info']);

/**
 * Whether a blocked place already has an open request (ADR-0154 decision 6, advisor 1844e major 1). One rule for every place:
 * a site place is pending for an open request on that site or on any room of it; a room place is pending for an open request on
 * its site or on that same room, never on another room of the site. A `permission` place is not matched here: null (unknown).
 */
export function isPendingFor(target: PermissionRequestTarget, rows: readonly PendingRequestRow[]): boolean | null {
  if (target.kind === 'permission') return null;
  return rows.some(row => OPEN_STATUSES.has(row.status) && row.requested_scope_site === target.site && (
    row.requested_scope_kind === 'site'
    || (row.requested_scope_kind === 'site_room' && (target.kind === 'site' || row.requested_scope_room === target.room))
  ));
}
