// Declaration bundle file (ADR-0146 decisions 2–4): the deployment config that carries in-house
// endpoint/action declarations, menu permission rows and the owner table (endpointId → upstream path,
// ADR-0095 decision 2) as one validated JSON file. Fail closed: unlike the template reader
// (`managed-systems/platform-systems-sync.ts`, which logs and continues), `loadDeclarationBundle`
// throws on a missing file, bad JSON, a schema error, a duplicate id, an owner-table/endpoint
// mismatch or a permission use the bundle does not declare — a failure stops the boot.
//
// The rows are plain data mirroring the `MenuDispatchContribution` shapes (`types.ts`); the
// `authorize`/`validate`/`handle` functions are supplied later by the declared-endpoint adapter
// (#1729 node g), so the loader returns row data, not `MenuEndpointDeclaration` objects. Local zod
// only: runtime source imports no `@ap/*` package but `@ap/feature-shared` (boundary rule 11).

import { readFile } from 'node:fs/promises';

import { DECLARED_CAPABILITY_DISPLAY_NAME_MAX, ROLE_LEVEL_VALUES, isCapability } from '@ap/feature-shared';
import { z } from 'zod';

import { declaredCapabilityProblems, parseScopeCatalog, type ScopeCatalog } from '../permissions/index.js';
import { PLATFORM_PERMISSION_TABLE } from '../platform-port/permissions.js';
import { CONTEXT_KEYS } from './types.js';
import { isEnvelope } from './bundle/calls.js';
import { paramTypeSchema } from './bundle/bindings.js';
import { ASSESSMENT_KINDS, routeCall, routingSchema } from './bundle/routing.js';
import { targetsSchema } from './bundle/targets.js';
import { routingProblems } from './bundle/validation.js';

const limitsSchema = z.strictObject({
  maxHours: z.number().positive().optional(),
  maxRows: z.number().int().positive().optional(),
});

const contextSchema = z
  .strictObject(Object.fromEntries(CONTEXT_KEYS.map((key) => [key, z.enum(['apply', 'reference']).optional()])))
  .default({});

const endpointSchema = z.strictObject({
  /** '<group>.<name>', globally unique transport key. */
  id: z.string().min(1),
  menuId: z.string().min(1),
  paramKeys: z.array(z.string().min(1)),
  paramTypes: z.record(z.string().min(1), paramTypeSchema).optional(),
  kinds: z.array(z.enum(ASSESSMENT_KINDS)).optional(),
  permission: z.string().min(1),
  requiresScope: z.boolean(),
  context: contextSchema,
  requiredContext: z.array(z.enum(CONTEXT_KEYS)).optional(),
  limits: limitsSchema.optional(),
  mergeTimeDomain: z.boolean(),
});

/**
 * An endpoint row as the bundle may write it with a menu declaration snapshot (#1900 node 1900b, ADR-0156): only `id`
 * is required; the menu-owned fields it leaves out are filled from the snapshot (`fillEndpointsFromSnapshot`) before
 * any other check, and the filled row must then pass `endpointSchema`.
 */
const endpointRowSchema = endpointSchema.partial({
  menuId: true, paramKeys: true, kinds: true, permission: true, requiresScope: true,
  context: true, requiredContext: true, mergeTimeDomain: true,
});

const actionSchema = z.strictObject({
  id: z.string().min(1),
  menuId: z.string().min(1),
  inputKeys: z.array(z.string().min(1)),
  permission: z.string().min(1),
  requiresScope: z.boolean(),
  concurrency: z.enum(['none', 'version']),
  invalidates: z.array(z.string().min(1)),
});

const permissionSchema = z.strictObject({
  permission: z.string().min(1),
  /** A platform capability or one this bundle declares in `capabilities` (cross-checked in `crossProblems`). */
  capability: z.string().min(1),
});

/**
 * A capability the bundle declares (ADR-0157 decisions 1–3). Only `id` is required; every omitted field takes the closed
 * default (`sensitive: true`, `adminModuleBypass: 'none'`, `sessionOnly: true`, `roleLevels: ['admin', 'developer']`,
 * display name = `id`). `tokenOnly` is refused (strict object). The id grammar and the platform-name collisions are
 * judged in `crossProblems` with a readable message.
 */
const capabilitySchema = z.strictObject({
  id: z.string().min(1),
  displayName: z.string().trim().min(1).max(DECLARED_CAPABILITY_DISPLAY_NAME_MAX).optional(),
  sensitive: z.boolean().optional(),
  adminModuleBypass: z.enum(['none', 'unless_denied', 'always']).optional(),
  sessionOnly: z.boolean().optional(),
  roleLevels: z.array(z.enum(ROLE_LEVEL_VALUES)).optional(),
});

const ownerPathSchema = z.string().regex(/^\/.*/, 'an upstream path must start with /');

const bundleSchema = z.strictObject({
  endpoints: z.array(endpointSchema),
  actions: z.array(actionSchema),
  permissions: z.array(permissionSchema),
  capabilities: z.array(capabilitySchema).optional(),
  /** Owner table: every declared endpoint exactly once → the upstream path the forwarder posts to (ADR-0148). */
  endpointOwners: z.record(z.string().min(1), z.union([ownerPathSchema, routingSchema])),
  targets: targetsSchema.optional(),
  scopeCatalog: z.unknown().optional(),
});

