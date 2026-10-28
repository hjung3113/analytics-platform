import { z } from 'zod/v4';
import { groupMemberSchema, jsonBytes } from './service-ports.ts';
import type { JsonValue } from './service-ports.ts';

// Saved-view command transport (ADR-0099): `POST /api/v1/platform/saved-views/commands`, one strict command per `SavedViewStore`
// method plus `importLocal`. The actor is never on the wire (the server reads the session), so `key` carries `menuId` only and every
// object is strict: a forged `userId`, `ownerId`, `id`, `version` or sharing field is refused. Responses are not wrapped in
// ApiResponse: each command resolves to exactly its port's return shape (`savedViewResponseSchemas`).
// Draft rules mirror `validateSavedView` in @ap/contracts (this package never imports it; a test compares the forbidden keys).
// Not expressible in JSON Schema, enforced here at runtime only: the transport bounds below, forbidden-key matching, and valid
// Unicode. A consumer using the JSON artifacts alone must apply them itself.

export const SAVED_VIEW_COMMAND_VERSION = 1;
/** Transport bounds over the whole serialized command body. They can reject a draft the SDK validator accepts; that rejection is the recoverable `invalid` result (ADR-0099 section 3). */
export const SAVED_VIEW_COMMAND_MAX_BYTES = 262_144;
/** The command body root is depth 0 and no value, scalar leaves included, sits deeper than 32 (same rule as ADR-0098). */
export const SAVED_VIEW_COMMAND_MAX_DEPTH = 32;
export const SAVED_VIEW_IMPORT_ROWS_MAX = 200;
export const SAVED_VIEW_TOKEN_MAX = 200;

/** Same rule as `isForbiddenSavedViewKey` in @ap/contracts: transient UI state and raw data/engine dumps. Not every Scope-named key. */
const TRANSIENT_KEY = /^(hover|zoom|modal|openModal|draft)/i;
const RAW_KEYS: ReadonlySet<string> = new Set(['rows', 'rawData', 'engineState']);
const DOCK_KEY = /^dock/i;
export const isForbiddenSavedViewWireKey = (key: string): boolean => TRANSIENT_KEY.test(key) || RAW_KEYS.has(key) || DOCK_KEY.test(key);

/** Iterative, so a hostile body cannot overflow the stack: false at the first value deeper than the bound. */
function withinDepth(value: unknown): boolean {
  const pending: [unknown, number][] = [[value, 0]];
  for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
    const [node, depth] = next;
    if (depth > SAVED_VIEW_COMMAND_MAX_DEPTH) return false;
    if (typeof node !== 'object' || node === null) continue;
    for (const child of Array.isArray(node) ? node : Object.values(node)) pending.push([child, depth + 1]);
  }
  return true;
}

/** Forbidden key at any depth of an object (array positions are not keys). */
function hasForbiddenKey(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  return Object.entries(value).some(([key, child]) => (!Array.isArray(value) && isForbiddenSavedViewWireKey(key)) || hasForbiddenKey(child));
}
const noForbiddenKeys = <T extends z.ZodType>(schema: T) => schema.refine((value) => !hasForbiddenKey(value), { message: 'transient or raw-data key must not be saved' });

const json: z.ZodType<JsonValue> = z.lazy(() => z.union([z.null(), z.boolean(), z.number(), z.string(), z.array(json), z.record(z.string(), json)]));
const id = z.string().min(1);
const strings = z.array(z.string());
const idList = strings.nullable();
const version = z.number().int();

/** Supported Context keys only. `scopeId` is not savable (Scope is revalidated at restore), so strict rejects it. */
const contextSchema = noForbiddenKeys(
  z.strictObject({
    from: z.string().nullable().optional(),
    to: z.string().nullable().optional(),
    selection: idList.optional(),
    lineNames: idList.optional(),
    prcGroups: idList.optional(),
    roomNames: idList.optional(),
    membershipBasis: z.literal('asOf').nullable().optional(),
    condition: z.record(z.string(), z.array(z.string()).min(1)).nullable().optional(),
    relativePeriod: z.strictObject({ hours: z.number() }).optional(),
  }),
);
/** Pairs or a key map; the logical key (pair[0] / map key) must not be forbidden. */
const pageSchema = z.union([
  z.array(z.tuple([z.string(), z.string()])).refine((pairs) => pairs.every(([key]) => !isForbiddenSavedViewWireKey(key)), { message: 'page key must not be saved' }),
  z.record(z.string(), strings).refine((map) => Object.keys(map).every((key) => !isForbiddenSavedViewWireKey(key)), { message: 'page key must not be saved' }),
]);
const chartOptionsSchema = noForbiddenKeys(z.record(z.string(), json));
const layoutSchema = noForbiddenKeys(json);
/** Opaque slot: finite JSON only; its content (including key names) is never inspected. */
const panelsSchema = json;
const name = z.string().refine((value) => value.trim() !== '', { message: 'name is empty' });

