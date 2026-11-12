import { z } from 'zod/v4';
import { endpointDeclarationSchema } from './menu-query.ts';
import { APPLIED_CAPABILITIES, CONTEXT_KEYS } from './vocab.ts';

/**
 * Menu declaration snapshot v1 (#1900, ADR-0156): the file `menu-declarations.snapshot.json` the app assembly build writes
 * (`menuDeclarationSnapshot` / `menuDeclarationSnapshotPlugin` in `@ap/contracts`) and the core server reads beside the
 * declaration bundle. Rows are sorted by id and ids are unique; `digest` is `sha256:` + hex over the canonical JSON of
 * every other field (sorted keys, no whitespace). Recomputing the digest is a runtime rule the server applies.
 */
export const MENU_DECLARATION_SNAPSHOT_SCHEMA_VERSION = 1;

const appliedContext = z.strictObject(
  Object.fromEntries(CONTEXT_KEYS.map((key) => [key, z.enum(APPLIED_CAPABILITIES).optional()])) as {
    [K in (typeof CONTEXT_KEYS)[number]]: z.ZodOptional<z.ZodEnum<{ apply: 'apply'; reference: 'reference' }>>;
  },
);

const uniqueIds = <T extends { id: string }>(rows: T[]) => new Set(rows.map((row) => row.id)).size === rows.length;

export const snapshotMenuSchema = z.strictObject({
  id: z.string().min(1),
  permission: z.string().min(1),
  requiresScope: z.boolean(),
  /** The Context keys the menu applies or references; an absent key is unsupported. */
  context: appliedContext,
});

export const snapshotActionSchema = z.strictObject({
  id: z.string().min(1),
  menuId: z.string().min(1),
  inputKeys: z.array(z.string()),
  permission: z.string().min(1),
  requiresScope: z.boolean(),
  concurrency: z.enum(['none', 'version']),
  /** Endpoint ids the action makes stale. */
  invalidates: z.array(z.string().min(1)),
});

export const menuDeclarationSnapshotSchema = z.strictObject({
  schemaVersion: z.literal(MENU_DECLARATION_SNAPSHOT_SCHEMA_VERSION),
  sdkVersion: z.string().min(1),
  menus: z.array(snapshotMenuSchema).refine(uniqueIds, { message: 'menu ids must be unique' }),
  /** The app-declared permission vocabulary; kernel permissions are the server's own. */
  permissions: z.array(z.string().min(1)).refine((values) => new Set(values).size === values.length, { message: 'permissions must be distinct' }).meta({ uniqueItems: true }),
  endpoints: z.array(endpointDeclarationSchema).refine(uniqueIds, { message: 'endpoint ids must be unique' }),
  actions: z.array(snapshotActionSchema).refine(uniqueIds, { message: 'action ids must be unique' }),
  digest: z.string().regex(/^sha256:[0-9a-f]{64}$/),
});
