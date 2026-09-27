/**
 * FeedbackOps ↔ platform deep-link codec (docs/integration/feedbackops-deeplink.md, contract: 1).
 * Direction A builds only the URLs the FeedbackOps strict search schemas accept today
 * (submodule commit 6a0c7f8); direction B builds/validates platform inbound URLs (06 §6/§22).
 * Reuses the global-Context codec in ./url; adds no React, env, registry or cross-package imports.
 */
import { buildQuery, ContractError, emptyGlobal, isAppRelativePath, parseQuery, type GlobalContext, type Pair } from './url';

const fail = (code: string, message: string): never => { throw new ContractError(code, message); };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuid = (value: string, field: string): string => {
  if (!UUID.test(value)) return fail('feedbackops_id', `${field} must be a uuid (8-4-4-4-12 hex), got ${JSON.stringify(value)}`);
  return value;
};

export type FeedbackOpsTarget =
  | { kind: 'voc-create'; managedSystemId?: string }
  | { kind: 'voc-detail'; vocId: string; managedSystemId?: string }
  | { kind: 'survey-detail'; surveyId: string };

export type PlatformHop =
  | { menuId: 'equipment-detail'; equipmentId: string }
  | { menuId: 'equipment-master' }
  | { menuId: 'cycle-time' };

export type HopContext = { scopeId: string | null; from: string | null; to: string | null; selection: string[] | null };

/** Canonical absolute origin: https anywhere, http only for loopback hosts; no path/query/hash/userinfo, no default port. */
function origin(input: string): string {
  const m = /^(https?):\/\/([A-Za-z0-9.-]+)(?::(\d{1,5}))?$/.exec(input);
  if (!m) return fail('feedbackops_origin', `origin must be a bare absolute https://host[:port] (http only for localhost/127.0.0.1; no path/query/hash/userinfo), got ${JSON.stringify(input)}`);
  const scheme = m[1]; const host = m[2].toLowerCase(); const port = m[3] === undefined ? null : Number(m[3]);
  if (scheme === 'http' && host !== 'localhost' && host !== '127.0.0.1') return fail('feedbackops_origin', `http is allowed only for localhost/127.0.0.1, got ${host}`);
  if (port !== null && (port < 1 || port > 65535)) return fail('feedbackops_origin', `invalid port ${m[3]}`);
  if (port !== null && ((scheme === 'https' && port === 443) || (scheme === 'http' && port === 80))) return fail('feedbackops_origin', `drop the default port: ${input}`);
  const canonical = `${scheme}://${host}${port === null ? '' : `:${port}`}`;
  if (canonical !== input) return fail('feedbackops_origin', `origin must be canonical (${canonical}), got ${JSON.stringify(input)}`);
  return canonical;
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
    return `${base}/vocs?${new URLSearchParams(params)}`;
  }
  if (t.kind === 'voc-detail') {
    const params: Pair[] = [['view', 'inbox'], ['selected', uuid(t.vocId, 'vocId')]];
    if (t.managedSystemId !== undefined) params.push(['managedSystem', uuid(t.managedSystemId, 'managedSystemId')]);
    return `${base}/vocs?${new URLSearchParams(params)}`;
  }
  return `${base}/surveys/${uuid(t.surveyId, 'surveyId')}`;
}

