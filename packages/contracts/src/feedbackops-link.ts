/**
 * FeedbackOps ↔ platform deep-link codec (docs/integration/feedbackops-deeplink.md, contract: 2).
 * Direction A builds only the URLs the FeedbackOps strict search schemas accept today
 * (submodule commit dc7638f); direction B builds/validates platform inbound URLs (06 §6/§22).
 * Reuses the global-Context codec in ./url; adds no React, env, registry or cross-package imports.
 */
import { buildQuery, ContractError, isAppRelativePath, normalizeSet, parseDateTime, parseQuery, type GlobalContext, type Pair } from './url.js';

const fail = (code: string, message: string): never => { throw new ContractError(code, message); };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuid = (value: string, field: string): string => {
  if (!UUID.test(value)) return fail('feedbackops_id', `${field} must be a uuid (8-4-4-4-12 hex), got ${JSON.stringify(value)}`);
  return value;
};

/** `platformReturn` is the absolute platform URL FeedbackOps links back to (FO ADR-0071). `overall` (/home) does not take it. */
export type FeedbackOpsTarget =
  | { kind: 'voc-create'; managedSystemId?: string; platformReturn?: string }
  | { kind: 'voc-detail'; vocId: string; managedSystemId?: string; platformReturn?: string }
  | { kind: 'survey-detail'; surveyId: string; platformReturn?: string }
  | { kind: 'voc-list'; managedSystemId: string; platformReturn?: string }
  | { kind: 'task-list'; managedSystemId: string; platformReturn?: string }
  | { kind: 'survey-list'; managedSystemId: string; platformReturn?: string }
  | { kind: 'overall' };

/** FeedbackOps' `platformReturn` length cap (FO ADR-0071). */
export const PLATFORM_RETURN_MAX = 2048;

/** FO ADR-0071 syntax: absolute URL ≤ 2048 chars, https (http only for localhost/127.0.0.1), no userinfo.
 *  Checked before emit so FeedbackOps never silently drops a value the platform sent. Origin trust is FeedbackOps' allowlist. */
function platformReturnValue(value: string): string {
  const reject = (why: string): never => fail('feedbackops_return', `platformReturn ${why}, got ${JSON.stringify(value.length > 80 ? value.slice(0, 80) + '…' : value)}`);
  if (value.length > PLATFORM_RETURN_MAX) return reject(`must be at most ${PLATFORM_RETURN_MAX} characters`);
  let url: URL;
  try { url = new URL(value); } catch { return reject('must be an absolute URL'); }
  if (url.username !== '' || url.password !== '') return reject('must not carry userinfo');
  const loopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) return reject('must be https (http only for localhost/127.0.0.1)');
  return value;
}

/** The return value for the page the user is on: the full URL, else (too long) its path-only URL, else none. Never throws. */
export function platformReturnFor(fullUrl: string, pathOnlyUrl: string): string | undefined {
  for (const candidate of [fullUrl, pathOnlyUrl]) {
    try { return platformReturnValue(candidate); } catch (error) { if (!(error instanceof ContractError)) throw error; }
  }
  return undefined;
}

const withReturn = (params: Pair[], value: string | undefined): Pair[] =>
  value === undefined ? params : [...params, ['platformReturn', platformReturnValue(value)]];

export type PlatformHop =
  | { menuId: 'equipment-detail'; equipmentId: string }
  | { menuId: 'equipment-master' }
  | { menuId: 'cycle-time' };

/** Canonical absolute origin via URL-standard parsing: input must equal `new URL(input).origin`
 *  (a single trailing '/' is allowed); https anywhere, http only for loopback hosts; no path/query/hash/userinfo. */
