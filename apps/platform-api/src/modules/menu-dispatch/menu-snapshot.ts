// Menu declaration snapshot check (#1900, ADR-0156). The app assembly build writes `menu-declarations.snapshot.json` —
// the menus, permission vocabulary, endpoint and action declarations the web was built with — and the deployment hands
// it to the server beside the declaration bundle (`MENU_DECLARATIONS_SNAPSHOT_FILE`). The server refuses a bundle whose
// menu-owned fields differ from it, plus the mock's registration rules (`createMockAdapter`), before HTTP starts.
//
// Trust limit: the server cannot prove where either file came from; this stops hand-copy mistakes and drift, not a
// malicious operator. Deployment-owned fields (`paramTypes`, `limits`, the owner table, `targets`, `scopeCatalog`,
// permission → capability rows) are not menu declarations and are not compared.
//
// Local zod copy (boundary rule 11 keeps menu-dispatch on its own schemas): `menuDeclarationSnapshotSchema` of
// `@ap/contract-schemas` is the source; `__tests__/menu-snapshot.test.ts` pins this copy to it.

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { z } from 'zod';

import { PLATFORM_PERMISSION_TABLE } from '../platform-port/permissions.js';
import { ASSESSMENT_KINDS } from './bundle/routing.js';
import { DeclarationBundleError, type BundleSnapshotCheck, type DeclaredAction, type DeclaredEndpoint, type DeclaredEndpointRow } from './declarations-file.js';
import { CONTEXT_KEYS } from './types.js';

export const MENU_SNAPSHOT_SCHEMA_VERSION = 1;

const appliedContext = z.strictObject(
  Object.fromEntries(CONTEXT_KEYS.map((key) => [key, z.enum(['apply', 'reference']).optional()])),
);

const menuSchema = z.strictObject({
  id: z.string().min(1),
  permission: z.string().min(1),
  requiresScope: z.boolean(),
  context: appliedContext,
});

const endpointSchema = z.strictObject({
  id: z.string(),
  menuId: z.string(),
  paramKeys: z.array(z.string()),
  permission: z.string(),
  requiresScope: z.boolean(),
  context: appliedContext,
  requiredContext: z.array(z.enum(CONTEXT_KEYS)).optional(),
  kinds: z.array(z.enum(ASSESSMENT_KINDS)),
  limits: z.strictObject({ maxHours: z.number().optional(), maxRows: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional() }).optional(),
  mergeTimeDomain: z.boolean(),
});

const actionSchema = z.strictObject({
  id: z.string().min(1),
  menuId: z.string().min(1),
  inputKeys: z.array(z.string()),
  permission: z.string().min(1),
  requiresScope: z.boolean(),
  concurrency: z.enum(['none', 'version']),
  invalidates: z.array(z.string().min(1)),
});

const uniqueIds = (rows: readonly { id: string }[]) => new Set(rows.map((row) => row.id)).size === rows.length;

export const menuSnapshotSchema = z.strictObject({
  schemaVersion: z.literal(MENU_SNAPSHOT_SCHEMA_VERSION),
  sdkVersion: z.string().min(1),
  menus: z.array(menuSchema).refine(uniqueIds, { message: 'menu ids must be unique' }),
  permissions: z.array(z.string().min(1)).refine((values) => new Set(values).size === values.length, { message: 'permissions must be distinct' }),
  endpoints: z.array(endpointSchema).refine(uniqueIds, { message: 'endpoint ids must be unique' }),
  actions: z.array(actionSchema).refine(uniqueIds, { message: 'action ids must be unique' }),
  digest: z.string().regex(/^sha256:[0-9a-f]{64}$/),
});

export type MenuDeclarationSnapshot = z.infer<typeof menuSnapshotSchema>;
export type SnapshotEndpoint = z.infer<typeof endpointSchema>;
export type SnapshotAction = z.infer<typeof actionSchema>;

/** JSON with object keys sorted at every level and no whitespace — the same rule as `canonicalJson` in `@ap/contracts`. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value).filter(([, inner]) => inner !== undefined).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, inner]) => `${JSON.stringify(key)}:${canonicalJson(inner)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** `sha256:<hex>` over the canonical JSON of every field but `digest`. */
export function menuSnapshotDigest(snapshot: Omit<MenuDeclarationSnapshot, 'digest'> & { digest?: string }): string {
  const { digest: _digest, ...body } = snapshot;
  return `sha256:${createHash('sha256').update(canonicalJson(body), 'utf8').digest('hex')}`;
}