/** Direction A parse — strict allowlist: unknown keys, wrong shapes and non-uuid ids are rejected, never coerced. */
export function parseFeedbackOpsLink(url: string, expectedOrigin: string): { target: FeedbackOpsTarget } {
  const expected = origin(expectedOrigin);
  const split = splitUrl(url);
  if (split.origin !== expected) return fail('feedbackops_origin', `link origin ${split.origin} does not match expectedOrigin ${expected}`);
  const all = queryOf(split.search);
  if (split.path === '/vocs') {
    const single = (key: string): string | null => {
      const values = all.filter(([k]) => k === key).map(([, v]) => v);
      if (values.length > 1) return fail('feedbackops_path', `${key} appears more than once`);
      return values[0] ?? null;
    };
    const known = ['action', 'view', 'selected', 'managedSystem'];
    const unknown = [...new Set(all.filter(([k]) => !known.includes(k)).map(([k]) => k))];
    if (unknown.length) return fail('feedbackops_path', `unknown key(s) ${unknown.join(', ')}; the phase-1 allowlist is ${known.join(', ')}`);
    const action = single('action'); const view = single('view'); const selected = single('selected'); const managed = single('managedSystem');
    if (managed !== null && !UUID.test(managed)) return fail('feedbackops_id', `managedSystem must be a uuid, got ${JSON.stringify(managed)}`);
    if (action !== null) {
      if (action !== 'create' || view !== null || selected !== null) return fail('feedbackops_path', 'use ?action=create[&managedSystem=<uuid>] or ?view=inbox&selected=<uuid>[&managedSystem=<uuid>]');
      return { target: managed === null ? { kind: 'voc-create' as const } : { kind: 'voc-create' as const, managedSystemId: managed } };
    }
    if (view !== null || selected !== null) {
      if (view !== 'inbox' || selected === null) return fail('feedbackops_path', 'voc detail is ?view=inbox&selected=<uuid>');
      const target: FeedbackOpsTarget = { kind: 'voc-detail', vocId: uuid(selected, 'selected') };
      return { target: managed === null ? target : { ...target, managedSystemId: managed } };
    }
    return fail('feedbackops_path', '/vocs needs ?action=create or ?view=inbox&selected=<uuid>');
  }
  if (split.path.startsWith('/surveys/')) {
    const surveyId = split.path.slice('/surveys/'.length);
    if (!surveyId || surveyId.includes('/')) return fail('feedbackops_path', 'survey detail is /surveys/{surveyId}');
    if (all.length) return fail('feedbackops_path', 'survey detail takes no query (FeedbackOps search schema is builder-only)');
    return { target: { kind: 'survey-detail', surveyId: uuid(surveyId, 'surveyId') } };
  }
  return fail('feedbackops_path', `unsupported FeedbackOps path ${split.path}`);
}

const RETURN_TO: readonly string[] = ['returnTo'];

/** Direction B — FeedbackOps → platform. Generates the canonical inbound URL for a hop (contract §2). */
export function buildPlatformInboundLink(input: {
  origin: string;
  hop: PlatformHop;
  context: HopContext;
  returnTo?: string;
}): string {
  const base = origin(input.origin);
  const wantsReturnTo = input.returnTo !== undefined;
  if (wantsReturnTo && input.hop.menuId !== 'equipment-detail') return fail('unsupported_page_key', `returnTo is a page key of equipment-detail only, not ${input.hop.menuId}`);
  if (wantsReturnTo && !isAppRelativePath(input.returnTo!)) return fail('external_return', `returnTo must be an app-relative platform path, got ${JSON.stringify(input.returnTo)}`);
  if (input.hop.menuId === 'equipment-detail') {
    const id = input.hop.equipmentId;
    if (!id.length || Array.from(id).every(c => /\s/.test(c))) return fail('invalid_id', `equipmentId must not be empty or whitespace-only, got ${JSON.stringify(id)}`);
  }
  const global: GlobalContext = {
    ...emptyGlobal,
    scopeId: input.context.scopeId,
    from: input.context.from,
    to: input.context.to,
    selection: input.context.selection,
  };
  const page: Pair[] = wantsReturnTo ? [['returnTo', input.returnTo!]] : [];
  const query = buildQuery(global, page);
  parseQuery(query, wantsReturnTo ? RETURN_TO : []); // validate before hand-out: period pair/format/order, ids, set markers.
  const path = input.hop.menuId === 'equipment-detail'
    ? `/equipment/${encodeURIComponent(input.hop.equipmentId)}`
    : input.hop.menuId === 'equipment-master' ? '/equipment' : '/analytics/cycle-time';
  return base + path + query;
}

/** Direction B parse — validates origin, hop path and the §2 rules; unregistered keys stay in `extras` (06 §6.4). */
export function parsePlatformInboundLink(url: string, expectedOrigin: string): {
  hop: PlatformHop;
  context: HopContext;
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
    let equipmentId: string;
    try { equipmentId = decodeURIComponent(raw); } catch { return fail('invalid_id', `equipmentId segment is not decodable: ${JSON.stringify(raw)}`); }
    if (!equipmentId.length) return fail('invalid_id', 'equipmentId must not be empty');
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
    context: { scopeId: parsed.global.scopeId, from: parsed.global.from, to: parsed.global.to, selection: parsed.global.selection },
    extras: parsed.extras,
    returnTo,
  };
}
