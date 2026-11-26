// Minimal forwarder (ADR-0148, plan node 1729f): the `handle` implementation for an endpoint whose
// owner-table row points at an upstream server. One path: POST the original request body shape
// `{endpoint, context, params}` to `${baseUrl}${path}` with the identity token (ADR-0095 §2/§5)
// and the correlation id, then validate the envelope and constrain equipment recovery before returning it.
// The forwarder never makes up an outcome (ADR-0095 prohibition 7): a transport failure — network
// error, timeout, non-2xx, non-JSON or malformed envelope — surfaces as `MenuUpstreamError`, which
// the route answers with 502/504 and no upstream body text.

import { apiResponseSchema, assessmentSchema, trustSchema } from '@ap/contract-schemas';
import { z } from 'zod/v4';

import type { IdentityTokenSigner } from './identity-token.js';
import { hasRequestScope, type ScopeGrant } from './scope-resolver.js';
import type { EndpointHandlerArgs, EndpointResult } from './types.js';

/** Structural minimum of an upstream `fetch` response. */
export interface MenuUpstreamResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

/** Structural minimum of `fetch` the forwarder needs; the host injects it (voyage.ts idiom). */
export type MenuUpstreamFetch = (
  input: string,
  init: {
    method: 'POST';
    redirect: 'error';
    headers: Record<string, string>;
    body: string;
    signal: AbortSignal;
  },
) => Promise<MenuUpstreamResponse>;

/**
 * The upstream answer did not arrive as a valid envelope. `timeout` answers 504, everything else
 * (unreachable, non-2xx, non-JSON, malformed envelope) 502. The message is fixed: no upstream
 * body text or diagnostics travel to the client.
 */
export class MenuUpstreamError extends Error {
  readonly kind: 'unavailable' | 'timeout';

  constructor(kind: 'unavailable' | 'timeout') {
    super(kind === 'timeout' ? 'menu-query upstream timed out' : 'menu-query upstream is unavailable');
    this.name = 'MenuUpstreamError';
    this.kind = kind;
  }

  get httpStatus(): 502 | 504 {
    return this.kind === 'timeout' ? 504 : 502;
  }

  get code(): 'upstream.unavailable' | 'upstream.timeout' {
    return this.kind === 'timeout' ? 'upstream.timeout' : 'upstream.unavailable';
  }
}

/**
 * Validate the complete canonical wire envelope. Reject unknown keys, including nested metadata,
 * instead of stripping fields that the upstream sent. The correlation echo must match this request.
 */
const envelopeSchema = apiResponseSchema(z.unknown().refine((value) => value !== undefined, 'data is required'))
  .extend({ assessments: z.array(assessmentSchema.strict()), trust: trustSchema.strict().nullable() })
  .strict();

