/**
 * Platform inbound deep-link codec (docs/integration/platform-inbound-links.md §2, contract: 2): builds/validates the platform
 * URLs an external caller may open (06 §6/§22). Reuses the global-Context codec in ./url; adds no React, env, registry or
 * cross-package imports.
 */
import { RETURN_TO_KEY } from './return-to.js';
import { buildQuery, ContractError, isAppRelativePath, normalizeSet, parseDateTime, parseQuery, type GlobalContext, type Pair } from './url.js';

const fail = (code: string, message: string): never => { throw new ContractError(code, message); };

export type PlatformHop =
  | { menuId: 'equipment-detail'; equipmentId: string }
  | { menuId: 'equipment-master' }
  | { menuId: 'cycle-time' };

/** One inbound destination. The SDK knows no menus: a caller that assembles its own platform lists its destinations
 *  (`destinations` option); the three below are the default so existing calls behave the same. */
export interface PlatformDestination {
  menuId: string;
  /** App-relative path. With `idField` it is the prefix of exactly one id segment (`/equipment` → `/equipment/<id>`). */
  path: string;
  /** Name of the hop field carrying the single path-segment id; omit for a fixed path. */
  idField?: string;
  /** The destination accepts the `returnTo` page key. */
  acceptsReturnTo?: boolean;
}

export const DEFAULT_PLATFORM_DESTINATIONS: readonly PlatformDestination[] = [
  { menuId: 'equipment-detail', path: '/equipment', idField: 'equipmentId', acceptsReturnTo: true },
  { menuId: 'equipment-master', path: '/equipment' },
  { menuId: 'cycle-time', path: '/analytics/cycle-time' },
];

/** Hop of an injected destination list: `menuId` plus the id field the destination declares. */
export type PlatformInboundHop = { menuId: string } & { [field: string]: string };

/** Canonical absolute origin via URL-standard parsing: input must equal `new URL(input).origin`
 *  (a single trailing '/' is allowed); https anywhere, http only for loopback hosts; no path/query/hash/userinfo. */
