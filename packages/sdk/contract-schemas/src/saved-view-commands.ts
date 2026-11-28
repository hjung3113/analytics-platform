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

/** Forbidden key at any depth of an object (array positions are not keys). An array is walked by its elements only, so an extra
 *  (non-JSON) property on an array never leads into a cycle (#2760). */
function hasForbiddenKey(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  if (Array.isArray(value)) return value.some(hasForbiddenKey);
  return Object.entries(value).some(([key, child]) => isForbiddenSavedViewWireKey(key) || hasForbiddenKey(child));
}
const noForbiddenKeys = <T extends z.ZodType>(schema: T) => schema.refine((value) => !hasForbiddenKey(value), { message: 'transient or raw-data key must not be saved' });

const json: z.ZodType<JsonValue> = z.lazy(() => z.union([z.null(), z.boolean(), z.number(), z.string(), z.array(json), z.record(z.string(), json)]));
const id = z.string().min(1);
const strings = z.array(z.string());
const idList = strings.nullable();
const version = z.number().int();

/** Supported Context keys only. `scopeId` is not savable (Scope is revalidated at restore), so strict rejects it. */
const contextSchema = z.strictObject({
  from: z.string().nullable().optional(),
  to: z.string().nullable().optional(),
  selection: idList.optional(),
  lineNames: idList.optional(),
  prcGroups: idList.optional(),
  roomNames: idList.optional(),
  membershipBasis: z.literal('asOf').nullable().optional(),
  condition: z.record(z.string(), z.array(z.string()).min(1)).nullable().optional(),
  relativePeriod: z.strictObject({ hours: z.number() }).optional(),
});
/** Applied page keys, as pairs or a key map, are independent of their names. */
const pageSchema = z.union([
  z.array(z.tuple([z.string(), z.string()])),
  z.record(z.string(), strings),
]);
const chartOptionsSchema = noForbiddenKeys(z.record(z.string(), json));
const layoutSchema = noForbiddenKeys(json);
// Literal copies: contracts is test-only here. The saved-view tests pin the limits and graph rules.
export const PANEL_INSTANCES_MAX = 24;
export const PANEL_INSTANCE_INPUTS_MAX = 16;
export const PANEL_INSTANCE_TOKEN_MAX = 200;
export const CUSTOM_GROUP_FIXED_MAX = 5_000;

const nonBlank = z.string().regex(/\S/, { message: 'must be non-blank' });
const panelToken = nonBlank.max(PANEL_INSTANCE_TOKEN_MAX);
const panelShape = z.enum(['set', 'range']);
const heldSelectionSchema = z.discriminatedUnion('shape', [
  z.strictObject({
    shape: z.literal('set'),
    values: z.array(nonBlank).min(1).max(CUSTOM_GROUP_FIXED_MAX)
      .refine(values => new Set(values).size === values.length, { message: 'values must be distinct' })
      .meta({ uniqueItems: true }),
  }),
  z.strictObject({ shape: z.literal('range'), from: nonBlank, to: nonBlank }),
]);
const panelInputFields = { key: panelToken, from: z.string(), use: z.enum(['filter', 'highlight']).optional() };
const panelInputSchema = z.discriminatedUnion('mode', [
  z.strictObject({ ...panelInputFields, mode: z.literal('follow') }),
  z.strictObject({ ...panelInputFields, mode: z.literal('hold'), value: heldSelectionSchema }),
]).superRefine((input, ctx) => {
  if (Object.hasOwn(input, 'use') && input.use === undefined) {
    ctx.addIssue({ code: 'custom', path: ['use'], message: 'must be filter or highlight' });
  }
});
const panelOutputSchema = z.strictObject({ key: panelToken, dimension: panelToken, shape: panelShape });
// Literal copies of the ChartConfig v1 rules in @ap/contracts (ADR-0176, #2745); chart-config.test.ts runs both on the same cases.
export const CHART_CONFIG_COLORS = ['chart-series-1', 'chart-series-2', 'chart-series-3', 'chart-series-4'] as const;
export const CHART_CONFIG_MEASURES_MAX = 8;
export const CHART_CONFIG_FIELD_MAX = 200;
export const CHART_CONFIG_DECIMALS_MAX = 6;
const chartField = nonBlank.max(CHART_CONFIG_FIELD_MAX);
const chartMeasureSchema = z.strictObject({
  field: chartField,
  color: z.enum(CHART_CONFIG_COLORS).optional(),
  axis: z.enum(['left', 'right']).optional(),
});
/** Same rule as `isPlainChartData` in @ap/contracts: the raw value is plain JSON data, so the value checked is the value stored. */
function isPlainChartData(value: unknown, ancestors: object[] = []): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object' || ancestors.includes(value)) return false;
  const array = Array.isArray(value);
  if (!(array ? [Array.prototype] : [Object.prototype, null]).includes(Object.getPrototypeOf(value))) return false;
  const keys = Reflect.ownKeys(value);
  const length = array ? (value as unknown[]).length : 0;
  if (array && keys.length !== length + 1) return false;
  for (const key of keys) {
    if (array && key === 'length') continue;
    if (typeof key !== 'string' || (array && key !== String(Number(key))) || (array && Number(key) >= length)) return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable || !isPlainChartData(descriptor.value, [...ancestors, value])) return false;
  }
  return true;
}