/** The bundle before the snapshot fill: endpoint rows may be partial. */
const bundleRowsSchema = bundleSchema.extend({ endpoints: z.array(endpointRowSchema) });

export type DeclaredEndpointLimits = z.infer<typeof limitsSchema>;
export type DeclaredEndpoint = z.infer<typeof endpointSchema>;
/** A bundle endpoint row before the snapshot fill: `id` plus whatever fields the deployment wrote. */
export type DeclaredEndpointRow = z.infer<typeof endpointRowSchema>;
export type DeclaredAction = z.infer<typeof actionSchema>;
export type DeclaredPermission = z.infer<typeof permissionSchema>;
export type DeclaredCapabilityRow = z.infer<typeof capabilitySchema>;
export type DeclarationBundle = {
  readonly scopeCatalog?: ScopeCatalog;
  /** The capabilities this bundle declares (ADR-0157); absent = none. */
  readonly capabilities?: readonly DeclaredCapabilityRow[] | undefined;
  readonly endpoints: readonly DeclaredEndpoint[];
  readonly actions: readonly DeclaredAction[];
  readonly permissions: readonly DeclaredPermission[];
  readonly endpointOwners: Readonly<z.infer<typeof bundleSchema>['endpointOwners']>;
  readonly targets?: z.infer<typeof targetsSchema> | undefined;
};
/** A programmatic bundle before the snapshot fill (`declaredContribution`): endpoint rows may be partial. */
export type DeclarationBundleInput = Omit<DeclarationBundle, 'endpoints'> & { readonly endpoints: readonly DeclaredEndpointRow[] };
export type { Binding, ParamType } from './bundle/bindings.js';
export type { Call } from './bundle/calls.js';
export type { Route, Routing, ScopeCheck } from './bundle/routing.js';
export type { Target, ValueMap } from './bundle/targets.js';

export class DeclarationBundleError extends Error {
  constructor(readonly problems: readonly string[]) {
    super(`declaration bundle refused:\n- ${problems.join('\n- ')}`);
    this.name = 'DeclarationBundleError';
  }
}

const countOf = (values: readonly string[]) => {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return counts;
};

/** Cross-checks the schema cannot name (ADR-0146 decision 4): duplicates, owner-table coverage, permission use. */
function crossProblems(bundle: z.infer<typeof bundleSchema>): string[] {
  const problems: string[] = [];
  const duplicated = (kind: string, values: readonly string[], label: (value: string) => string) => {
    for (const [value, count] of countOf(values)) {
      if (count > 1) problems.push(`${kind} ${label(value)}: declared ${count} times`);
    }
  };
  duplicated('endpoint', bundle.endpoints.map((row) => row.id), (id) => id);
  duplicated('action', bundle.actions.map((row) => row.id), (id) => id);
  duplicated('permission', bundle.permissions.map((row) => row.permission), (permission) => permission);

  const endpointIds = new Set(bundle.endpoints.map((row) => row.id));
  const declaredPermissions = new Set(bundle.permissions.map((row) => row.permission));
  const kernelPermission = (permission: string) => PLATFORM_PERMISSION_TABLE.some((entry) => entry.permission === permission);

  const declaredCapabilities = bundle.capabilities ?? [];
  problems.push(...declaredCapabilityProblems(declaredCapabilities));
  const declaredIds = new Set(declaredCapabilities.map((row) => row.id));
  for (const row of bundle.permissions) {
    if (kernelPermission(row.permission)) {
      problems.push(`permission ${row.permission}: is a kernel permission, not a declared one's`);
    }
    // ADR-0157 decision 1: a platform capability or one this bundle declares; `scope.read` never opens a menu permission
    // (it has no workspace-wide grant). An unused declared capability is not a problem (transition and retire order).
    if (row.capability === 'scope.read') {
      problems.push(`permission ${row.permission}: scope.read cannot open a menu permission (it has no workspace-wide grant)`);
    } else if (!isCapability(row.capability) && !declaredIds.has(row.capability)) {
      problems.push(`permission ${row.permission}: ${row.capability} is not a platform capability nor declared in the bundle's capabilities`);
    }
  }
  for (const [id, path] of Object.entries(bundle.endpointOwners)) {
    if (!endpointIds.has(id)) problems.push(`owner table names endpoint ${id}, which is not declared (owner path ${path})`);
  }
  for (const row of bundle.endpoints) {
    if (new Set(row.kinds).size !== (row.kinds?.length ?? 0)) problems.push(`endpoint ${row.id}: kinds must not contain duplicates`);
    if (!Object.hasOwn(bundle.endpointOwners, row.id)) problems.push(`endpoint ${row.id}: no owner-table row`);
    if (!declaredPermissions.has(row.permission) && !kernelPermission(row.permission)) {
      problems.push(`endpoint ${row.id}: permission ${row.permission} is neither declared in the bundle nor a kernel permission`);
    }
  }
  for (const row of bundle.actions) {
    if (!declaredPermissions.has(row.permission) && !kernelPermission(row.permission)) {
      problems.push(`action ${row.id}: permission ${row.permission} is neither declared in the bundle nor a kernel permission`);
    }
  }
  return [...problems, ...routingProblems(bundle)];
}

