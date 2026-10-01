import { emptyGlobal, projectContext } from '@ap/contracts';
import type { ApiResponse, EndpointSpec, GlobalContext } from '@ap/contracts';
import { nextCorrelation, serve } from './server';
import type { Equipment, RoleId } from './world';

/** A menu's mock handler for one declared endpoint. Lives in the menu's `src/mock/` from step 5 on. */
export type MockEndpoint<P, T> = {
  spec: EndpointSpec<P, T>;
  /** Receives only neutralized input: equipment already resolved by the engine, `context` with non-applied keys reset to "no constraint". */
  handle: (input: { equipment: Equipment[]; context: GlobalContext; params: P }) => T;
  isEmpty?: (data: T) => boolean;
  /** Trust source shown in Data Trust; defaults like serve(). */
  source?: string;
  /** Server-attached metricVersion display value (§2.4 step 9); may depend on the request params. */
  metricVersion?: (input: { context: GlobalContext; params: P }) => string | undefined;
  /**
   * Param value check the shape rules cannot express (e.g. a metricVersion the series does not have, #123).
   * Returns an error message to reject the request as `error`, or null. Runs after the shape checks, before
   * permission and data — like an unknown params key, a bad value is a malformed request, not an empty answer.
   */
  validate?: (input: { context: GlobalContext; params: P }) => string | null;
};

export const defineMockEndpoint = <P, T>(
  spec: EndpointSpec<P, T>,
  impl: Omit<MockEndpoint<P, T>, 'spec'>,
): MockEndpoint<P, T> => ({ spec, ...impl });

/** Heterogeneous list (P invariant, see AnyEndpointSpec). */
export type AnyMockEndpoint = MockEndpoint<any, any>;

export class MockRegistrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MockRegistrationError';
  }
}

const requestKeys = ['endpoint', 'context', 'params'] as const;
const contextKeys = new Set<keyof GlobalContext>([
  'scopeId', 'from', 'to', 'roomNames', 'condition', 'selection', 'lotIds', 'ppid', 'recipeIds', 'metricId', 'metricVersion',
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function requestError(message: string): ApiResponse<unknown> {
  return { outcome: 'error', message, data: null, assessments: [], trust: null, correlationId: nextCorrelation() };
}

/**
 * Runs a menu query using the server-owned endpoint declaration. Shape errors return immediately;
 * valid requests enter `serve()` and follow its permission, scenario, scope and data pipeline.
 */
export async function serveEndpoint(
  endpoints: ReadonlyMap<string, AnyMockEndpoint>,
  req: unknown,
  signal?: AbortSignal,
  opts?: { role?: RoleId; latency?: number },
): Promise<ApiResponse<unknown>> {
  if (!isPlainObject(req)) return requestError('request must be a plain object');

  const actualKeys = Object.keys(req);
  const unexpected = actualKeys.find(key => !(requestKeys as readonly string[]).includes(key));
  if (unexpected) return requestError(`unexpected request key ${unexpected}`);
  const missing = requestKeys.find(key => !Object.prototype.hasOwnProperty.call(req, key));
  if (missing) return requestError(`missing request key ${missing}`);
  if (typeof req.endpoint !== 'string') return requestError('request endpoint must be a string');
  if (!isPlainObject(req.context)) return requestError('request context must be a plain object');
  if (!isPlainObject(req.params)) return requestError('request params must be a plain object');

  const endpoint = endpoints.get(req.endpoint);
  if (!endpoint) return requestError(`unknown endpoint ${req.endpoint}`);

  const unknownContextKey = Object.keys(req.context).find(key => !contextKeys.has(key as keyof GlobalContext));
  if (unknownContextKey) return requestError(`unknown context key ${unknownContextKey}`);
  const unknownParamKey = Object.keys(req.params).find(key => !Object.prototype.hasOwnProperty.call(endpoint.spec.paramKeys, key));
  if (unknownParamKey) return requestError(`unknown params key ${unknownParamKey}`);

  const appliedContext = projectContext(endpoint.spec, emptyGlobal);
  const appliedContextKeys = new Set(Object.keys(appliedContext));
  const nonAppliedContextKey = Object.keys(req.context).find(key => !appliedContextKeys.has(key));
  if (nonAppliedContextKey) {
    return requestError(`context key ${nonAppliedContextKey} is not applied by ${endpoint.spec.id}`);
  }

  const missingAppliedContextKey = Object.keys(appliedContext).find(
    key => (req.context as Record<string, unknown>)[key] === undefined,
  );
  if (missingAppliedContextKey) {
    return requestError(`missing context key ${missingAppliedContextKey} for ${endpoint.spec.id}`);
  }

  if (endpoint.spec.context.time === 'apply') {
    for (const key of ['from', 'to'] as const) {
      if (typeof req.context[key] !== 'string') {
        return requestError(`context key ${key} must be a non-null string for ${endpoint.spec.id}`);
      }
    }
  }

  if (endpoint.spec.context.metric === 'apply' && req.context.metricVersion !== null && req.context.metricId === null) {
    return requestError('context key metricVersion requires metricId (06 §6.1)');
  }

  // Build handler input from the validated projection; emptyGlobal keeps non-applied fields neutral.
  // No non-applied request key reaches scope resolution, time-domain checks, or the handler.
  const requestedContext = { ...emptyGlobal, ...req.context } as GlobalContext;
  const projected = projectContext(endpoint.spec, requestedContext);
  const global: GlobalContext = { ...emptyGlobal, ...projected };

  const invalid = endpoint.validate?.({ context: global, params: req.params });
  if (invalid) return requestError(invalid);

  try {
    return await serve({
      permission: endpoint.spec.permission,
      kinds: [...endpoint.spec.kinds],
      requiresScope: endpoint.spec.requiresScope,
      maxHours: endpoint.spec.limits?.maxHours,
      mergeTimeDomain: endpoint.spec.mergeTimeDomain,
      global,
      role: opts?.role,
      latency: opts?.latency,
      signal,
      source: endpoint.source,
      metricVersionOf: endpoint.metricVersion ? () => endpoint.metricVersion!({ context: global, params: req.params }) : undefined,
      isEmpty: endpoint.isEmpty,
      compute: ({ equipment }) => endpoint.handle({ equipment, context: global, params: req.params }),
    });
  } catch (error) {
    // Cancellation is control flow for callers; malformed applied Context is a request error.
    if (typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError') throw error;
    return requestError('invalid request context');
  }
}
