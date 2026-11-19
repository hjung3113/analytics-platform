// `menuQuery` judgment (real-server-checklist §3 steps 1–10) against the server's own declarations.
// Order is contract: shape → params → permission → scope → limits →
// explicit empty set → time domain (`mergeTimeDomain`, time-domain.ts) → handler → row cap → response.
// The module that contributes an endpoint owns the data and its assessments/trust; this file owns
// only the order and the generic checks. It never reads a table.

import { menuQueryContextSchema } from '@ap/contract-schemas';

import { MenuUpstreamError } from './forwarder.js';

import { tokenDenial } from '../permissions/check-service.js';
import type { PlatformActor } from '../platform-port/permissions.js';
import { hasRequestScope, type ScopeGrant, type ScopeResolver } from './scope-resolver.js';
import type { MenuDispatchRegistry } from './registry.js';
import { judgeTimeDomain, wallClockMs, type SiteTimeDomains, type TimeDomainVerdict } from './time-domain.js';
import type { ContextKey, EndpointOutcome, EndpointResult, MenuEndpointDeclaration } from './types.js';

export interface QueryAnswer {
  outcome: EndpointOutcome;
  data: unknown;
  assessments: readonly unknown[];
  trust: unknown;
  message?: string;
  recovery?: EndpointResult['recovery'];
}

const isPlain = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const isCalendarTime = (value: unknown): boolean => !Number.isNaN(wallClockMs(value));

/** The wire fields each applied Context key puts into `context` (`projectContext`, menu-query.ts). */
const WIRE_FIELDS: Readonly<Record<ContextKey, readonly string[]>> = {
  time: ['from', 'to'],
  roomNames: ['roomNames'],
  line: ['lineNames'],
  prcGroup: ['prcGroups'],
  condition: ['condition'],
  selection: ['selection'],
  lot: ['lotIds'],
  ppid: ['ppid'],
  recipe: ['recipeIds'],
  metric: ['metricId', 'metricVersion'],
};

/** Id-set fields: `[]` is an explicit empty set (step 6). */
const SET_FIELDS = ['roomNames', 'lineNames', 'prcGroups', 'selection', 'lotIds', 'recipeIds'] as const;

/** The context fields the endpoint applies, in wire naming, including `membershipBasis` (it travels with condition/prcGroup). */
export function appliedContextFields(declaration: MenuEndpointDeclaration): string[] {
  const { context } = declaration.spec;
  const fields: string[] = [];
  for (const [key, capability] of Object.entries(context) as [ContextKey, string][]) {
    if (capability === 'apply') fields.push(...WIRE_FIELDS[key]);
  }
  if (context.condition === 'apply' || context.prcGroup === 'apply') fields.push('membershipBasis');
  return fields;
}

export type QueryShape =
  | {
      ok: true;
      declaration: MenuEndpointDeclaration;
      context: Record<string, unknown>;
      params: Record<string, unknown>;
      scopeResolver?: ScopeResolver;
      timeDomains?: SiteTimeDomains;
    }
  | { ok: false; message: string };

const fail = (message: string): QueryShape => ({ ok: false, message });