/** Validates a snapshot value (file content or programmatic). Throws `DeclarationBundleError`; never echoes values. */
export function parseMenuSnapshot(input: unknown, label = 'menu declaration snapshot'): MenuDeclarationSnapshot {
  const version = input !== null && typeof input === 'object' ? (input as { schemaVersion?: unknown }).schemaVersion : undefined;
  if (version !== MENU_SNAPSHOT_SCHEMA_VERSION) {
    throw new DeclarationBundleError([`${label}: schemaVersion is not ${MENU_SNAPSHOT_SCHEMA_VERSION} (this server reads only version ${MENU_SNAPSHOT_SCHEMA_VERSION})`]);
  }
  const parsed = menuSnapshotSchema.safeParse(input);
  if (!parsed.success) {
    throw new DeclarationBundleError([
      `${label} failed its schema`,
      ...parsed.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.code === 'invalid_enum_value' || issue.code === 'invalid_literal' ? 'value is not in the allowed vocabulary' : issue.message}`),
    ]);
  }
  if (menuSnapshotDigest(parsed.data) !== parsed.data.digest) {
    throw new DeclarationBundleError([`${label}: digest does not match its content — the file was changed after the build wrote it`]);
  }
  return parsed.data;
}

/** Reads `MENU_DECLARATIONS_SNAPSHOT_FILE`. Fail closed on a missing, unreadable, non-JSON or invalid file. */
export async function loadMenuSnapshot(path: string): Promise<MenuDeclarationSnapshot> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code ?? 'unreadable';
    throw new DeclarationBundleError([`menu declaration snapshot at ${path} cannot be read (${code})`]);
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new DeclarationBundleError([`menu declaration snapshot at ${path} is not valid JSON`]);
  }
  return parseMenuSnapshot(json, `menu declaration snapshot at ${path}`);
}

/** The menu-owned declaration of endpoint `id` — the one place that answers it (`fillEndpointsFromSnapshot` fills from it). */
export function menuOwnedEndpoint(snapshot: MenuDeclarationSnapshot, id: string): SnapshotEndpoint | undefined {
  return snapshot.endpoints.find((row) => row.id === id);
}

/**
 * Completes bundle endpoint rows from the snapshot (#1900 node 1900b) — the one fill both assembly paths use. A row
 * keeps every field it carries (the comparison then requires it to equal the snapshot); each menu-owned field it leaves
 * out comes from `menuOwnedEndpoint`. Deployment-owned `limits` are never filled. A row the snapshot lacks stays as it
 * is when it is complete (the comparison names it) and is a problem when it is partial (it cannot be completed).
 */
export function fillEndpointsFromSnapshot<Row extends DeclaredEndpointRow>(
  rows: readonly Row[],
  snapshot: MenuDeclarationSnapshot,
): { endpoints: (Row & DeclaredEndpoint)[]; problems: string[] } {
  const endpoints: (Row & DeclaredEndpoint)[] = [];
  const problems: string[] = [];
  for (const row of rows) {
    const declared = menuOwnedEndpoint(snapshot, row.id);
    if (!declared) {
      const complete = row.menuId !== undefined && row.paramKeys !== undefined && row.permission !== undefined &&
        row.requiresScope !== undefined && row.mergeTimeDomain !== undefined;
      if (complete) endpoints.push(row as Row & DeclaredEndpoint);
      else problems.push(`endpoint ${row.id}: not in the menu declarations`);
      continue;
    }
    const { id: _id, limits: _limits, ...owned } = declared;
    const carried = Object.fromEntries(Object.entries(row).filter(([, value]) => value !== undefined));
    endpoints.push({ ...owned, ...carried } as Row & DeclaredEndpoint);
  }
  return { endpoints, problems };
}

/** The snapshot step of the bundle loader (`validateDeclarationBundle`): fill, then compare. */
export function bundleSnapshotCheck(snapshot: MenuDeclarationSnapshot): BundleSnapshotCheck {
  return {
    fill: (rows) => fillEndpointsFromSnapshot(rows, snapshot),
    problems: (bundle) => menuSnapshotProblems(bundle, snapshot),
  };
}

/** The menu-owned declaration of action `id`. */
export function menuOwnedAction(snapshot: MenuDeclarationSnapshot, id: string): SnapshotAction | undefined {
  return snapshot.actions.find((row) => row.id === id);
}

const show = (value: unknown) => (typeof value === 'string' ? value : JSON.stringify(value));
/** Lists compare as sets with multiplicity (order is not meaning); objects by canonical JSON. */
const sameList = (a: readonly string[], b: readonly string[]) => canonicalJson([...a].sort()) === canonicalJson([...b].sort());
const sameValue = (a: unknown, b: unknown) => canonicalJson(a) === canonicalJson(b);

type Field<Row> = { name: string; bundle: (row: Row) => unknown; list?: true };

// Absent optional bundle fields compare by their runtime meaning today (no required Context, no assessment kinds).
const ENDPOINT_FIELDS: readonly Field<DeclaredEndpoint>[] = [
  { name: 'menuId', bundle: (row) => row.menuId },
  { name: 'paramKeys', bundle: (row) => row.paramKeys, list: true },
  { name: 'permission', bundle: (row) => row.permission },
  { name: 'requiresScope', bundle: (row) => row.requiresScope },
  { name: 'context', bundle: (row) => row.context },
  { name: 'requiredContext', bundle: (row) => row.requiredContext ?? [], list: true },
  { name: 'kinds', bundle: (row) => row.kinds ?? [], list: true },
  { name: 'mergeTimeDomain', bundle: (row) => row.mergeTimeDomain },
];

const ACTION_FIELDS: readonly Field<DeclaredAction>[] = [
  { name: 'menuId', bundle: (row) => row.menuId },
  { name: 'inputKeys', bundle: (row) => row.inputKeys, list: true },
  { name: 'permission', bundle: (row) => row.permission },
  { name: 'requiresScope', bundle: (row) => row.requiresScope },
  { name: 'concurrency', bundle: (row) => row.concurrency },
  { name: 'invalidates', bundle: (row) => row.invalidates, list: true },
];

function fieldProblems<Row extends { id: string }>(kind: string, row: Row, fields: readonly Field<Row>[], declared: Readonly<Record<string, unknown>>): string[] {
  const problems: string[] = [];
  for (const field of fields) {
    const bundleValue = field.bundle(row);
    const declaredValue = declared[field.name];
    const same = field.list ? sameList(bundleValue as string[], declaredValue as string[]) : sameValue(bundleValue, declaredValue);
    if (!same) problems.push(`${kind} ${row.id}: ${field.name} is ${show(bundleValue)} in the bundle, ${show(declaredValue)} in the menu declarations`);
  }
  return problems;
}

/**
 * Every way the bundle's endpoints and actions differ from the menu declarations: rows the snapshot lacks, menu-owned
 * fields that are not equal, and the mock registration rules judged against the snapshot's menus.
 */
export function menuSnapshotProblems(
  bundle: { readonly endpoints: readonly DeclaredEndpoint[]; readonly actions: readonly DeclaredAction[] },
  snapshot: MenuDeclarationSnapshot,
): string[] {
  const problems: string[] = [];
  const menus = new Map(snapshot.menus.map((menu) => [menu.id, menu]));
  const declaredPermission = (permission: string) =>
    snapshot.permissions.includes(permission) ||
    snapshot.menus.some((menu) => menu.permission === permission) ||
    PLATFORM_PERMISSION_TABLE.some((entry) => entry.permission === permission);

  const registration = (kind: string, row: { id: string; menuId: string; permission: string; requiresScope: boolean }) => {
    const menu = menus.get(row.menuId);
    if (!menu) {
      problems.push(`${kind} ${row.id}: menu ${row.menuId} is not a menu of the menu declarations`);
      return undefined;
    }
    if (!declaredPermission(row.permission)) problems.push(`${kind} ${row.id}: permission ${row.permission} is declared neither by the menu declarations nor by the kernel`);
    if (menu.requiresScope && !row.requiresScope) problems.push(`${kind} ${row.id}: requiresScope is false but menu ${menu.id} requires Scope`);
    return menu;
  };

  for (const row of bundle.endpoints) {
    const declared = menuOwnedEndpoint(snapshot, row.id);
    if (!declared) {
      problems.push(`endpoint ${row.id}: not in the menu declarations`);
      continue;
    }
    problems.push(...fieldProblems('endpoint', row, ENDPOINT_FIELDS, { ...declared, requiredContext: declared.requiredContext ?? [] }));
    const menu = registration('endpoint', row);
    if (!menu) continue;
    for (const [key, capability] of Object.entries(row.context)) {
      if (capability === 'apply' && menu.context[key] !== 'apply') problems.push(`endpoint ${row.id}: context ${key} is applied but menu ${menu.id} does not apply it`);
    }
  }
  for (const row of bundle.actions) {
    const declared = menuOwnedAction(snapshot, row.id);
    if (!declared) {
      problems.push(`action ${row.id}: not in the menu declarations`);
      continue;
    }
    problems.push(...fieldProblems('action', row, ACTION_FIELDS, declared));
    if (!registration('action', row)) continue;
    for (const id of row.invalidates) {
      if (menuOwnedEndpoint(snapshot, id)?.menuId !== row.menuId) problems.push(`action ${row.id}: invalidates ${id}, which is not an endpoint of menu ${row.menuId}`);
    }
  }
  return problems;
}

/** Throws `DeclarationBundleError` with every problem when the bundle differs from the menu declarations. */
export function assertBundleMatchesMenuSnapshot(
  bundle: Parameters<typeof menuSnapshotProblems>[0],
  snapshot: MenuDeclarationSnapshot,
): void {
  const problems = menuSnapshotProblems(bundle, snapshot);
  if (problems.length > 0) throw new DeclarationBundleError(problems);
}
