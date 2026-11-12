import { z } from 'zod';

import type { ScopeResolver } from './scope-resolver.js';

export type ScopeResolverFetch = (
  input: string,
  init: { method: 'POST'; headers: Record<string, string>; body: string; signal?: AbortSignal; redirect: 'error' },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

const grantsSchema = z.array(z.object({
  site: z.string().min(1),
  rooms: z.array(z.string().min(1)),
}).strict());

/** Calls the deployment's grant service; every failure rejects without upstream details. */
export function createHttpScopeResolver(options: {
  baseUrl: string;
  timeoutMs: number;
  fetch?: ScopeResolverFetch;
}): ScopeResolver {
  if (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs <= 0) {
    throw new Error('Scope resolver timeoutMs must be a positive integer');
  }
  const url = new URL(options.baseUrl);
  url.pathname = `${url.pathname.replace(/\/$/, '')}/scopes/resolve`;
  const fetch = options.fetch ?? globalThis.fetch;
  return {
    async resolve(actor, signal) {
      try {
        const timeout = AbortSignal.timeout(options.timeoutMs);
        const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
        requestSignal.throwIfAborted();
        const response = await fetch(url.toString(), {
          method: 'POST',
          redirect: 'error',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ actor_id: actor.actor_id, workspace_id: actor.workspace_id }),
          signal: requestSignal,
        });
        if (!response.ok) throw new Error('Grant service refused request');
        const grants = grantsSchema.parse(await response.json());
        requestSignal.throwIfAborted();
        return grants;
      } catch {
        // Neither upstream response text nor transport/schema errors may disclose grant data.
        throw new Error('Scope resolution failed');
      }
    },
  };
}