type ChartCombination = { kind: string; x: { type: string }; measures: { field: string; axis?: string }[]; split?: unknown; orientation?: string; stack?: string; areaFill?: boolean };
/** Same rules, keys and texts as `invalidCombination` in @ap/contracts. */
function invalidChartCombination(config: ChartCombination): [string, string] | null {
  const fields = config.measures.map(measure => measure.field);
  if (new Set(fields).size !== fields.length) return ['measures', 'fields must be distinct'];
  if (config.split && config.measures.length !== 1) return ['split', 'needs exactly one measure'];
  if (config.orientation === 'horizontal' && (config.kind !== 'bar' || config.x.type !== 'category')) {
    return ['orientation', 'horizontal needs a bar chart on a category axis'];
  }
  if (config.areaFill !== undefined && config.kind !== 'line') return ['areaFill', 'needs a line chart'];
  const stacked = config.stack !== undefined && config.stack !== 'none';
  if (config.measures.some(measure => measure.axis === 'right') && (stacked || config.orientation === 'horizontal')) {
    return ['measures', 'axis right needs a vertical, unstacked chart'];
  }
  return null;
}

const chartConfigShape = z.strictObject({
  version: z.literal(1),
  kind: z.enum(['line', 'bar']),
  x: z.strictObject({ field: chartField, type: z.enum(['time', 'category']) }),
  measures: z.array(chartMeasureSchema).min(1).max(CHART_CONFIG_MEASURES_MAX),
  split: z.strictObject({ field: chartField }).optional(),
  orientation: z.enum(['vertical', 'horizontal']).optional(),
  stack: z.enum(['none', 'stack', 'percent']).optional(),
  areaFill: z.boolean().optional(),
  valueFormat: z.strictObject({
    kind: z.enum(['number', 'percent']),
    decimals: z.number().int().min(0).max(CHART_CONFIG_DECIMALS_MAX).optional(),
  }).optional(),
}).superRefine((config, ctx) => {
  // Cross-field rules only judge a valid shape, like the SDK (which stops at the first shape reason).
  if (ctx.issues.length > 0) return;
  const combination = invalidChartCombination(config);
  if (combination) ctx.addIssue({ code: 'custom', path: [combination[0]], message: combination[1] });
});
/** Closed: unknown keys, data arrays, hex, px and font values have no place to go. The plain-data gate and cross-field rules are runtime only. */
export const chartConfigSchema = z.unknown()
  .refine(isPlainChartData, { message: 'must be plain JSON data', abort: true })
  .pipe(chartConfigShape);

const panelSourceSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('declared'), panel: panelToken }),
  z.strictObject({ kind: z.literal('chart'), config: chartConfigSchema }),
]);
const panelInstanceSchema = z.strictObject({
  id: panelToken,
  source: panelSourceSchema,
  inputs: z.array(panelInputSchema).max(PANEL_INSTANCE_INPUTS_MAX),
  outputs: z.array(panelOutputSchema).max(PANEL_INSTANCE_INPUTS_MAX),
});

