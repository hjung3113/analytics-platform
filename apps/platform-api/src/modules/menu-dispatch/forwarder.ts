// Minimal forwarder (ADR-0148, plan node 1729f): the `handle` implementation for an endpoint whose
// owner-table row points at an upstream server. One path: POST the original request body shape
// `{endpoint, context, params}` to `${baseUrl}${path}` with the identity token (ADR-0095 §2/§5)
// and the correlation id, and return the upstream envelope field for field as `EndpointResult`.
// The forwarder never makes up an outcome (ADR-0095 prohibition 7): a transport failure — network
// error, timeout, non-2xx, non-JSON or malformed envelope — surfaces as `MenuUpstreamError`, which
// the route answers with 502/504 and no upstream body text.

import { z } from 'zod';

import type { IdentityTokenSigner } from './identity-token.js';
import type { ScopeGrant } from './scope-resolver.js';
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
 * The upstream response envelope (`answerOf` of the upstream route). Strict: an unknown key means
 * the upstream contract diverged, and the request fails closed as 502 instead of silently passing
 * a field this side never agreed to. `correlationId` is the upstream's own echo and is dropped —
 * this side's correlation id is already the request id.
 */
const envelopeSchema = z.strictObject({
  outcome: z.enum(['ok', 'empty', 'error', 'forbidden', 'too_large', 'timeout']),
  data: z.unknown().refine((value) => value !== undefined, 'data is required'),
  assessments: z.array(z.unknown()).optional(),
  trust: z.unknown().optional(),
  message: z.string().optional(),
  correlationId: z.string().optional(),
});

/** Lossless string form of a scope grant for the token claim (`{site, rooms}` is not a string). */
const scopeClaim = (grant: ScopeGrant): string => JSON.stringify(grant);

export interface MenuForwarder {
  forward({ endpointId, path, args }: { endpointId: string; path: string; args: EndpointHandlerArgs }): Promise<EndpointResult>;
}

export function createMenuForwarder({
  baseUrl,
  timeoutMs,
  signer,
  fetch: fetchImpl = fetch as MenuUpstreamFetch,
}: {
  baseUrl: string;
  timeoutMs: number;
  signer: IdentityTokenSigner;
  fetch?: MenuUpstreamFetch;
}): MenuForwarder {
  return {
    async forward({ endpointId, path, args }) {
      const token = signer.sign({
        sub: args.actor.actor_id,
        wid: args.actor.workspace_id,
        sv: await args.sessionVersion(),
        cid: args.correlationId,
        scopes: args.scopes.map(scopeClaim),
        htm: 'POST',
        htu: path,
      });
      const timeout = AbortSignal.timeout(timeoutMs);
      const signal = AbortSignal.any([...(args.signal ? [args.signal] : []), timeout]);
      let body: unknown;
      try {
        signal.throwIfAborted();
        const response = await fetchImpl(`${baseUrl}${path}`, {
          method: 'POST',
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
      if (!parsed.success) throw new MenuUpstreamError('unavailable');
      const envelope = parsed.data;
      return {
        outcome: envelope.outcome,
        data: envelope.data,
        ...(envelope.assessments !== undefined ? { assessments: envelope.assessments } : {}),
        ...(envelope.trust !== undefined ? { trust: envelope.trust } : {}),
        ...(envelope.message !== undefined ? { message: envelope.message } : {}),
      };
    },
  };
}
