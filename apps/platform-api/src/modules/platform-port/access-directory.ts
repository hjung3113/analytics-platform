// Platform port `accessDirectory` (platform ADR-0069 decisions 7, 8): the console access directory over the
// workspace's internal members. Judges a request and returns an outcome; the route wraps it in the
// envelope. Permissions come from the one rule set (`resolvePlatformPermissionsBatch`: every member in one batched
// read, whatever the member count), in the platform's canonical permission order (kernel first, then the modules'
// declared menu permissions). Sites (#2015): with a Scope catalog, one `SiteGrant` per catalog site in catalog order
// (zero-grant sites included) from the members' active `scope.read` grants, read in one query and decided by the same
// rule as the grant-table Scope resolver; without a catalog (default, or the HTTP grant-service deployment) `sites: []`.

import type { Db } from '../../db/client.js';
import { listWorkspaceInternalMembers } from '../auth/index.js';
import type { CheckService } from '../permissions/check-service.js';
import { type ScopeCatalog, grantedRoomsBySite, readActiveSiteScopeGrants } from '../permissions/index.js';
import type { AuditJudgement } from './audit-service.js';
import {
  type PlatformActor,
  holdsPlatformPermission,
  type PlatformPermissionResolver,
} from './permissions.js';
import { titleFor } from './titles.js';

export const ACCESS_SORT_FIELDS = ['name', 'role', 'permissionCount', 'grantCount'] as const;
type AccessSortField = (typeof ACCESS_SORT_FIELDS)[number];

const ACCESS_QUERY_KEYS = ['role', 'permission', 'page', 'pageSize', 'sort'] as const;

/** One site's rooms granted to a principal (`SiteGrant`, SDK `adapter.ts`). Room names are master values. */
export interface SiteGrant {
  id: string;
  label: string;
  grantedRooms: string[];
  totalRooms: number;
}

export interface AccessPrincipal {
  id: string;
  name: string;
  title: { ko: string; en: string };
  role: string;
  permissions: string[];
  sites: SiteGrant[];
}

