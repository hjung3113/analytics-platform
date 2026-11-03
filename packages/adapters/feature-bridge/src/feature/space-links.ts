import type { FeatureApi } from '../feature-api';
import { unauthorizedReporter } from './session';

/**
 * The server reads behind the app's space→system links and the 운영 콘솔 「시스템」 screen (#1289 node j, ADR-0110 decision 5).
 * `GET /managed-systems/space-links` and `GET /managed-systems` go through the feature API (`/api/features`, ADR-0071); this file owns the
 * transport, the strict parse and the page walk so the app's store and the screen read one shape. The link is navigation/default metadata only
 * (ADR-0068 decision 1): nothing here decides a permission.
 */

export type SpaceLink = { spaceId: string; managedSystemId: string; declared: boolean };
export type SpaceLinks = { links: readonly SpaceLink[]; platformManagedSystemId: string | null };
/** The columns of a Managed System the screen reads; the server sends more. */
export type ManagedSystemRow = { id: string; slug: string; name: string; externalKey: string | null; archived: boolean };

/** A failed read: `status` is the HTTP status (0 for a network failure or a body that is not the contract). */
export class FeatureReadError extends Error {
  constructor(readonly status: number, message: string) { super(message); this.name = 'FeatureReadError'; }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** Strict, like the server's `spaceLinksResponseSchema`: an unknown key or a wrong type is a contract failure, not a partial list. */
export function parseSpaceLinks(data: unknown): SpaceLinks {
  const bad = (what: string): never => { throw new FeatureReadError(0, `space-links response: ${what}`); };
  if (!isRecord(data)) return bad('not an object');
  const { items, platform_managed_system_id: platform, ...rest } = data;
  if (Object.keys(rest).length > 0) bad('unknown key');
  if (!Array.isArray(items)) return bad('items');
  if (platform !== null && !(typeof platform === 'string' && UUID.test(platform))) bad('platform_managed_system_id');
  const links = items.map((item): SpaceLink => {
    if (!isRecord(item)) return bad('item');
    const { space_id: spaceId, managed_system_id: managedSystemId, declared, ...extra } = item;
    if (Object.keys(extra).length > 0) bad('unknown item key');
    if (typeof spaceId !== 'string' || spaceId === '' || typeof managedSystemId !== 'string' || !UUID.test(managedSystemId) || typeof declared !== 'boolean') return bad('item shape');
    return { spaceId, managedSystemId, declared };
  });
  return { links, platformManagedSystemId: platform as string | null };
}

async function getJson(api: FeatureApi, path: string, signal?: AbortSignal): Promise<unknown> {
  const reportUnauthorized = unauthorizedReporter(api);
  let response: Response;
  try {
    response = await fetch(api.basePath + path, { method: 'GET', credentials: 'include', headers: { Accept: 'application/json' }, ...(signal ? { signal } : {}) });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new FeatureReadError(0, 'network failure');
  }
  if (response.status === 401) {
    // A superseded request (aborted) never redirects or retires; a current one goes through the bridge's shared, generation-aware handling.
    if (signal?.aborted) throw signal.reason ?? new DOMException('aborted', 'AbortError');
    reportUnauthorized();
    throw new FeatureReadError(401, 'unauthorized');
  }
  if (!response.ok) throw new FeatureReadError(response.status, `HTTP ${response.status}`);
  try { return await response.json(); } catch { throw new FeatureReadError(0, 'body is not JSON'); }
}

/** `GET /managed-systems/space-links`: every link of the workspace (declared or not) and its 「플랫폼」 system id. */
export async function fetchSpaceLinks(api: FeatureApi, signal?: AbortSignal): Promise<SpaceLinks> {
  return parseSpaceLinks(await getJson(api, '/managed-systems/space-links', signal));
}

const PAGE_LIMIT = 500;
/** Upper bound on the pages one walk reads, so a server that keeps answering full pages cannot loop forever. */
const MAX_PAGES = 200;

function parseManagedSystemPage(data: unknown): { rows: ManagedSystemRow[]; total: number | null } {
  if (!isRecord(data) || !Array.isArray(data.items)) throw new FeatureReadError(0, 'managed-systems response: items');
  const rows = data.items.map((item): ManagedSystemRow => {
    if (!isRecord(item) || typeof item.id !== 'string' || typeof item.slug !== 'string' || typeof item.name !== 'string') throw new FeatureReadError(0, 'managed-systems response: item');
    return { id: item.id, slug: item.slug, name: item.name, externalKey: typeof item.external_key === 'string' ? item.external_key : null, archived: item.archived_at != null };
  });
  return { rows, total: typeof data.total === 'number' ? data.total : null };
}

/**
 * Every Managed System of the workspace, archived ones included (a disconnected link may point at an archived system), by walking `GET /managed-systems`
 * with `limit`/`offset` until `total` is reached or a page comes back empty.
 */
export async function fetchAllManagedSystems(api: FeatureApi, signal?: AbortSignal, limit: number = PAGE_LIMIT): Promise<ManagedSystemRow[]> {
  const all: ManagedSystemRow[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const { rows, total } = parseManagedSystemPage(await getJson(api, `/managed-systems?include_archived=true&limit=${limit}&offset=${all.length}`, signal));
    all.push(...rows);
    if (rows.length === 0 || (total !== null ? all.length >= total : rows.length < limit)) return all;
  }
  throw new FeatureReadError(0, 'managed-systems: too many pages');
}
