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
  for (const key of spec.requiredContext ?? []) {
    if (WIRE_FIELDS[key].some((field) => context[field] === null)) {
      return fail(`${spec.id}: required context ${key} is null`);
    }
  }

  if (!isPlain(params)) return fail(`${spec.id}: params must be an object`);
  for (const key of Object.keys(params)) {
    if (!spec.paramKeys.includes(key)) return fail(`${spec.id} takes no param ${key}`);
  }
  for (const key of spec.paramKeys) {
    if (!Object.hasOwn(params, key)) return fail(`${spec.id} needs param ${key}`);
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
  const hours = (Date.parse(`${context.to}Z`) - Date.parse(`${context.from}Z`)) / WALL_CLOCK_HOUR_MS;
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