function origin(input: string): string {
  let url: URL;
  try { url = new URL(input); } catch { return fail('inbound_origin', `origin must be an absolute https://host[:port] URL (http only for localhost/127.0.0.1; no path/query/hash/userinfo), got ${JSON.stringify(input)}`); }
  const canonical = url.origin;
  if (input !== canonical && !(input.endsWith('/') && input.slice(0, -1) === canonical)) {
    return fail('inbound_origin', `origin must be the canonical URL origin (${canonical}), got ${JSON.stringify(input)}`);
  }
  const scheme = url.protocol.slice(0, -1);
  if (scheme !== 'https' && scheme !== 'http') return fail('inbound_origin', `origin scheme must be https or http, got ${JSON.stringify(input)}`);
  if (scheme === 'http' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') return fail('inbound_origin', `http is allowed only for localhost/127.0.0.1, got ${url.hostname}`);
  if (url.hostname.endsWith('.')) return fail('inbound_origin', `origin host must not end with a dot, got ${JSON.stringify(input)}`);
  return canonical;
}

/** One nonblank path segment; '.'/'..' are rejected because browsers normalize them away in the path. */
function equipmentDetailId(id: string, field = 'equipmentId'): string {
  if (!id.length || id === '.' || id === '..' || Array.from(id).every(c => /\s/.test(c))) {
    return fail('invalid_id', `${field} must be a single nonblank path segment and must not be '.' or '..', got ${JSON.stringify(id)}`);
  }
  return id;
}

/** Builder-side parity with parseQuery: reject what it would reject BEFORE serialization silently drops it. */
function validateContext(g: GlobalContext): void {
  if ((g.from === null) !== (g.to === null)) fail('partial_period', 'from and to must be supplied together');
  if (g.from !== null && g.to !== null) {
    if (parseDateTime(g.from, 'from') >= parseDateTime(g.to, 'to')) fail('invalid_period', 'from must be earlier than to');
  }
  if (g.membershipBasis !== null && g.membershipBasis !== 'asOf') fail('invalid_membership_basis', 'membershipBasis must be asOf');
  if (g.membershipBasis !== null && (g.condition === null || Object.keys(g.condition).length === 0) && g.prcGroups === null) fail('membership_basis_pair', 'membershipBasis requires equipmentGroup or prcGroups');
  if (g.condition !== null) parseQuery('?equipmentGroup=' + encodeURIComponent(JSON.stringify(g.condition)));
  if (g.metricVersion !== null && g.metricId === null) fail('metric_pair', 'metricVersion requires metricId (the pair travels together)');
  for (const [field, key] of [['lineNames', 'lineNames'], ['prcGroups', 'prcGroups'], ['roomNames', 'roomNames'], ['selection', 'selectedEquipmentIds'], ['lotIds', 'lotIds'], ['recipeIds', 'recipeIds']] as const) {
    const ids = g[field];
    if (ids !== null) normalizeSet(ids, key);
  }
}

/** Split an absolute deep link. Fragment or backslash is rejected: neither is part of the contract. */
function splitUrl(url: string): { origin: string; path: string; search: string } {
  if (url.includes('#') || url.includes('\\')) return fail('inbound_path', `fragment/backslash is not part of the deep-link contract: ${JSON.stringify(url)}`);
  const m = /^([a-zA-Z][a-zA-Z0-9+.-]*):\/\/([^/?#]*)(\/[^?#]*)(?:\?([^#]*))?$/.exec(url);
  if (!m) return fail('inbound_path', `use an absolute link scheme://host/path[?query], got ${JSON.stringify(url)}`);
  return { origin: `${m[1].toLowerCase()}://${m[2].toLowerCase()}`, path: m[3], search: m[4] ?? '' };
}

const RETURN_TO: readonly string[] = [RETURN_TO_KEY];

function destinationOf(destinations: readonly PlatformDestination[], menuId: string): PlatformDestination {
  return destinations.find(d => d.menuId === menuId) ?? fail('unsupported_path', `unknown platform destination ${JSON.stringify(menuId)}`);
}

/** Feature screens → platform. Generates the canonical inbound URL for a hop (contract §2). `destinations` defaults to
 *  `DEFAULT_PLATFORM_DESTINATIONS`; pass your own list (and hops of `PlatformInboundHop`) for a different platform. */
export function buildPlatformInboundLink(input: { origin: string; hop: PlatformHop; context: GlobalContext; returnTo?: string }): string;
export function buildPlatformInboundLink(input: { origin: string; hop: PlatformInboundHop; context: GlobalContext; returnTo?: string; destinations: readonly PlatformDestination[] }): string;
export function buildPlatformInboundLink(input: {
  origin: string;
  hop: PlatformHop | PlatformInboundHop;
  context: GlobalContext;
  returnTo?: string;
  destinations?: readonly PlatformDestination[];
}): string {
  const base = origin(input.origin);
  const dest = destinationOf(input.destinations ?? DEFAULT_PLATFORM_DESTINATIONS, input.hop.menuId);
  const wantsReturnTo = input.returnTo !== undefined;
  if (wantsReturnTo && !dest.acceptsReturnTo) return fail('unsupported_page_key', `returnTo is not a page key of ${dest.menuId}`);
  if (wantsReturnTo && !isAppRelativePath(input.returnTo!)) return fail('external_return', `returnTo must be an app-relative platform path, got ${JSON.stringify(input.returnTo)}`);
  const hopFields = input.hop as Record<string, string>;
  if (dest.idField !== undefined) equipmentDetailId(hopFields[dest.idField] ?? '', dest.idField);
  validateContext(input.context); // before serialization: serializeGlobal would silently drop a one-sided period or orphan metricVersion.
  const page: Pair[] = wantsReturnTo ? [[RETURN_TO_KEY, input.returnTo!]] : [];
  const query = buildQuery(input.context, page);
  parseQuery(query, wantsReturnTo ? RETURN_TO : []); // validate the serialized form before hand-out: scopeId/ppid/condition identifiers, set markers.
  const path = dest.idField !== undefined ? `${dest.path}/${encodeURIComponent(hopFields[dest.idField])}` : dest.path;
  return base + path + query;
}

/** Inbound parse — validates origin, hop path and the §2 rules; `context` is the full parsed
 *  GlobalContext (06 §6.4 preservation) and unregistered keys stay in `extras`. */
export function parsePlatformInboundLink(url: string, expectedOrigin: string): {
  hop: PlatformHop;
  context: GlobalContext;
  extras: Pair[];
  returnTo: string | null;
};
export function parsePlatformInboundLink(url: string, expectedOrigin: string, destinations: readonly PlatformDestination[]): {
  hop: PlatformInboundHop;
  context: GlobalContext;
  extras: Pair[];
  returnTo: string | null;
};
export function parsePlatformInboundLink(url: string, expectedOrigin: string, destinations: readonly PlatformDestination[] = DEFAULT_PLATFORM_DESTINATIONS): {
  hop: PlatformHop | PlatformInboundHop;
  context: GlobalContext;
  extras: Pair[];
  returnTo: string | null;
} {
  const expected = origin(expectedOrigin);
  const split = splitUrl(url);
  if (split.origin !== expected) return fail('inbound_origin', `link origin ${split.origin} does not match expectedOrigin ${expected}`);
  let dest = destinations.find(d => d.idField === undefined && d.path === split.path);
  let hop: Record<string, string>;
  if (dest !== undefined) hop = { menuId: dest.menuId };
  else {
    dest = destinations.find(d => d.idField !== undefined && split.path.startsWith(`${d.path}/`));
    if (dest === undefined || dest.idField === undefined) return fail('unsupported_path', `unsupported platform hop path ${split.path}`);
    const raw = split.path.slice(dest.path.length + 1);
    if (raw.includes('/')) return fail('invalid_id', `${dest.idField} must be exactly one path segment, got ${JSON.stringify(raw)}`);
    let id: string;
    try { id = decodeURIComponent(raw); } catch { return fail('invalid_id', `${dest.idField} segment is not decodable: ${JSON.stringify(raw)}`); }
    equipmentDetailId(id, dest.idField);
    hop = { menuId: dest.menuId, [dest.idField]: id };
  }
  const returnToIsPageKey = dest.acceptsReturnTo === true;
  const parsed = parseQuery(split.search, returnToIsPageKey ? RETURN_TO : []);
  if (parsed.extras.some(([k]) => k === RETURN_TO_KEY)) return fail('unsupported_page_key', `returnTo is not a page key of ${dest.menuId}`);
  const returnToPair = parsed.page.find(([k]) => k === RETURN_TO_KEY) ?? null;
  let returnTo: string | null = null;
  if (returnToPair !== null) {
    if (!isAppRelativePath(returnToPair[1])) return fail('external_return', `returnTo must be an app-relative platform path, got ${JSON.stringify(returnToPair[1])}`);
    returnTo = returnToPair[1];
  }
  return {
    hop: hop as PlatformHop | PlatformInboundHop,
    context: parsed.global,
    extras: parsed.extras,
    returnTo,
  };
}