/** Same graph rules and messages as @ap/contracts, tested against the same cases. */
function invalidPanelConnections(instances: z.infer<typeof panelInstanceSchema>[]): string | null {
  const ids = new Set<string>();
  const outputs = new Map<string, { id: string; shape: z.infer<typeof panelOutputSchema>['shape'] }>();
  for (const instance of instances) {
    if (instance.id.includes('.')) return 'panels instance ids must not contain "."';
    if (ids.has(instance.id)) return 'panels instance ids must be unique';
    ids.add(instance.id);
    for (const output of instance.outputs) {
      // Same format as @ap/contracts `panelOutputRef`; production code here imports no platform package (ADR-0096).
      const ref = `${instance.id}.${output.key}`;
      if (outputs.has(ref)) return 'panels output keys must be unique per instance';
      outputs.set(ref, { id: instance.id, shape: output.shape });
    }
    if (new Set(instance.inputs.map(input => input.key)).size !== instance.inputs.length) {
      return 'panels input keys must be unique per instance';
    }
  }

  const dependencies = new Map<string, string[]>();
  for (const { id, inputs } of instances) {
    const upstream: string[] = [];
    for (const input of inputs) {
      const output = outputs.get(input.from);
      if (!output) return 'panels input from must name an existing instance output';
      if (output.id === id) return 'panels input from must not name its own instance';
      if (input.mode === 'hold' && input.value.shape !== output.shape) {
        return 'panels held selection shape must match the referenced output';
      }
      // Stored validation cannot see declarations. Count omitted use as filter, the default receiving mode.
      if (input.use !== 'highlight') upstream.push(output.id);
    }
    dependencies.set(id, upstream);
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  function hasCycle(id: string): boolean {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    if (dependencies.get(id)?.some(hasCycle)) return true;
    visiting.delete(id);
    visited.add(id);
    return false;
  }
  return instances.some(({ id }) => hasCycle(id)) ? 'panels connections must not contain a filter cycle' : null;
}

/** Connection and reference checks run in Zod. JSON Schema consumers must apply these checks themselves. */
export const menuViewPanelsSchema = z.strictObject({
  version: z.literal(1),
  instances: z.array(panelInstanceSchema).max(PANEL_INSTANCES_MAX, { abort: true }),
}).superRefine(({ instances }, ctx) => {
  const message = invalidPanelConnections(instances);
  if (message) ctx.addIssue({ code: 'custom', message });
}).nullable();
// Literal copy: contracts is test-only here. table-view-state tests pin all caps.
export const TABLE_VIEW_CAPS = { tables: 20, key: 200, basis: 16_384, items: 200, id: 200, members: 500, label: 60, width: 60 } as const;
const tableId = z.string().min(1).max(TABLE_VIEW_CAPS.id);
const storedGroups = z.strictObject({
  basis: z.string().max(TABLE_VIEW_CAPS.basis),
  items: z.array(z.strictObject({
    id: tableId,
    label: z.string().refine(label => label.trim().length >= 1 && label.trim().length <= TABLE_VIEW_CAPS.label).optional(),
    members: z.array(tableId).max(TABLE_VIEW_CAPS.members),
    width: z.number().min(TABLE_VIEW_CAPS.width).optional(),
  }).refine(item => !item.id.startsWith('u:') || item.label !== undefined)).max(TABLE_VIEW_CAPS.items)
    .refine(items => new Set(items.map(item => item.id)).size === items.length),
});
export const tableViewStateSchema = z.strictObject({ groups: storedGroups.optional() });
const tablesSchema = z.record(z.string().min(1).max(TABLE_VIEW_CAPS.key), tableViewStateSchema)
  .refine(tables => Object.keys(tables).length <= TABLE_VIEW_CAPS.tables).meta({ maxProperties: TABLE_VIEW_CAPS.tables });
const name = z.string().refine((value) => value.trim() !== '', { message: 'name is empty' });
/** The Scope a content version was saved in (#2175): opaque metadata, never an authority; the server stores it and checks no grant. Bounded like `SAVED_SCOPE_ID_MAX` in @ap/contracts. */
const savedScopeId = z.string().min(1).max(200);
const groupId = z.string().min(1).regex(/\S/, { message: 'id is empty' });
const ruleAxisId = groupId.refine(axis => axis !== 'customGroup', { message: 'nested custom groups are forbidden' }).meta({ not: { const: 'customGroup' } });
const customGroupTarget = z.union([
  z.strictObject({ rule: z.record(ruleAxisId, z.array(groupId).min(1)) }),
  z.strictObject({ fixed: z.array(groupId).min(1).max(CUSTOM_GROUP_FIXED_MAX).refine(ids => new Set(ids).size === ids.length, { message: 'fixed ids must be unique' }).meta({ uniqueItems: true }) }),
]);

export const savedViewDraftSchema = z.discriminatedUnion('kind', [
  z.strictObject({ schemaVersion: z.literal(1), kind: z.literal('custom-group'), name, savedScopeId, target: customGroupTarget }),
  z.strictObject({ schemaVersion: z.literal(1), kind: z.literal('condition-set'), name, context: contextSchema, savedScopeId: savedScopeId.optional() }),
  z.strictObject({
    schemaVersion: z.literal(1),
    kind: z.literal('menu-view'),
    name,
    menuId: id,
    menuSchemaVersion: version,
    myMenu: z.literal(true).optional(),
    context: contextSchema,
    savedScopeId: savedScopeId.optional(),
    page: pageSchema,
    chartOptions: chartOptionsSchema,
    layout: layoutSchema,
    panels: menuViewPanelsSchema,
    tables: tablesSchema.optional(),
  }),
]);
/** Fields are checked as in a draft; the server validates the merged result like `save`, so `name` here is only a string. */
export const savedViewPatchSchema = z.strictObject({
  target: customGroupTarget.optional(),
  name: z.string().optional(),
  menuSchemaVersion: version.optional(),
  myMenu: z.boolean().optional(),
  context: contextSchema.optional(),
  /** `null` clears it. */
  savedScopeId: savedScopeId.nullable().optional(),
  page: pageSchema.optional(),
  chartOptions: chartOptionsSchema.optional(),
  layout: layoutSchema.optional(),
  panels: menuViewPanelsSchema.optional(),
  tables: tablesSchema.optional(),
});

export const viewVisibilitySchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('private') }),
  z.strictObject({ kind: z.literal('people'), userIds: strings }),
  z.strictObject({ kind: z.literal('groups'), groupIds: strings }),
  z.strictObject({ kind: z.literal('official') }),
]);