/** Owner declarations must name a pathname, without URL normalization or query/fragment policy. */
export function validateMenuOwnerPath(path: string): void {
  const dotSegment = path.split('/').some((segment) => {
    const decoded = segment.replace(/%2e/gi, '.');
    return decoded === '.' || decoded === '..';
  });
  if (!path.startsWith('/') || /[?#\\\s]/.test(path) || dotSegment) {
    throw new Error('Invalid menu upstream owner path: expected an absolute pathname without dot segments, query, fragment, backslash or whitespace');
  }
}

/** Strict input, then canonical URL and no trailing slash so concatenation has one separator. */
export function normalizeMenuUpstreamBaseUrl(baseUrl: string): string {
  const invalid = () => new Error('Invalid MENU_UPSTREAM_BASE_URL: expected an http(s) URL without whitespace, credentials, query or fragment');
  if (/[\s?#]/.test(baseUrl)) throw invalid();
  let url: URL;
  try { url = new URL(baseUrl); } catch { throw invalid(); }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw invalid();
  if (url.username !== '' || url.password !== '') throw invalid();
  return url.href.replace(/\/+$/, '');
}

function destinationOf(baseUrl: string, path: string): URL {
  validateMenuOwnerPath(path);
  return new URL(`${baseUrl}${path}`);
}

/** Lossless string form of a scope grant for the token claim (`{site, rooms}` is not a string). */
const scopeClaim = (grant: ScopeGrant): string => JSON.stringify(grant);

export interface RoutedEnvelopeDestination {
  baseUrl: string;
  aud?: string;
  site: string | null;
  rooms: readonly string[];
}
export interface MenuForwarder {
  forward(input: { endpointId: string; path: string; args: EndpointHandlerArgs; routed?: RoutedEnvelopeDestination }): Promise<EndpointResult>;
}

/** Server-owned evidence for equipment matching this query, independent of the envelope provider's reply. */
type ResolveEquipmentLocations = (input: {
  endpointId: string;
  args: EndpointHandlerArgs;
  equipmentIds: readonly string[];
  signal: AbortSignal;
}) => Promise<ReadonlyMap<string, { site: string; room: string }>>;

async function proveEquipmentRecovery(
  affected: string[] | undefined,
  authorized: string[] | undefined,
  request: { endpointId: string; args: EndpointHandlerArgs; routed?: RoutedEnvelopeDestination; signal: AbortSignal },
  resolve: ResolveEquipmentLocations | undefined,
) {
  const { endpointId, args, routed, signal } = request;
  if (!affected || !authorized || !resolve || signal.aborted || !hasRequestScope(args.context, args.scopes)) return;
  const { scopeId, roomNames, selection } = args.context;
  if (routed && routed.site !== scopeId) return;

  const equipmentIds = [...new Set([...affected, ...authorized])];
  let locations: Awaited<ReturnType<ResolveEquipmentLocations>>;
  try {
    locations = await resolve({ endpointId, args, equipmentIds, signal });
  } catch {
    return;
  }
  if (signal.aborted) return;

  const rooms = new Set(args.scopes.filter(grant => grant.site === scopeId).flatMap(grant => grant.rooms));
  const requestedRooms = Array.isArray(roomNames) ? new Set(roomNames) : undefined;
  const routedRooms = routed && new Set(routed.rooms);
  const selected = Array.isArray(selection) ? new Set(selection) : undefined;
  const proven = new Set(equipmentIds.filter(id => {
    const location = locations.get(id);
    return location !== undefined && location.site === scopeId && rooms.has(location.room)
      && (!requestedRooms || requestedRooms.has(location.room))
      && (!routedRooms || routedRooms.has(location.room))
      && (!selected || selected.has(id));
  }));
  const authorizedEquipmentIds = [...new Set(authorized.filter(id => proven.has(id)))];
  const affectedEquipmentIds = [...new Set(affected.filter(id => proven.has(id)))];
  const authorizedSet = new Set(authorizedEquipmentIds);
  if (affectedEquipmentIds.length === 0 || !affectedEquipmentIds.every(id => authorizedSet.has(id))
    || authorizedSet.size <= affectedEquipmentIds.length) return;
  return { affectedEquipmentIds, authorizedEquipmentIds };
}

type UpstreamDeniedScope = NonNullable<NonNullable<EndpointResult['recovery']>['deniedScope']>;

function deniedScopeOfRequest(target: UpstreamDeniedScope | undefined, context: Record<string, unknown>): target is UpstreamDeniedScope {
  if (!target || target.site !== context.scopeId) return false;
  if (target.kind === 'site') return true;
  return Array.isArray(context.roomNames) && context.roomNames.includes(target.room);
}

function fixedEquipmentRefusal(message: string | undefined, reason: string): string | undefined {
  const prefix = `${reason} · fixed_equipment_limit: `;
  if (!message?.startsWith(prefix)) return undefined;
  // Match the wire validation in kernel i18n's parseFixedEquipmentLimit. The API runtime cannot import kernel (boundary rule 11).
  const counts = /^([1-9]\d*)\/([1-9]\d*)$/.exec(message.slice(prefix.length));
  if (!counts) return undefined;
  const count = Number(counts[1]);
  const limit = Number(counts[2]);
  if (!Number.isSafeInteger(count) || !Number.isSafeInteger(limit) || count <= limit) return undefined;
  return `${prefix}${count}/${limit}`;
}

export function createMenuForwarder({
  baseUrl,
  timeoutMs,
  signer,
  fetch: fetchImpl = fetch as MenuUpstreamFetch,
  resolveEquipmentLocations,
}: {
  baseUrl: string;
  timeoutMs: number;
  signer: IdentityTokenSigner;
  fetch?: MenuUpstreamFetch;
  resolveEquipmentLocations?: ResolveEquipmentLocations;
}): MenuForwarder {
  const normalizedBaseUrl = normalizeMenuUpstreamBaseUrl(baseUrl);
  return {
    async forward({ endpointId, path, args, routed }) {
      const destination = routed ? new URL(normalizeMenuUpstreamBaseUrl(routed.baseUrl)) : destinationOf(normalizedBaseUrl, path);
      const token = signer.sign({
        sub: args.actor.actor_id,
        wid: args.actor.workspace_id,
        sv: await args.sessionVersion(),
        cid: args.correlationId,
        scopes: routed ? (routed.site === null ? [] : [scopeClaim({ site: routed.site, rooms: [...routed.rooms] })]) : args.scopes.map(scopeClaim),
        ...(routed ? { aud: routed.aud ?? 'analytics' } : {}),
        htm: 'POST',
        htu: destination.pathname,
      });
      const timeout = AbortSignal.timeout(timeoutMs);
      const signal = AbortSignal.any([...(args.signal ? [args.signal] : []), timeout]);
      let body: unknown;
      try {
        signal.throwIfAborted();
        const response = await fetchImpl(destination.href, {
          method: 'POST',
          redirect: 'error',
          headers: {
            'content-type': 'application/json',
            'x-correlation-id': args.correlationId,
            'x-internal-identity': token,
          },
          body: JSON.stringify({ endpoint: endpointId, context: args.context, params: args.params }),
          signal,
        });
        if (!response.ok) throw new MenuUpstreamError('unavailable');
        body = await response.json();
        signal.throwIfAborted();
      } catch {
        // The same budget covers receiving headers and consuming JSON. Preserve the first abort cause.
        throw new MenuUpstreamError(timeout.aborted && signal.reason === timeout.reason ? 'timeout' : 'unavailable');
      }
      const parsed = envelopeSchema.safeParse(body);
      if (!parsed.success || parsed.data.correlationId !== args.correlationId) throw new MenuUpstreamError('unavailable');
      const envelope = parsed.data;
      // An upstream denial target reaches the access-request dialog only when it names this request's own Site, and
      // for a room one of the submitted rooms; anything else is not evidence about this denial (#2595 review C3).
      const { deniedScope: upstreamDeniedScope, ...rest } = envelope.recovery ?? {};
      const upstreamRecovery = deniedScopeOfRequest(upstreamDeniedScope, args.context)
        ? { ...rest, deniedScope: upstreamDeniedScope } : rest;
      const { affectedEquipmentIds, authorizedEquipmentIds, retryable, ...otherRecovery } = upstreamRecovery;
      const carriesEquipment = affectedEquipmentIds !== undefined || authorizedEquipmentIds !== undefined;
      const reason = envelope.message?.split(' · ', 1)[0]?.split(':', 1)[0]?.trim();
      const aggregationReason = reason === 'time_domain_unverified' || reason === 'time_domain_mismatch' ? reason : undefined;
      const sanitizeDiagnostics = carriesEquipment || aggregationReason !== undefined;
      const fixedEquipmentMessage = aggregationReason && !carriesEquipment && envelope.outcome === 'error'
        ? fixedEquipmentRefusal(envelope.message, aggregationReason) : undefined;
      const message = sanitizeDiagnostics ? fixedEquipmentMessage ?? aggregationReason : envelope.message;
      let recovery = Object.keys(upstreamRecovery).length > 0 ? upstreamRecovery : undefined;
      if (sanitizeDiagnostics) {
        const equipment = carriesEquipment ? await proveEquipmentRecovery(affectedEquipmentIds, authorizedEquipmentIds,
          { endpointId, args, ...(routed && { routed }), signal }, resolveEquipmentLocations) : undefined;
        // Once the refusal lists are hidden, a Retry flag could rerun the same blocked request.
        const validatedRecovery = { ...otherRecovery, ...equipment, ...(equipment && retryable !== undefined && { retryable }) };
        recovery = Object.keys(validatedRecovery).length > 0 ? validatedRecovery : undefined;
      }
      return {
        outcome: envelope.outcome,
        data: envelope.data,
        assessments: sanitizeDiagnostics ? envelope.assessments.map(({ detail: _detail, ...assessment }) => assessment) : envelope.assessments,
        trust: envelope.trust,
        ...(message !== undefined ? { message } : {}),
        ...(recovery !== undefined ? { recovery } : {}),
      };
    },
  };
}