function schemaProblems(error: z.ZodError): string[] {
  return error.issues.flatMap((issue) => {
    if (issue.code === 'invalid_union') {
      // Keep every branch's safe diagnostics; do not print union received values.
      return issue.unionErrors.flatMap(schemaProblems);
    }
    const message = issue.code === 'invalid_enum_value' || issue.code === 'invalid_literal'
      ? 'value is not in the allowed vocabulary'
      : issue.message;
    return [`${issue.path.join('.') || '(root)'}: ${message}`];
  });
}

/**
 * The menu declaration snapshot step (ADR-0156), built by `bundleSnapshotCheck` in `menu-snapshot.ts`. `fill` completes
 * partial endpoint rows from the snapshot before any other check sees them (#1900 node 1900b); its problems refuse
 * alone, since an unfilled row cannot be checked further. `problems` joins the comparison's problems to the bundle's own.
 */
export type BundleSnapshotCheck = {
  readonly fill: (endpoints: readonly DeclaredEndpointRow[]) => { endpoints: readonly DeclaredEndpointRow[]; problems: readonly string[] };
  readonly problems: (bundle: Pick<z.infer<typeof bundleSchema>, 'endpoints' | 'actions'>) => string[];
};

/** Reads and validates the declaration bundle. Throws `DeclarationBundleError` on every failure mode; never logs contents. */
export async function loadDeclarationBundle(path: string, snapshotCheck?: BundleSnapshotCheck): Promise<DeclarationBundle> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code ?? 'unreadable';
    throw new DeclarationBundleError([`declaration bundle at ${path} cannot be read (${code})`]);
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new DeclarationBundleError([`declaration bundle at ${path} is not valid JSON`]);
  }
  const { endpoints, actions, permissions, capabilities, endpointOwners, targets, scopeCatalog } = validateDeclarationBundle(json, `declaration bundle at ${path} failed its schema`, snapshotCheck);
  return {
    endpoints: endpoints.map(({ limits, ...row }) => {
      const owner = endpointOwners[row.id];
      const core = owner !== undefined && typeof owner !== 'string' && owner.routes.some((route) => !isEnvelope(routeCall(owner, route)));
      return {
        ...row,
        ...(core ? { kinds: row.kinds ?? [] } : {}),
        ...(limits === undefined ? {} : { limits: typeof owner === 'string' ? { maxHours: limits.maxHours } : limits }),
      };
    }),
    ...(scopeCatalog === undefined ? {} : { scopeCatalog }),
    actions,
    permissions,
    ...(capabilities === undefined ? {} : { capabilities }),
    endpointOwners,
    ...(targets === undefined ? {} : { targets }),
  };
}

/** Shared file/programmatic boundary: schema first, then all semantic cross-checks. */
export function validateDeclarationBundle(input: unknown, schemaMessage = 'declaration bundle failed its schema', snapshotCheck?: BundleSnapshotCheck): Omit<z.infer<typeof bundleSchema>, 'scopeCatalog'> & { scopeCatalog?: ScopeCatalog } {
  // Loaded bundles also pass this boundary during routed contribution assembly.
  const candidate = input as { scopeCatalog?: ScopeCatalog } | null;
  let normalized: unknown = candidate?.scopeCatalog && typeof candidate.scopeCatalog.roomsOf === 'function'
    ? { ...candidate, scopeCatalog: candidate.scopeCatalog.sites } : input;
  if (snapshotCheck) {
    // #1900 node 1900b: fill partial endpoint rows first, so every later check sees complete rows.
    const rows = bundleRowsSchema.safeParse(normalized);
    if (!rows.success) throw new DeclarationBundleError([schemaMessage, ...schemaProblems(rows.error)]);
    const filled = snapshotCheck.fill(rows.data.endpoints);
    if (filled.problems.length > 0) throw new DeclarationBundleError([...filled.problems]);
    normalized = { ...(normalized as object), endpoints: filled.endpoints };
  }
  const parsed = bundleSchema.safeParse(normalized);
  if (!parsed.success) {
    throw new DeclarationBundleError([
      schemaMessage,
      ...schemaProblems(parsed.error),
    ]);
  }
  const problems = [...crossProblems(parsed.data), ...(snapshotCheck ? snapshotCheck.problems(parsed.data) : [])];
  let scopeCatalog: ScopeCatalog | undefined;
  if (parsed.data.scopeCatalog !== undefined) {
    try { scopeCatalog = parseScopeCatalog(parsed.data.scopeCatalog); } catch (error) {
      problems.push(`scopeCatalog: ${error instanceof Error ? error.message : 'invalid catalog'}`);
    }
  }
  if (problems.length > 0) throw new DeclarationBundleError(problems);
  const { scopeCatalog: _raw, ...data } = parsed.data;
  return { ...data, ...(scopeCatalog === undefined ? {} : { scopeCatalog }) };
}