const key = z.strictObject({ menuId: z.string().nullable(), kind: z.literal('custom-group').optional() });
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
  command('listMyMenus', {}),
  command('get', { id }),
  command('save', { draft: savedViewDraftSchema }),
  command('update', { id, patch: savedViewPatchSchema, ...expected }),
  command('remove', { id }),
  command('setDefault', { key, id: id.nullable() }),
  command('getDefaultId', { key }),
  command('setVisibility', { id, visibility: viewVisibilitySchema, ...expected }),
  command('requestOfficial', { id, ...expected }),
  command('withdraw', { id, ...expected }),
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
  savedScopeId: savedScopeId.optional(),
};
const menuViewRecord = z.strictObject({ ...record, kind: z.literal('menu-view'), menuId: id, menuSchemaVersion: version, myMenu: z.literal(true).optional(), page: pageSchema, chartOptions: chartOptionsSchema, layout: layoutSchema, panels: menuViewPanelsSchema, panelsUnreadable: z.literal(true).optional(), tables: tablesSchema.optional() });
export const savedViewSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    ...record, context: z.never().optional(), kind: z.literal('custom-group'), savedScopeId, target: customGroupTarget,
    visibility: z.union([z.strictObject({ kind: z.literal('private') }), z.strictObject({ kind: z.literal('groups'), groupIds: strings })]),
    approval: z.literal('none'),
  }).omit({ context: true }),
  z.strictObject({ ...record, kind: z.literal('condition-set') }),
  menuViewRecord,
]);
const capabilities = z.strictObject({ canView: z.boolean(), canCopy: z.boolean(), canEdit: z.boolean(), canShare: z.boolean(), canApprove: z.boolean(), canRevoke: z.boolean(), canWithdraw: z.boolean().optional(), reason: z.string().optional() });
export const savedViewEntrySchema = z.strictObject({ denied: z.literal(false).optional(), view: savedViewSchema, capabilities });
const myMenuEntrySchema = savedViewEntrySchema.extend({
  view: menuViewRecord.required({ myMenu: true }),
  capabilities: capabilities.extend({ canView: z.literal(true) }),
});
/** Out of permission: id and reason only, never a title, owner or content. */
const deniedView = z.strictObject({ id, denied: z.literal(true), reason: z.string() });
export const savedViewListItemSchema = z.union([savedViewEntrySchema, deniedView]);
const approvalRequest = z.strictObject({ viewId: id, requestedBy: z.string(), requestedAt: z.number(), targetVersion: version, changes: strings, approverSpace: id.optional(), rejectReason: z.string().optional() });
const groupEntry = z.strictObject({
  group: z.strictObject({ id, kind: z.enum(['org-team', 'custom']), name: z.string(), memberCount: z.number().int(), managerIds: strings.optional() }),
  members: z.array(groupMemberSchema),
  capabilities: z.strictObject({ canView: z.boolean(), canEditMembers: z.boolean(), canRename: z.boolean(), canDelete: z.boolean() }),
});

/** `Result<T>` of the port. Domain failures are 200 entries; auth and transport failures are HTTP statuses the adapter maps to `unavailable`. */
const result = <T extends z.ZodType>(value: T) =>
  z.union([z.strictObject({ ok: z.literal(true), value }), z.strictObject({ ok: z.literal(false), reason: z.enum(['conflict', 'forbidden', 'unavailable', 'invalid']), detail: z.string().optional() })]);

/** Per-row outcome of an import, matched by `legacyKey`. Only rows with an `id` are committed: the client acknowledges exactly those. Local originals are never removed, acknowledged or not (ADR-0099 section 4). */
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
  listMyMenus: z.array(myMenuEntrySchema),
  get: savedViewListItemSchema.nullable(),
  save: entryResult,
  update: entryResult,
  remove: nullResult,
  setDefault: nullResult,
  getDefaultId: z.string().nullable(),
  setVisibility: entryResult,
  requestOfficial: entryResult,
  withdraw: entryResult,
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
