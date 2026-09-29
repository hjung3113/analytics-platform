/**
 * The console access directory (issue #49): one read-only row per USERS entry joined to SITES. Room_name and
 * individual grants belong to the platform meta DB (issue #98, decided) but the role-membership source (IdP
 * group claim spec) is still open, so no write port exists — this module never mutates USERS and offers no write path, and three roles are the whole server world (extra people
 * would pretend a user directory exists). Not finished by finish(): no mart kind exists to declare, so trust
 * is null and assessments are empty on every branch — finish() would attach a fake mart.productivity_hourly
 * trust and a fake collection assessment. `partial` and `too_large` do not apply (not a mart, no period
 * budget) and fall through to the data path. No room gate and no checkScope: the one console role is the
 * operator role and this is the console index over every site, same reason as auditTrail — hiding a site's
 * assignment would hide the assignment. SiteGrant room names are master values (ADR-0005), never translated.
 */
import { PERMISSIONS, type AccessDirectoryPage, type AccessDirectoryQuery, type AccessPrincipal, type AccessSortField, type ApiResponse, type Assessment } from '@ap/contracts';
import { getRole, getScenario, nextCorrelation, sleep } from './server';
import { SITES, USERS, type RoleId } from './world';

export type AccessOptions = { role?: RoleId; latency?: number };

/** Declared wire keys (issue #49) — anything else a client sends is an unknown key, not a silent no-op. */
const ACCESS_QUERY_KEYS = ['role', 'permission', 'page', 'pageSize', 'sort'] as const;
const ACCESS_SORT_FIELDS = ['name', 'role', 'permissionCount', 'grantCount'] as const satisfies readonly AccessSortField[];

/**
 * One message for every malformed query (`Invalid access filter`); never a coercion to page 1 or to "all",
 * and never an echo of the bad value into a different filter. A well-formed role that matches nobody is not
 * an error — it falls through to the data path and answers empty.
 */
function invalidAccessQuery(query: AccessDirectoryQuery): boolean {
  if (Object.keys(query).some(key => !(ACCESS_QUERY_KEYS as readonly string[]).includes(key))) return true;
  // Same token rule as the audit actor filter: not a string, empty, over 80 chars, or URL/whitespace-bearing.
  if (query.role !== undefined && (typeof query.role !== 'string' || !query.role || query.role.length > 80 || /[?#&\s]/.test(query.role))) return true;
  if (query.permission !== undefined && !(PERMISSIONS as readonly string[]).includes(query.permission)) return true;
  if (query.sort !== undefined) {
    if (typeof query.sort !== 'object' || query.sort === null) return true;
    if (Object.keys(query.sort).some(key => key !== 'field' && key !== 'desc')) return true;
    if (!ACCESS_SORT_FIELDS.includes(query.sort.field) || typeof query.sort.desc !== 'boolean') return true;
  }
  if (query.page !== undefined && (typeof query.page !== 'number' || !Number.isInteger(query.page) || query.page < 1)) return true;
  if (query.pageSize !== undefined && (typeof query.pageSize !== 'number' || !Number.isInteger(query.pageSize) || query.pageSize < 1 || query.pageSize > 100)) return true;
  return false;
}

function compareBySort(sort: { field: AccessSortField; desc: boolean }): (a: AccessPrincipal, b: AccessPrincipal) => number {
  return (a, b) => {
    const ordered = sort.field === 'permissionCount'
      ? a.permissions.length - b.permissions.length
      : sort.field === 'grantCount'
        ? a.sites.reduce((sum, site) => sum + site.grantedRooms.length, 0) - b.sites.reduce((sum, site) => sum + site.grantedRooms.length, 0)
        : a[sort.field].localeCompare(b[sort.field]);
    // desc flips the field only; the id stays the ascending tie-break.
    const directed = sort.desc ? -ordered : ordered;
    return directed !== 0 ? directed : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  };
}

/**
 * Fresh rows per request from USERS × SITES — never a copy of the USERS `grants` record and never a
 * fabricated principal. Every site appears, zeros included (ScopeOption drops them; this is the index).
 */
function principals(): AccessPrincipal[] {
  return (Object.keys(USERS) as RoleId[]).map(key => {
    const u = USERS[key];
    return {
      id: key,
      name: u.name,
      title: { ...u.title },
      role: key,
      permissions: [...u.permissions],
      sites: SITES.map(site => {
        const granted = u.grants[site.id];
        return {
          id: site.id,
          label: site.label,
          grantedRooms: granted ? site.rooms.filter(room => granted.includes(room)) : [],
          totalRooms: site.rooms.length,
        };
      }),
    };
  });
}

/**
 * The console access directory (docs/06 §9.1 operations console). A zero is a meaningful directory result, so the
 * empty scenario and a well-formed filter that matches nobody both answer outcome 'empty'; a page past the
 * end with rows behind it answers ok with the true total, never a rewrite to page 1.
 */
export async function accessDirectory(query: AccessDirectoryQuery, signal?: AbortSignal, opts?: AccessOptions): Promise<ApiResponse<AccessDirectoryPage>> {
  // Pin identity at send time, like serve(): a role switch while in flight must not re-evaluate this request.
  const s = getScenario();
  const requestRole = opts?.role ?? getRole();
  const correlationId = nextCorrelation();
  await sleep(opts?.latency ?? 80, signal);
  const base = { correlationId, data: null, trust: null, assessments: [] as Assessment[] };
  // The console permission beats every scenario and every filter.
  if (!USERS[requestRole].permissions.includes('console:access')) return { ...base, outcome: 'forbidden', message: 'No permission console:access' };
  if (s === 'timeout') return { ...base, outcome: 'timeout', message: 'Query exceeded 30s budget' };
  if (s === 'error') return { ...base, outcome: 'error', message: 'Upstream mart query failed' };
  if (s === 'forbidden') return { ...base, outcome: 'forbidden', message: 'Permission revoked (scenario)' };
  if (invalidAccessQuery(query)) return { ...base, outcome: 'error', message: 'Invalid access filter' };
  if (s === 'empty') return { ...base, outcome: 'empty' };
  // Default (no sort in the query): role ascending with the id tie-break — exactly the role comparator.
  const filtered = principals()
    .filter(p => (query.role === undefined || p.role === query.role) && (query.permission === undefined || p.permissions.includes(query.permission)))
    .sort(query.sort ? compareBySort(query.sort) : compareBySort({ field: 'role', desc: false }));
  if (filtered.length === 0) return { ...base, outcome: 'empty' };
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 25;
  const start = (page - 1) * pageSize;
  return { ...base, outcome: 'ok', data: { items: filtered.slice(start, start + pageSize), total: filtered.length } };
}