/** Steps 1–2: request shape, then the endpoint's own params value check. DB-free. */
export function judgeQueryShape(body: unknown, registry: MenuDispatchRegistry): QueryShape {
  if (!isPlain(body)) return fail('Malformed menu query');
  const topKeys = Object.keys(body);
  if (
    topKeys.length !== 3 ||
    !['endpoint', 'context', 'params'].every((key) => Object.hasOwn(body, key))
  ) {
    return fail('Malformed menu query');
  }
  const declaration =
    typeof body.endpoint === 'string' ? registry.endpoint(body.endpoint) : undefined;
  if (!declaration) return fail('Unknown endpoint');
  const { spec } = declaration;

  const { context, params } = body;
  if (!isPlain(context)) return fail(`${spec.id}: context must be an object`);
  const applied = [...(spec.requiresScope ? ['scopeId'] : []), ...appliedContextFields(declaration)];
  for (const key of Object.keys(context)) {
    if (!applied.includes(key)) return fail(`${spec.id} does not apply context ${key}`);
  }
  for (const key of applied) {
    if (!Object.hasOwn(context, key) || context[key] === undefined) {
      return fail(`${spec.id} needs context ${key}`);
    }
  }
  const parsed = menuQueryContextSchema.safeParse(context);
  if (!parsed.success) return fail(`${spec.id}: context has an invalid value`);
  if (spec.context.time === 'apply' && (context.from === null || context.to === null)) {
    return fail(`${spec.id}: time needs from and to`);
  }
  if (context.metricVersion != null && context.metricId == null) {
    return fail(`${spec.id}: metricVersion needs metricId`);
  }
  if (context.membershipBasis === 'asOf' && context.condition == null && context.prcGroups == null) {
    return fail(`${spec.id}: asOf needs a condition or PRC groups`);
  }
  // Mirrors createMockAdapter (mock-server query/endpoints.ts): asOf is not supported with a condition.
  if (context.membershipBasis === 'asOf' && context.condition != null) {
    return fail('membership_basis_unsupported');
  }
  // Mirrors the mock: a limits.maxHours endpoint reads the period, so a non-calendar bound is an error.
  if (
    spec.limits?.maxHours !== undefined &&
    (!isCalendarTime(context.from) || !isCalendarTime(context.to))
  ) {
    return fail('invalid request context');
  }
  // Mirrors the mock's missingRequiredContext: null or '' in any field; a required time also needs from < to.
  for (const key of spec.requiredContext ?? []) {
    if (WIRE_FIELDS[key].some((field) => context[field] == null || context[field] === '')) {
      return fail(`${spec.id}: required context ${key} is missing`);
    }
    if (key === 'time' && !(wallClockMs(context.from) < wallClockMs(context.to))) {
      return fail(`${spec.id}: required context time is not an increasing period`);
    }
  }

  // Step 7 judges this period; a merging read never reaches the explicit-empty answer with a period it would refuse.
  if (spec.mergeTimeDomain && !(wallClockMs(context.from) < wallClockMs(context.to))) {
    return fail(`${spec.id}: time is not an increasing calendar period`);
  }

  if (!isPlain(params)) return fail(`${spec.id}: params must be an object`);
  // Absent optional params are allowed; required values are the declaration's own `validate`.
  for (const key of Object.keys(params)) {
    if (!spec.paramKeys.includes(key)) return fail(`${spec.id} takes no param ${key}`);
  }
  const judged = declaration.validate(params);
  if (!judged.ok) return fail(judged.message);
  return {
    ok: true, declaration, context, params,
    ...(registry.scopeResolver ? { scopeResolver: registry.scopeResolver } : {}),
    ...(registry.timeDomains ? { timeDomains: registry.timeDomains } : {}),
  };
}

const answer = (
  outcome: EndpointOutcome,
  over: Partial<Omit<QueryAnswer, 'outcome'>> = {},
): QueryAnswer => ({ outcome, data: null, assessments: [], trust: null, ...over });

const WALL_CLOCK_HOUR_MS = 3_600_000;

/** Step 5 (hours): return the exceeded wall-clock cap when there is no narrowing Selection. */
function exceededHourLimit(declaration: MenuEndpointDeclaration, context: Record<string, unknown>) {
  const maxHours = declaration.spec.limits?.maxHours;
  if (maxHours === undefined || typeof context.from !== 'string' || typeof context.to !== 'string') {
    return undefined;
  }
  const hours = (wallClockMs(context.to) - wallClockMs(context.from)) / WALL_CLOCK_HOUR_MS;
  const narrowed = Array.isArray(context.selection) && context.selection.length > 0;
  return hours > maxHours && !narrowed ? maxHours : undefined;
}

/** Only the routed core timer creates this reason; caller-supplied upstream errors remain Scope denial. */
class CoreDeadlineExpired extends MenuUpstreamError {
  constructor() { super('timeout'); }
}

/**
 * Scope resolution fails closed; resolver timeouts are owned by the injected adapter. The API-token rule
 * (ADR-0116: owner grants ∩ token scope) is judged here once, before any resolver, so no resolver can skip it.
 */
