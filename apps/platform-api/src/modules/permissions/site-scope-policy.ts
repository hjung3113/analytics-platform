import type { Capability, PermissionScopeCatalogCandidate } from '@ap/feature-shared';
import { and, eq, gt, isNull, or } from 'drizzle-orm';
import { permissionGrants } from '../../db/schema/permission.js';
import type { Tx } from '../../db/tx.js';
import { HttpError } from '../../lib/errors.js';
import type { ScopeCatalog } from './scope-catalog.js';

export interface GrantScope {
  kind: string;
  site: string | null;
  room: string | null;
}
export const managedScope: GrantScope = { kind: 'managed_system', site: null, room: null };

function invalid(field: string, message: string): never {
  throw new HttpError('validation.failed', message, { fields: [{ path: [field], code: 'custom' }] });
}

export function validateSiteScope(
  capability: Capability, scope: GrantScope, managedSystemId: string | null,
  objectType: string | null, objectId: string | null,
  catalog: ScopeCatalog | undefined, prefix: string,
): void {
  if (scope.kind === 'managed_system') {
    if (capability === 'scope.read') invalid(`${prefix}scope_kind`, 'scope.read requires site or site_room');
    if (scope.site !== null) invalid(`${prefix}scope_site`, 'managed_system cannot carry a site');
    if (scope.room !== null) invalid(`${prefix}scope_room`, 'managed_system cannot carry a room');
    return;
  }
  if (capability !== 'scope.read' || !['site', 'site_room'].includes(scope.kind))
    invalid(`${prefix}scope_kind`, 'only scope.read supports site or site_room');
  if (!catalog) invalid(`${prefix}scope_kind`, 'scope catalog is not configured');
  if (managedSystemId !== null) invalid(`${prefix}managed_system_id`, 'site scope cannot carry a Managed System');
  if (objectType !== null || objectId !== null) invalid(`${prefix}object_type`, 'site scope cannot carry object authorization');
  if (!scope.site || !catalog.hasSite(scope.site)) invalid(`${prefix}scope_site`, 'site is not in the scope catalog');
  if (scope.kind === 'site' && scope.room !== null) invalid(`${prefix}scope_room`, 'site scope cannot carry a room');
  if (scope.kind === 'site_room' && (!scope.room || !catalog.hasRoom(scope.site, scope.room)))
    invalid(`${prefix}scope_room`, 'room is not in the scope catalog');
}

export function assertScopeNarrowing(requested: GrantScope, granted: GrantScope): void {
  if (requested.kind === 'managed_system' && granted.kind === 'managed_system') return;
  if (requested.site !== granted.site ||
    !(requested.kind === granted.kind || (requested.kind === 'site' && granted.kind === 'site_room')) ||
    (requested.kind === 'site_room' && requested.room !== granted.room))
    invalid('granted_scope_kind', 'approval cannot move or widen requested scope');
}

export function scopeFields(scope: GrantScope) {
  return scope.kind === 'managed_system' ? {} : {
    scope_kind: scope.kind as 'site' | 'site_room', scope_site: scope.site, scope_room: scope.room,
  };
}
export function requestedScopeFields(scope: GrantScope) {
  return scope.kind === 'managed_system' ? {} : {
    requested_scope_kind: scope.kind as 'site' | 'site_room', requested_scope_site: scope.site, requested_scope_room: scope.room,
  };
}
export function grantedScopeFields(scope: GrantScope) {
  return scope.kind === 'managed_system' ? {} : {
    granted_scope_kind: scope.kind as 'site' | 'site_room', granted_scope_site: scope.site, granted_scope_room: scope.room,
  };
}
export function requestScope(row: { requestedScopeKind: string; requestedScopeSite: string | null; requestedScopeRoom: string | null }): GrantScope {
  return { kind: row.requestedScopeKind, site: row.requestedScopeSite, room: row.requestedScopeRoom };
}
export function grantScope(row: { scopeKind: string; scopeSite: string | null; scopeRoom: string | null }): GrantScope {
  return { kind: row.scopeKind, site: row.scopeSite, room: row.scopeRoom };
}
export function inScopeCatalog(scope: GrantScope, catalog?: ScopeCatalog): boolean {
  return scope.kind === 'managed_system' || Boolean(scope.site && catalog?.hasSite(scope.site) &&
    (scope.kind === 'site' || (scope.kind === 'site_room' && scope.room && catalog.hasRoom(scope.site, scope.room))));
}

/** Recipient/workspace isolation is shared by coverage checks and candidate annotations. */
export async function activeSiteGrants(tx: Tx, workspaceId: string, actorId: string) {
  return tx.select().from(permissionGrants).where(and(
    eq(permissionGrants.workspaceId, workspaceId), eq(permissionGrants.actorId, actorId),
    eq(permissionGrants.capability, 'scope.read'),
    or(eq(permissionGrants.scopeKind, 'site'), eq(permissionGrants.scopeKind, 'site_room')),
    isNull(permissionGrants.revokedAt), isNull(permissionGrants.supersededAt),
    or(isNull(permissionGrants.expiresAt), gt(permissionGrants.expiresAt, new Date())),
  ));
}
export async function findCoveringSiteGrant(tx: Tx, workspaceId: string, actorId: string, scope: GrantScope) {
  const rows = await activeSiteGrants(tx, workspaceId, actorId);
  return rows.find(row => row.scopeSite === scope.site && (row.scopeKind === 'site' ||
    (scope.kind === 'site_room' && row.scopeKind === 'site_room' && row.scopeRoom === scope.room)));
}
export async function scopeCatalogCandidates(tx: Tx, workspaceId: string, actorId: string, catalog?: ScopeCatalog): Promise<PermissionScopeCatalogCandidate[]> {
  if (!catalog) return [];
  const grants = await activeSiteGrants(tx, workspaceId, actorId);
  return catalog.sites.map(entry => {
    const siteGranted = grants.some(row => row.scopeKind === 'site' && row.scopeSite === entry.site);
    return { site: entry.site, label: entry.label, siteGranted, rooms: entry.rooms.map(room => ({
      room, granted: siteGranted || grants.some(row => row.scopeKind === 'site_room' && row.scopeSite === entry.site && row.scopeRoom === room),
    })) };
  });
}
