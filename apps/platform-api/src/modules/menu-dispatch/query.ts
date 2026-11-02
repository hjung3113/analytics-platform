// `menuQuery` judgment (real-server-checklist §3 steps 1–10) against the server's own declarations.
// Order is contract: shape → params → permission → [scope: refused at registration] → limits →
// explicit empty set → [time domain: refused at registration] → handler → row cap → response.
// The module that contributes an endpoint owns the data and its assessments/trust; this file owns
// only the order and the generic checks. It never reads a table.

import { menuQueryContextSchema } from '@ap/contract-schemas';

import type { PlatformActor } from '../platform-port/permissions.js';
import type { MenuDispatchRegistry } from './registry.js';
import type { ContextKey, EndpointOutcome, MenuEndpointDeclaration } from './types.js';

export interface QueryAnswer {
  outcome: EndpointOutcome;
  data: unknown;
  assessments: readonly unknown[];
  trust: unknown;
  message?: string;
}

const isPlain = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const DATETIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/;

/** Wall-clock epoch ms of `YYYY-MM-DDTHH:mm:ss` read as UTC digits, or NaN when it is not a real calendar time (kernel §6.3). */
function wallMs(value: unknown): number {
  const m = typeof value === 'string' ? DATETIME.exec(value) : null;
  if (!m) return Number.NaN;
  const [y, mo, d, h, mi, s] = m.slice(1).map(Number) as [number, number, number, number, number, number];
  const date = new Date(Date.UTC(y, mo - 1, d, h, mi, s));
  const real =
    date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d &&
    h <= 23 && mi <= 59 && s <= 59;
  return real ? date.getTime() : Number.NaN;
}

const isCalendarTime = (value: unknown): boolean => !Number.isNaN(wallMs(value));

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
  const applied = appliedContextFields(declaration);
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
    if (key === 'time' && !(wallMs(context.from) < wallMs(context.to))) {
      return fail(`${spec.id}: required context time is not an increasing period`);
    }
  }

  if (!isPlain(params)) return fail(`${spec.id}: params must be an object`);
  // Absent optional params are allowed; required values are the declaration's own `validate`.
  for (const key of Object.keys(params)) {
    if (!spec.paramKeys.includes(key)) return fail(`${spec.id} takes no param ${key}`);
  }
  const judged = declaration.validate(params);
  if (!judged.ok) return fail(judged.message);
  return { ok: true, declaration, context, params };
}

const answer = (
  outcome: EndpointOutcome,
  over: Partial<Omit<QueryAnswer, 'outcome'>> = {},
): QueryAnswer => ({ outcome, data: null, assessments: [], trust: null, ...over });

const WALL_CLOCK_HOUR_MS = 3_600_000;

/** Step 5 (hours): a wall-clock range longer than `maxHours` without a narrowing Selection. */
function overHourLimit(declaration: MenuEndpointDeclaration, context: Record<string, unknown>) {
  const maxHours = declaration.spec.limits?.maxHours;
  if (maxHours === undefined || typeof context.from !== 'string' || typeof context.to !== 'string') {
    return false;
  }
  const hours = (wallMs(context.to) - wallMs(context.from)) / WALL_CLOCK_HOUR_MS;
  const narrowed = Array.isArray(context.selection) && context.selection.length > 0;
  return hours > maxHours && !narrowed;
}

/** Steps 3–10 for a request that passed `judgeQueryShape`. */
export async function runQuery(
  shape: Extract<QueryShape, { ok: true }>,
  actor: PlatformActor,
  correlationId: string,
): Promise<QueryAnswer> {
  const { declaration, context, params } = shape;
  if (!(await declaration.authorize(actor))) {
    return answer('forbidden', { message: `No permission ${declaration.spec.permission}` });
  }
  if (overHourLimit(declaration, context)) return answer('too_large');
  if (SET_FIELDS.some((field) => Array.isArray(context[field]) && context[field].length === 0)) {
    return answer('empty');
  }
  const result = await declaration.handle({ actor, context, params, correlationId });
  const { maxRows } = declaration.spec.limits ?? {};
  if (maxRows !== undefined && result.outcome === 'ok') {
    if (!Array.isArray(result.data)) {
      // Declared a row cap but did not return rows: a declaration misuse, not a data answer.
      return answer('error', { message: `${declaration.spec.id} declares maxRows but returned no rows` });
    }
    if (result.data.length > maxRows) return answer('too_large');
  }
  return answer(result.outcome, {
    data: result.data ?? null,
    assessments: result.assessments ?? [],
    trust: result.trust ?? null,
    ...(result.message !== undefined ? { message: result.message } : {}),
  });
}