export const savedViewDraftSchema = z.discriminatedUnion('kind', [
  z.strictObject({ schemaVersion: z.literal(1), kind: z.literal('condition-set'), name, context: contextSchema }),
  z.strictObject({
    schemaVersion: z.literal(1),
    kind: z.literal('menu-view'),
    name,
    menuId: id,
    menuSchemaVersion: version,
    context: contextSchema,
    page: pageSchema,
    chartOptions: chartOptionsSchema,
    layout: layoutSchema,
    panels: panelsSchema,
  }),
]);
/** Fields are checked as in a draft; the server validates the merged result like `save`, so `name` here is only a string. */
export const savedViewPatchSchema = z.strictObject({
  name: z.string().optional(),
  menuSchemaVersion: version.optional(),
  context: contextSchema.optional(),
  page: pageSchema.optional(),
  chartOptions: chartOptionsSchema.optional(),
  layout: layoutSchema.optional(),
  panels: panelsSchema.optional(),
});

export const viewVisibilitySchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('private') }),
  z.strictObject({ kind: z.literal('people'), userIds: strings }),
  z.strictObject({ kind: z.literal('groups'), groupIds: strings }),
  z.strictObject({ kind: z.literal('official') }),
]);

const key = z.strictObject({ menuId: z.string().nullable() });
const expected = { expectedVersion: version };
const command = <Op extends string, S extends z.ZodRawShape>(op: Op, shape: S) => z.strictObject({ version: z.literal(SAVED_VIEW_COMMAND_VERSION), op: z.literal(op), ...shape });

/** One browser import: a stable per-import token, local rows and the local defaults that point at them. Retried verbatim after a partial failure. */
const importRow = z.strictObject({ legacyKey: z.string().min(1).max(SAVED_VIEW_TOKEN_MAX), draft: savedViewDraftSchema });
const importDefault = z.strictObject({ key, legacyKey: z.string().min(1).max(SAVED_VIEW_TOKEN_MAX) });
const importLocal = command('importLocal', {
  importToken: z.string().min(1).max(SAVED_VIEW_TOKEN_MAX),
  rows: z.array(importRow).max(SAVED_VIEW_IMPORT_ROWS_MAX),
  defaults: z.array(importDefault).max(SAVED_VIEW_IMPORT_ROWS_MAX),
}).refine((input) => new Set(input.rows.map((row) => row.legacyKey)).size === input.rows.length, { message: 'legacyKey must be distinct' })
  .refine((input) => input.defaults.every((d) => input.rows.some((row) => row.legacyKey === d.legacyKey)), { message: 'a default must point at a row of this import' });

const commandUnion = z.union([
  command('list', { key }),
  command('get', { id }),
  command('save', { draft: savedViewDraftSchema }),
  command('update', { id, patch: savedViewPatchSchema, ...expected }),
  command('remove', { id }),
  command('setDefault', { key, id: id.nullable() }),
  command('getDefaultId', { key }),
  command('setVisibility', { id, visibility: viewVisibilitySchema, ...expected }),
  command('requestOfficial', { id, ...expected }),
  command('decide', { id, decision: z.enum(['approve', 'reject']), note: z.string().optional(), ...expected }),
  command('revoke', { id, ...expected }),
  command('listApprovalRequests', { key }),
  command('listGroups', {}),
  command('createGroup', { name: z.string(), memberIds: strings }),
  command('updateGroup', { id, patch: z.strictObject({ name: z.string().optional(), addMembers: strings.optional(), removeMembers: strings.optional() }) }),
  command('searchPeople', { query: z.string() }),
  importLocal,
]);

/** Checked before the recursive parse (`abort: true` stops the pipe), so an over-deep or over-large body is refused, never parsed. */
const withinBounds = (body: unknown) => withinDepth(body) && jsonBytes(body) <= SAVED_VIEW_COMMAND_MAX_BYTES;
export const savedViewCommandSchema = z
  .unknown()
  .refine(withinDepth, { message: `command nested at most ${SAVED_VIEW_COMMAND_MAX_DEPTH} deep`, abort: true })
  .refine(withinBounds, { message: `command at most ${SAVED_VIEW_COMMAND_MAX_BYTES} bytes`, abort: true })
  .pipe(commandUnion);