function origin(input: string): string {
  let url: URL;
  try { url = new URL(input); } catch { return fail('feedbackops_origin', `origin must be an absolute https://host[:port] URL (http only for localhost/127.0.0.1; no path/query/hash/userinfo), got ${JSON.stringify(input)}`); }
  const canonical = url.origin;
  if (input !== canonical && !(input.endsWith('/') && input.slice(0, -1) === canonical)) {
    return fail('feedbackops_origin', `origin must be the canonical URL origin (${canonical}), got ${JSON.stringify(input)}`);
  }
  const scheme = url.protocol.slice(0, -1);
  if (scheme !== 'https' && scheme !== 'http') return fail('feedbackops_origin', `origin scheme must be https or http, got ${JSON.stringify(input)}`);
  if (scheme === 'http' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') return fail('feedbackops_origin', `http is allowed only for localhost/127.0.0.1, got ${url.hostname}`);
  if (url.hostname.endsWith('.')) return fail('feedbackops_origin', `origin host must not end with a dot, got ${JSON.stringify(input)}`);
  return canonical;
}

/** One nonblank path segment; '.'/'..' are rejected because browsers normalize them away in the path. */
function equipmentDetailId(id: string): string {
  if (!id.length || id === '.' || id === '..' || Array.from(id).every(c => /\s/.test(c))) {
    return fail('invalid_id', `equipmentId must be a single nonblank path segment and must not be '.' or '..', got ${JSON.stringify(id)}`);
  }
  return id;
}

/** Builder-side parity with parseQuery: reject what it would reject BEFORE serialization silently drops it. */
function validateContext(g: GlobalContext): void {
  if ((g.from === null) !== (g.to === null)) fail('partial_period', 'from and to must be supplied together');
  if (g.from !== null && g.to !== null) {
    if (parseDateTime(g.from, 'from') >= parseDateTime(g.to, 'to')) fail('invalid_period', 'from must be earlier than to');
  }
  if (g.metricVersion !== null && g.metricId === null) fail('metric_pair', 'metricVersion requires metricId (the pair travels together)');
  for (const [field, key] of [['roomNames', 'roomNames'], ['selection', 'selectedEquipmentIds'], ['lotIds', 'lotIds'], ['recipeIds', 'recipeIds']] as const) {
    const ids = g[field];
    if (ids !== null) normalizeSet(ids, key);
  }
}

/** Split an absolute deep link. Fragment or backslash is rejected: neither is part of the contract. */
function splitUrl(url: string): { origin: string; path: string; search: string } {
  if (url.includes('#') || url.includes('\\')) return fail('feedbackops_path', `fragment/backslash is not part of the deep-link contract: ${JSON.stringify(url)}`);
  const m = /^([a-zA-Z][a-zA-Z0-9+.-]*):\/\/([^/?#]*)(\/[^?#]*)(?:\?([^#]*))?$/.exec(url);
  if (!m) return fail('feedbackops_path', `use an absolute link scheme://host/path[?query], got ${JSON.stringify(url)}`);
  return { origin: `${m[1].toLowerCase()}://${m[2].toLowerCase()}`, path: m[3], search: m[4] ?? '' };
}

function queryOf(search: string): Pair[] {
  return [...new URLSearchParams(search.startsWith('?') ? search.slice(1) : search).entries()];
}

/** Direction A — platform → FeedbackOps. Emits only the phase-1 allowlist keys (contract §1). */
export function buildFeedbackOpsLink(input: { origin: string; target: FeedbackOpsTarget }): string {
  const base = origin(input.origin);
  const t = input.target;
  if (t.kind === 'voc-create') {
    const params: Pair[] = [['action', 'create']];
    if (t.managedSystemId !== undefined) params.push(['managedSystem', uuid(t.managedSystemId, 'managedSystemId')]);
    return `${base}/vocs?${new URLSearchParams(withReturn(params, t.platformReturn))}`;
  }
  if (t.kind === 'voc-detail') {
    const params: Pair[] = [['view', 'inbox'], ['selected', uuid(t.vocId, 'vocId')]];
    if (t.managedSystemId !== undefined) params.push(['managedSystem', uuid(t.managedSystemId, 'managedSystemId')]);
    return `${base}/vocs?${new URLSearchParams(withReturn(params, t.platformReturn))}`;
  }
  if (t.kind === 'voc-list') return `${base}/vocs?${new URLSearchParams(withReturn([['view', 'inbox'], ['managedSystem', uuid(t.managedSystemId, 'managedSystemId')]], t.platformReturn))}`;
  if (t.kind === 'task-list') return `${base}/tasks?${new URLSearchParams(withReturn([['managedSystem', uuid(t.managedSystemId, 'managedSystemId')]], t.platformReturn))}`;
  if (t.kind === 'survey-list') return `${base}/surveys?${new URLSearchParams(withReturn([['managedSystem', uuid(t.managedSystemId, 'managedSystemId')]], t.platformReturn))}`;
  if (t.kind === 'overall') return `${base}/home`;
  const surveyPath = `${base}/surveys/${uuid(t.surveyId, 'surveyId')}`;
  const surveyQuery = withReturn([], t.platformReturn);
  return surveyQuery.length ? `${surveyPath}?${new URLSearchParams(surveyQuery)}` : surveyPath;
}

/** Direction A parse — strict allowlist: unknown keys, wrong shapes and non-uuid ids are rejected, never coerced. */
export function parseFeedbackOpsLink(url: string, expectedOrigin: string): { target: FeedbackOpsTarget } {
  const expected = origin(expectedOrigin);
  const split = splitUrl(url);
  if (split.origin !== expected) return fail('feedbackops_origin', `link origin ${split.origin} does not match expectedOrigin ${expected}`);
  const query = queryOf(split.search);
  const single = (key: string): string | null => {
    const values = query.filter(([k]) => k === key).map(([, v]) => v);
    if (values.length > 1) return fail('feedbackops_path', `${key} appears more than once`);
    return values[0] ?? null;
  };
  // `platformReturn` rides on /vocs, /tasks, /surveys and /surveys/{id} only (FO ADR-0071); /home keeps rejecting it.
  const takesReturn = split.path === '/vocs' || split.path === '/tasks' || split.path === '/surveys' || split.path.startsWith('/surveys/');
  const rawReturn = takesReturn ? single('platformReturn') : null;
  const ret = rawReturn === null ? {} : { platformReturn: platformReturnValue(rawReturn) };
  const all = takesReturn ? query.filter(([k]) => k !== 'platformReturn') : query;
  /** The scoped list pages take exactly one query key, `managedSystem=<uuid>` — no `all`, no scope-less URL. */
  const listScope = (path: string): string => {
    const extra = [...new Set(all.filter(([k]) => k !== 'managedSystem').map(([k]) => k))];
    if (extra.length) return fail('feedbackops_path', `${path} takes only managedSystem; unknown key(s) ${extra.join(', ')}`);
    const managed = single('managedSystem');
    if (managed === null) return fail('feedbackops_path', `${path} needs ?managedSystem=<uuid> (no scope-less list link)`);
    return uuid(managed, 'managedSystem');
  };
  if (split.path === '/tasks') return { target: { kind: 'task-list', managedSystemId: listScope('/tasks'), ...ret } };
  if (split.path === '/surveys') return { target: { kind: 'survey-list', managedSystemId: listScope('/surveys'), ...ret } };
  if (split.path === '/home') {
    if (all.length) return fail('feedbackops_path', '/home takes no query');
    return { target: { kind: 'overall' } };
  }
  if (split.path === '/vocs') {
    const known = ['action', 'view', 'selected', 'managedSystem'];
    const unknown = [...new Set(all.filter(([k]) => !known.includes(k)).map(([k]) => k))];
    if (unknown.length) return fail('feedbackops_path', `unknown key(s) ${unknown.join(', ')}; the phase-1 allowlist is ${known.join(', ')}`);
    const action = single('action'); const view = single('view'); const selected = single('selected'); const managed = single('managedSystem');
    if (managed !== null && !UUID.test(managed)) return fail('feedbackops_id', `managedSystem must be a uuid, got ${JSON.stringify(managed)}`);
    if (action !== null) {
      if (action !== 'create' || view !== null || selected !== null) return fail('feedbackops_path', 'use ?action=create[&managedSystem=<uuid>], ?view=inbox&managedSystem=<uuid> or ?view=inbox&selected=<uuid>[&managedSystem=<uuid>]');
      return { target: managed === null ? { kind: 'voc-create' as const, ...ret } : { kind: 'voc-create' as const, managedSystemId: managed, ...ret } };
    }
    if (view === 'inbox' && selected === null && managed !== null) return { target: { kind: 'voc-list' as const, managedSystemId: managed, ...ret } };
    if (view !== null || selected !== null) {
      if (view !== 'inbox' || selected === null) return fail('feedbackops_path', 'voc detail is ?view=inbox&selected=<uuid>');
      const target: FeedbackOpsTarget = { kind: 'voc-detail', vocId: uuid(selected, 'selected') };
      return { target: managed === null ? { ...target, ...ret } : { ...target, managedSystemId: managed, ...ret } };
    }
    return fail('feedbackops_path', '/vocs needs ?action=create, ?view=inbox&managedSystem=<uuid> or ?view=inbox&selected=<uuid>');
  }
  if (split.path.startsWith('/surveys/')) {
    const surveyId = split.path.slice('/surveys/'.length);
    if (!surveyId || surveyId.includes('/')) return fail('feedbackops_path', 'survey detail is /surveys/{surveyId}');
    if (all.length) return fail('feedbackops_path', 'survey detail takes only platformReturn (the rest of its FeedbackOps search schema is builder/list state)');
    return { target: { kind: 'survey-detail', surveyId: uuid(surveyId, 'surveyId'), ...ret } };
  }
  return fail('feedbackops_path', `unsupported FeedbackOps path ${split.path}`);
}

const RETURN_TO: readonly string[] = ['returnTo'];

/** Direction B — FeedbackOps → platform. Generates the canonical inbound URL for a hop (contract §2). */
export function buildPlatformInboundLink(input: {
  origin: string;
  hop: PlatformHop;
  context: GlobalContext;
  returnTo?: string;
}): string {
  const base = origin(input.origin);
  const wantsReturnTo = input.returnTo !== undefined;
  if (wantsReturnTo && input.hop.menuId !== 'equipment-detail') return fail('unsupported_page_key', `returnTo is a page key of equipment-detail only, not ${input.hop.menuId}`);
  if (wantsReturnTo && !isAppRelativePath(input.returnTo!)) return fail('external_return', `returnTo must be an app-relative platform path, got ${JSON.stringify(input.returnTo)}`);
  if (input.hop.menuId === 'equipment-detail') equipmentDetailId(input.hop.equipmentId);
  validateContext(input.context); // before serialization: serializeGlobal would silently drop a one-sided period or orphan metricVersion.
  const page: Pair[] = wantsReturnTo ? [['returnTo', input.returnTo!]] : [];
  const query = buildQuery(input.context, page);
  parseQuery(query, wantsReturnTo ? RETURN_TO : []); // validate the serialized form before hand-out: scopeId/ppid/condition identifiers, set markers.
  const path = input.hop.menuId === 'equipment-detail'
    ? `/equipment/${encodeURIComponent(input.hop.equipmentId)}`
    : input.hop.menuId === 'equipment-master' ? '/equipment' : '/analytics/cycle-time';
  return base + path + query;
}

/** Direction B parse — validates origin, hop path and the §2 rules; `context` is the full parsed
 *  GlobalContext (06 §6.4 preservation) and unregistered keys stay in `extras`. */
export function parsePlatformInboundLink(url: string, expectedOrigin: string): {
  hop: PlatformHop;
  context: GlobalContext;
  extras: Pair[];
  returnTo: string | null;
} {
  const expected = origin(expectedOrigin);
  const split = splitUrl(url);
  if (split.origin !== expected) return fail('feedbackops_origin', `link origin ${split.origin} does not match expectedOrigin ${expected}`);
  let hop: PlatformHop;
  let returnToIsPageKey = false;
  if (split.path === '/equipment') hop = { menuId: 'equipment-master' };
  else if (split.path === '/analytics/cycle-time') hop = { menuId: 'cycle-time' };
  else if (split.path.startsWith('/equipment/')) {
    const raw = split.path.slice('/equipment/'.length);
    if (raw.includes('/')) return fail('invalid_id', `equipmentId must be exactly one path segment, got ${JSON.stringify(raw)}`);
    let equipmentId: string;
    try { equipmentId = decodeURIComponent(raw); } catch { return fail('invalid_id', `equipmentId segment is not decodable: ${JSON.stringify(raw)}`); }
    equipmentDetailId(equipmentId);
    hop = { menuId: 'equipment-detail', equipmentId };
    returnToIsPageKey = true;
  } else return fail('unsupported_path', `unsupported platform hop path ${split.path}`);
  const parsed = parseQuery(split.search, returnToIsPageKey ? RETURN_TO : []);
  if (parsed.extras.some(([k]) => k === 'returnTo')) return fail('unsupported_page_key', `returnTo is a page key of equipment-detail only, not ${hop.menuId}`);
  const returnToPair = parsed.page.find(([k]) => k === 'returnTo') ?? null;
  let returnTo: string | null = null;
  if (returnToPair !== null) {
    if (!isAppRelativePath(returnToPair[1])) return fail('external_return', `returnTo must be an app-relative platform path, got ${JSON.stringify(returnToPair[1])}`);
    returnTo = returnToPair[1];
  }
  return {
    hop,
    context: parsed.global,
    extras: parsed.extras,
    returnTo,
  };
}