export async function resolveRequestScopes(
  resolver: ScopeResolver | undefined,
  actor: PlatformActor,
  context: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<readonly ScopeGrant[] | null> {
  if (tokenDenial('scope.read')) return null;
  try {
    const scopes = await resolver?.resolve(actor, signal);
    if (signal?.aborted || !scopes?.length) return null;
    if (!hasRequestScope(context, scopes)) return null;
    return scopes;
  } catch {
    if (signal?.aborted && signal.reason instanceof CoreDeadlineExpired) throw signal.reason;
    return null;
  }
}

/**
 * Step 7 (kernel §6.3, ADR-0172): a `mergeTimeDomain` endpoint reaches its handler only when the requested Site's own
 * guarantee covers `[from, to)` in one time domain. Registration guarantees `requiresScope`, an applied time and the
 * guarantees; the reads are repeated so an unvalidated registry still fails closed.
 */
function judgeRequestTimeDomain(shape: Extract<QueryShape, { ok: true }>): TimeDomainVerdict {
  const { scopeId, from, to } = shape.context;
  const windows = typeof scopeId === 'string' ? shape.timeDomains?.get(scopeId) : undefined;
  if (!windows || typeof from !== 'string' || typeof to !== 'string') return { ok: false, message: 'time_domain_unverified' };
  return judgeTimeDomain(windows, from, to);
}

export const unavailableSessionVersion = async (): Promise<string> => {
  throw new Error('Menu dispatch sessionVersion reader is not configured');
};

/** Steps 3–10 for a request that passed `judgeQueryShape`. */
export async function runQuery(
  shape: Extract<QueryShape, { ok: true }>,
  actor: PlatformActor,
  correlationId: string,
  signal?: AbortSignal,
  sessionVersion: () => Promise<string> = unavailableSessionVersion,
  arrivedAtMs?: number,
): Promise<QueryAnswer> {
  const timeoutMs = shape.declaration.upstreamTimeoutMs;
  if (timeoutMs === undefined) return runQuerySteps(shape, actor, correlationId, signal, sessionVersion, arrivedAtMs);
  const deadlineAtMs = (arrivedAtMs ?? Date.now()) + timeoutMs;
  const core = new AbortController();
  const combined = AbortSignal.any([core.signal, ...(signal ? [signal] : [])]);
  const remaining = deadlineAtMs - Date.now();
  if (remaining <= 0) throw new MenuUpstreamError('timeout');
  const timer = setTimeout(() => core.abort(new CoreDeadlineExpired()), remaining);
  const checkActive = () => {
    if (core.signal.aborted || Date.now() >= deadlineAtMs) throw new MenuUpstreamError('timeout');
    if (combined.aborted) throw new MenuUpstreamError('unavailable');
  };
  let onAbort: () => void = () => {};
  try {
    checkActive();
    const aborted = new Promise<never>((_resolve, reject) => {
      onAbort = () => reject(new MenuUpstreamError(core.signal.aborted ? 'timeout' : 'unavailable'));
      combined.addEventListener('abort', onAbort, { once: true });
      if (combined.aborted) onAbort();
    });
    const result = await Promise.race([runQuerySteps(shape, actor, correlationId, combined, sessionVersion, arrivedAtMs, deadlineAtMs, checkActive), aborted]);
    checkActive();
    return result;
  } finally {
    clearTimeout(timer);
    combined.removeEventListener('abort', onAbort);
  }
}

async function runQuerySteps(
  shape: Extract<QueryShape, { ok: true }>,
  actor: PlatformActor,
  correlationId: string,
  signal: AbortSignal | undefined,
  sessionVersion: () => Promise<string>,
  arrivedAtMs?: number,
  deadlineAtMs?: number,
  checkActive: () => void = () => {},
): Promise<QueryAnswer> {
  const { declaration, context, params } = shape;
  const authorized = await declaration.authorize(actor);
  checkActive();
  if (!authorized) {
    return answer('forbidden', { message: `No permission ${declaration.spec.permission}` });
  }
  const scopes = declaration.spec.requiresScope
    ? await resolveRequestScopes(shape.scopeResolver, actor, context, signal)
    : [];
  checkActive();
  if (scopes === null) return answer('forbidden');
  const hourLimit = exceededHourLimit(declaration, context);
  if (hourLimit !== undefined) {
    // The wire field expresses a whole-hour window. Round down to keep it within the declared limit.
    const maxHours = Math.floor(hourLimit);
    return answer('too_large', Number.isSafeInteger(maxHours) && maxHours > 0 ? { recovery: { maxHours } } : {});
  }
  if (SET_FIELDS.some((field) => Array.isArray(context[field]) && context[field].length === 0)) {
    return answer('empty');
  }
  let timeDomainId: string | undefined;
  if (declaration.spec.mergeTimeDomain) {
    const verdict = judgeRequestTimeDomain(shape);
    // The deadline or a cancellation that landed after Scope resolution still stops the handler from starting.
    checkActive();
    if (signal?.aborted) return answer('error', { message: 'time_domain_unverified' });
    if (!verdict.ok) return answer('error', { message: verdict.message });
    timeDomainId = verdict.timeDomainId;
  }
  const result = await declaration.handle({ actor, context, params, correlationId, scopes, sessionVersion, ...(timeDomainId === undefined ? {} : { timeDomainId }), ...(arrivedAtMs === undefined ? {} : { arrivedAtMs }), ...(deadlineAtMs === undefined ? {} : { deadlineAtMs }), ...(signal ? { signal } : {}) });
  const { maxRows } = declaration.spec.limits ?? {};
  if (maxRows !== undefined && (result.outcome === 'ok' || (result.outcome === 'empty' && result.rowsRead !== undefined))) {
    if (!Array.isArray(result.data)) {
      // Declared a row cap but did not return rows: a declaration misuse, not a data answer.
      return answer('error', { message: `${declaration.spec.id} declares maxRows but returned no rows` });
    }
    if ((result.rowsRead ?? result.data.length) > maxRows) return answer('too_large');
  }
  return answer(result.outcome, {
    data: result.data ?? null,
    assessments: result.assessments ?? [],
    trust: result.trust ?? null,
    ...(result.message !== undefined ? { message: result.message } : {}),
    ...(result.recovery !== undefined ? { recovery: result.recovery } : {}),
  });
}