export type SavedViewCommand = z.infer<typeof commandUnion>;

// ---- responses: the exact resolved type of each port method, no ApiResponse wrapper ----

const record = {
  id,
  schemaVersion: z.literal(1),
  name: z.string(),
  ownerId: z.string(),
  version,
  updatedAt: z.number(),
  visibility: viewVisibilitySchema,
  approval: z.enum(['none', 'pending', 'approved', 'rejected']),
  approvalNote: z.string().optional(),
  context: contextSchema,
};
export const savedViewSchema = z.discriminatedUnion('kind', [
  z.strictObject({ ...record, kind: z.literal('condition-set') }),
  z.strictObject({ ...record, kind: z.literal('menu-view'), menuId: id, menuSchemaVersion: version, page: pageSchema, chartOptions: chartOptionsSchema, layout: layoutSchema, panels: panelsSchema }),
]);
const capabilities = z.strictObject({ canView: z.boolean(), canCopy: z.boolean(), canEdit: z.boolean(), canShare: z.boolean(), canApprove: z.boolean(), canRevoke: z.boolean(), reason: z.string().optional() });
export const savedViewEntrySchema = z.strictObject({ denied: z.literal(false).optional(), view: savedViewSchema, capabilities });
/** Out of permission: id and reason only, never a title, owner or content. */
const deniedView = z.strictObject({ id, denied: z.literal(true), reason: z.string() });
export const savedViewListItemSchema = z.union([savedViewEntrySchema, deniedView]);
const approvalRequest = z.strictObject({ viewId: id, requestedBy: z.string(), requestedAt: z.number(), targetVersion: version, changes: strings, rejectReason: z.string().optional() });
const groupEntry = z.strictObject({
  group: z.strictObject({ id, kind: z.enum(['org-team', 'custom']), name: z.string(), memberCount: z.number().int(), managerIds: strings.optional() }),
  members: z.array(groupMemberSchema),
  capabilities: z.strictObject({ canView: z.boolean(), canEditMembers: z.boolean(), canRename: z.boolean(), canDelete: z.boolean() }),
});

/** `Result<T>` of the port. Domain failures are 200 entries; auth and transport failures are HTTP statuses the adapter maps to `unavailable`. */
const result = <T extends z.ZodType>(value: T) =>
  z.union([z.strictObject({ ok: z.literal(true), value }), z.strictObject({ ok: z.literal(false), reason: z.enum(['conflict', 'forbidden', 'unavailable', 'invalid']), detail: z.string().optional() })]);

/** Per-row outcome of an import, matched by `legacyKey`. Only rows with an `id` are committed: the client acknowledges (removes locally) exactly those. */
const importRowResult = z.union([
  z.strictObject({ legacyKey: z.string(), status: z.enum(['imported', 'already_imported']), id }),
  z.strictObject({ legacyKey: z.string(), status: z.literal('rejected'), reason: z.enum(['invalid', 'forbidden', 'unavailable']), detail: z.string().optional() }),
]);
export const savedViewImportOutcomeSchema = z.strictObject({
  results: z.array(importRowResult),
  /** Defaults mapped to server ids, only for committed rows. */
  defaults: z.array(z.strictObject({ key, legacyKey: z.string(), id })),
});

const entryResult = result(savedViewEntrySchema);
const nullResult = result(z.null());
/** Response schema by `op`; `ack` carries no value. Read commands resolve to the plain value and reject on transport failure. */
export const savedViewResponseSchemas = {
  list: z.array(savedViewListItemSchema),
  get: savedViewListItemSchema.nullable(),
  save: entryResult,
  update: entryResult,
  remove: nullResult,
  setDefault: nullResult,
  getDefaultId: z.string().nullable(),
  setVisibility: entryResult,
  requestOfficial: entryResult,
  decide: entryResult,
  revoke: entryResult,
  listApprovalRequests: z.array(approvalRequest),
  listGroups: z.array(groupEntry),
  createGroup: result(groupEntry),
  updateGroup: result(groupEntry),
  searchPeople: z.array(groupMemberSchema),
  importLocal: result(savedViewImportOutcomeSchema),
} as const;
export type SavedViewOp = keyof typeof savedViewResponseSchemas;