interface ParsedAccessQuery {
  role?: string;
  permission?: string;
  page: number;
  pageSize: number;
  sort: { field: AccessSortField; desc: boolean };
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** Mirrors the reference `invalidAccessQuery`: one malformed answer, never a coercion. */
export function parseAccessQuery(body: unknown): ParsedAccessQuery | null {
  if (!isPlainObject(body)) return null;
  if (Object.keys(body).some((key) => !(ACCESS_QUERY_KEYS as readonly string[]).includes(key))) {
    return null;
  }
  const { role, permission, page, pageSize, sort } = body;
  if (
    role !== undefined &&
    (typeof role !== 'string' || !role || role.length > 80 || /[?#&\s]/.test(role))
  ) {
    return null;
  }
  // Any `<namespace>:<action>`: an app's menu permissions are not listed here and nobody in this workspace holds them (platform ADR-0072).
  if (
    permission !== undefined &&
    (typeof permission !== 'string' || !/^[^\s:?#&/]+:[^\s:?#&/]+$/.test(permission))
  ) {
    return null;
  }
  let parsedSort: ParsedAccessQuery['sort'] = { field: 'role', desc: false };
  if (sort !== undefined) {
    if (!isPlainObject(sort)) return null;
    if (Object.keys(sort).some((key) => key !== 'field' && key !== 'desc')) return null;
    if (
      !(ACCESS_SORT_FIELDS as readonly unknown[]).includes(sort.field) ||
      typeof sort.desc !== 'boolean'
    ) {
      return null;
    }
    parsedSort = { field: sort.field as AccessSortField, desc: sort.desc };
  }
  if (page !== undefined && (typeof page !== 'number' || !Number.isSafeInteger(page) || page < 1)) {
    return null;
  }
  if (
    pageSize !== undefined &&
    (typeof pageSize !== 'number' || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100)
  ) {
    return null;
  }
  return {
    ...(role !== undefined ? { role } : {}),
    ...(permission !== undefined ? { permission } : {}),
    page: (page as number | undefined) ?? 1,
    pageSize: (pageSize as number | undefined) ?? 25,
    sort: parsedSort,
  };
}

const grantedRoomCount = (p: AccessPrincipal): number =>
  p.sites.reduce((sum, site) => sum + site.grantedRooms.length, 0);

/** One row per catalog site in catalog order, zero-grant sites included; out-of-catalog grant values are dropped. */
export function buildSiteGrants(
  catalog: ScopeCatalog,
  rows: Parameters<typeof grantedRoomsBySite>[1],
): SiteGrant[] {
  const granted = grantedRoomsBySite(catalog, rows);
  return catalog.sites.map(({ site, label, rooms }) => ({
    id: site,
    label,
    grantedRooms: granted.get(site) ?? [],
    totalRooms: rooms.length,
  }));
}

function compareBy(sort: ParsedAccessQuery['sort']) {
  return (a: AccessPrincipal, b: AccessPrincipal): number => {
    const ordered =
      sort.field === 'permissionCount'
        ? a.permissions.length - b.permissions.length
        : sort.field === 'grantCount'
          ? grantedRoomCount(a) - grantedRoomCount(b)
          : sort.field === 'name'
            ? a.name.localeCompare(b.name)
            : a.role.localeCompare(b.role);
    // desc flips the field only; the id stays the ascending tie-break.
    const directed = sort.desc ? -ordered : ordered;
    return directed !== 0 ? directed : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  };
}

export interface AccessDirectoryDeps {
  db: Db;
  checkService: CheckService;
  /** This server's permission rules (kernel plus the menu permissions its modules declared). */
  permissions: PlatformPermissionResolver;
  /** The deployment's site/room catalog; absent → every principal has `sites: []`. */
  scopeCatalog?: ScopeCatalog;
}

export function createAccessDirectoryService(deps: AccessDirectoryDeps) {
  async function accessDirectory(
    actor: PlatformActor,
    body: unknown,
  ): Promise<AuditJudgement<{ items: AccessPrincipal[]; total: number }>> {
    // Permission before validation, as auditTrail and the reference implementation do.
    if (!(await holdsPlatformPermission(deps.checkService, actor, 'console:access'))) {
      return { outcome: 'forbidden', message: 'No permission console:access' };
    }
    const query = parseAccessQuery(body);
    if (!query) return { outcome: 'error', message: 'Invalid access filter' };
    const members = await listWorkspaceInternalMembers(deps.db, actor.workspace_id);
    // One batched read for the whole workspace: the query count does not grow with the member count.
    const heldByMember = await deps.permissions.resolveBatch(
      deps.checkService,
      members.map((m) => ({ actor_id: m.id, workspace_id: actor.workspace_id, role_level: m.role_level })),
    );
    const canonical = deps.permissions.order();
    const catalog = deps.scopeCatalog;
    // One read for every member's site grants, like the permissions above.
    const grantRows = catalog
      ? await readActiveSiteScopeGrants(deps.db, actor.workspace_id, members.map((m) => m.id))
      : [];
    const grantsByMember = new Map<string, typeof grantRows>();
    for (const row of grantRows) {
      const rows = grantsByMember.get(row.actorId) ?? [];
      rows.push(row);
      grantsByMember.set(row.actorId, rows);
    }
    const principals = members.map((m) => {
      const held = new Set(heldByMember.get(m.id) ?? []);
      return {
        id: m.id,
        name: m.display_name,
        title: titleFor(m.role_level),
        role: m.role_level,
        permissions: canonical.filter((p) => held.has(p)),
        sites: catalog ? buildSiteGrants(catalog, grantsByMember.get(m.id) ?? []) : [],
      } satisfies AccessPrincipal;
    });
    const filtered = principals
      .filter(
        (p) =>
          (query.role === undefined || p.role === query.role) &&
          (query.permission === undefined || p.permissions.includes(query.permission)),
      )
      .sort(compareBy(query.sort));
    if (filtered.length === 0) return { outcome: 'empty' };
    const start = (query.page - 1) * query.pageSize;
    return {
      outcome: 'ok',
      data: { items: filtered.slice(start, start + query.pageSize), total: filtered.length },
    };
  }

  return { accessDirectory };
}
