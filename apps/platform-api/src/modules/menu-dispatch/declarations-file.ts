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

import { isCapability } from '@ap/feature-shared';
import { z } from 'zod';

import { PLATFORM_PERMISSION_TABLE } from '../platform-port/permissions.js';
import { CONTEXT_KEYS } from './types.js';

/** A `limits.maxRows` on a declared endpoint would make the engine turn an upstream `ok` into `too_large` — a Fastify-made outcome, forbidden by ADR-0095 prohibition 7. */
const MAX_ROWS_REASON =
  'limits.maxRows is refused on a declared endpoint: the engine would map an upstream ok to too_large, a Fastify-made outcome (ADR-0095 prohibition 7)';

const limitsSchema = z
  .strictObject({
    maxHours: z.number().positive().optional(),
    maxRows: z.number().optional(),
  })
  .superRefine((limits, ctx) => {
    if (limits.maxRows !== undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['maxRows'], message: MAX_ROWS_REASON });
    }
  });

const contextSchema = z
  .strictObject(Object.fromEntries(CONTEXT_KEYS.map((key) => [key, z.enum(['apply', 'reference']).optional()])))
  .default({});

const endpointSchema = z.strictObject({
  /** '<group>.<name>', globally unique transport key. */
  id: z.string().min(1),
  menuId: z.string().min(1),
  paramKeys: z.array(z.string().min(1)),
  permission: z.string().min(1),
  requiresScope: z.boolean(),
  context: contextSchema,
  requiredContext: z.array(z.enum(CONTEXT_KEYS)).optional(),
  limits: limitsSchema.optional(),
  mergeTimeDomain: z.boolean(),
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
  capability: z.string().superRefine((capability, ctx) => {
    if (!isCapability(capability)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${capability} is not a platform capability` });
  }),
});

const ownerPathSchema = z.string().regex(/^\/.*/, 'an upstream path must start with /');

const bundleSchema = z.strictObject({
  endpoints: z.array(endpointSchema),
  actions: z.array(actionSchema),
  permissions: z.array(permissionSchema),
  /** Owner table: every declared endpoint exactly once → the upstream path the forwarder posts to (ADR-0148). */
  endpointOwners: z.record(z.string().min(1), ownerPathSchema),
});

export type DeclaredEndpointLimits = { maxHours?: number | undefined };
export type DeclaredEndpoint = Omit<z.infer<typeof endpointSchema>, 'limits'> & { limits?: DeclaredEndpointLimits };
export type DeclaredAction = z.infer<typeof actionSchema>;
export type DeclaredPermission = z.infer<typeof permissionSchema>;

export interface DeclarationBundle {
  endpoints: readonly DeclaredEndpoint[];
  actions: readonly DeclaredAction[];
  permissions: readonly DeclaredPermission[];
  endpointOwners: Readonly<Record<string, string>>;
}

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

  for (const row of bundle.permissions) {
    if (kernelPermission(row.permission)) {
      problems.push(`permission ${row.permission}: is a kernel permission, not a declared one's`);
    }
  }
  for (const [id, path] of Object.entries(bundle.endpointOwners)) {
    if (!endpointIds.has(id)) problems.push(`owner table names endpoint ${id}, which is not declared (owner path ${path})`);
  }
  for (const row of bundle.endpoints) {
    if (!(row.id in bundle.endpointOwners)) problems.push(`endpoint ${row.id}: no owner-table row`);
    if (!declaredPermissions.has(row.permission) && !kernelPermission(row.permission)) {
      problems.push(`endpoint ${row.id}: permission ${row.permission} is neither declared in the bundle nor a kernel permission`);
    }
  }
  for (const row of bundle.actions) {
    if (!declaredPermissions.has(row.permission) && !kernelPermission(row.permission)) {
      problems.push(`action ${row.id}: permission ${row.permission} is neither declared in the bundle nor a kernel permission`);
    }
  }
  return problems;
}

/** Reads and validates the declaration bundle. Throws `DeclarationBundleError` on every failure mode; never logs contents. */
export async function loadDeclarationBundle(path: string): Promise<DeclarationBundle> {
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
  const parsed = bundleSchema.safeParse(json);
  if (!parsed.success) {
    throw new DeclarationBundleError([
      `declaration bundle at ${path} failed its schema`,
      ...parsed.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`),
    ]);
  }
  const problems = crossProblems(parsed.data);
  if (problems.length > 0) throw new DeclarationBundleError(problems);
  const { endpoints, actions, permissions, endpointOwners } = parsed.data;
  return {
    endpoints: endpoints.map(({ limits, ...row }) => ({ ...row, ...(limits === undefined ? {} : { limits: { maxHours: limits.maxHours } }) })),
    actions,
    permissions,
    endpointOwners,
  };
}
