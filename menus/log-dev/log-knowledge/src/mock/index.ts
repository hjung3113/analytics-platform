/**
 * Mock server half of the log knowledge catalog (#1194 r): the four reads and the twelve writes, answered like the
 * real server (`apps/platform-api/src/modules/log-knowledge`): the table filter model (ADR-0105) with `validateFilters`
 * first, `filterRows` with the field specs, a deterministic multi-key sort that ends in `id`, a version check and the
 * same field errors (`required`, `malformed`, `too_long`, `duplicate`, `not_found`, `inactive`). The app composition
 * root registers `logKnowledgeMock` (reads) and `logKnowledgeActionsMock` (writes) from `@ap/menu-log-knowledge/mock`.
 *
 * Differences from the server, by engine design: a mock action's `validate` runs before the version check, so a stale
 * version with a duplicate code answers `invalid`, not `conflict`; the mock writes no audit rows (the mock engine has
 * no audit hook for actions).
 */
import { filterRows, validateFilters, type ColumnFilter, type ColumnFilterSpec, type FieldError, type PageResult } from '@ap/contracts';
import { defineMockAction, defineMockEndpoint, type AnyMockAction, type AnyMockEndpoint } from '@ap/mock-server';
import {
  MODEL_SORT_IDS, PROCESS_SORT_IDS, SOFTWARE_SORT_IDS, VENDOR_SORT_IDS, modelCreate, modelFilterSpecs, modelSetActive, modelUpdate,
  modelsEndpoint, processCreate, processFilterSpecs, processSetActive, processUpdate, processesEndpoint, softwareCreate,
  softwareFilterSpecs, softwareSetActive, softwareUpdate, softwareVersionsEndpoint, vendorCreate, vendorFilterSpecs, vendorSetActive,
  vendorUpdate, vendorsEndpoint, type CatalogPageParams, type CatalogSummary, type ModelRow,
} from '../endpoints';
import { specReadsMock } from './specReads';
import { specWritesMock } from './specWrites';
export { resetSpecs } from './specStore';
export { resetConcepts } from './conceptStore';
import { modelReadsMock } from './models';
import { itemActionsMock } from './itemActions';
import { itemReadsMock, subjectItemsMock } from './itemReads';
import { conceptReadsMock } from './conceptReads';
import { conceptActionsMock } from './conceptWrites';
import { importActionsMock, importReadsMock } from './imports';
import { activeChildren, all, byId, latestSoftwareLabel, insert, keyTaken, processIdsOf, processesOf, releaseOrderOf, setProcesses, toCodeKey, touch, type Kind, type Rec } from './store';

const PAGE_SIZE_MAX = 200;
const Q_MAX = 200;
const SORT_KEYS_MAX = 3;
const FILTER_VALUES_MAX = 200;
const CODE_MAX = 64;
const NAME_MAX = 200;
const PROCESS_IDS_MAX = 200;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
const unsafeText = (value: string): boolean => value.includes('\u0000') || LONE_SURROGATE.test(value);
const length = (value: string): number => [...value].length;

type Sortable = string | number | boolean;
type Shape = { specs: Readonly<Record<string, ColumnFilterSpec>>; sortIds: readonly string[]; rows: () => Rec[]; sortValue: (rec: Rec, id: string) => Sortable; cell: (rec: Rec, id: string) => unknown };

const common = (rec: Rec, id: string): Sortable | undefined =>
  ({ code: rec.key, name: rec.name, active: rec.active, createdAt: rec.createdAt, updatedAt: rec.updatedAt })[id as 'code'];

const SHAPES: Record<Kind, Shape> = {
  vendor: { specs: vendorFilterSpecs, sortIds: VENDOR_SORT_IDS, rows: () => all('vendor'), sortValue: (r, id) => (id === 'modelCount' ? activeChildren(r) : common(r, id)!), cell: (r, id) => (id === 'active' ? String(r.active) : id === 'id' ? r.id : undefined) },
  process: { specs: processFilterSpecs, sortIds: PROCESS_SORT_IDS, rows: () => all('process'), sortValue: (r, id) => (id === 'modelCount' ? activeChildren(r) : common(r, id)!), cell: (r, id) => (id === 'active' ? String(r.active) : id === 'id' ? r.id : undefined) },
  model: {
    specs: modelFilterSpecs, sortIds: MODEL_SORT_IDS, rows: () => all('model'),
    sortValue: (r, id) => (id === 'vendorName' ? byId(r.parentId)!.name : id === 'softwareCount' ? activeChildren(r) : common(r, id)!),
    cell: (r, id) => (id === 'active' ? String(r.active) : id === 'id' ? r.id : id === 'vendorId' ? r.parentId : id === 'processes' ? processIdsOf(r.id) : undefined),
  },
  software: {
    specs: softwareFilterSpecs, sortIds: SOFTWARE_SORT_IDS, rows: () => all('software'),
    sortValue: (r, id) => (id === 'versionLabel' ? r.key : id === 'releaseOrder' ? releaseOrderOf(r) : common(r, id)!),
    cell: (r, id) => (id === 'active' ? String(r.active) : id === 'id' ? r.id : id === 'modelId' ? r.parentId : undefined),
  },
};

/** What the server's value-shape rules add to `validateFilters`: `active` values are 'true'|'false', id values are uuids, at most 200 values. */
function filterMessage(filters: readonly ColumnFilter[], shape: Shape): string | null {
  // The wire shape is strict like the server's: a plain object with exactly { id, op, value? }.
  for (const f of filters as readonly unknown[]) {
    if (typeof f !== 'object' || f === null || Array.isArray(f) || Object.keys(f).some(k => k !== 'id' && k !== 'op' && k !== 'value')) return 'a filter is { id, op, value }';
  }
  const check = validateFilters(filters, shape.specs);
  if (!check.ok) return `invalid filter ${check.filter.id}:${check.filter.op} (${check.reason})`;
  for (const f of filters) {
    if (f.op !== 'in' && f.op !== 'notIn') continue;
    if (f.value.length > FILTER_VALUES_MAX) return `filter ${f.id} takes at most ${FILTER_VALUES_MAX} values`;
    if (!f.value.every(v => (f.id === 'active' ? v === 'true' || v === 'false' : UUID.test(v)))) return `filter ${f.id} values are ${f.id === 'active' ? "'true' or 'false'" : 'uuid strings'}`;
  }
  return null;
}

/** Param values the shape rules cannot express: the server answers `error`, never an empty page. */
function paramsMessage(params: CatalogPageParams, shape: Shape): string | null {
  const { q = null, page = 0, pageSize = 50, sorting = [], filters = [] } = params as Partial<CatalogPageParams>;
  if (q !== null && (typeof q !== 'string' || q.length > Q_MAX || unsafeText(q))) return `q must be a string of at most ${Q_MAX} characters or null`;
  if (!Number.isInteger(page) || page < 0 || page > 1_000_000) return 'page must be a non-negative integer (0-based)';
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > PAGE_SIZE_MAX) return `pageSize must be an integer from 1 to ${PAGE_SIZE_MAX}`;
  if (!Array.isArray(sorting) || sorting.length > SORT_KEYS_MAX) return `sorting must be a list of at most ${SORT_KEYS_MAX} sort keys`;
  const seen = new Set<string>();
  for (const s of sorting) {
    if (typeof s !== 'object' || s === null || Array.isArray(s) || Object.keys(s).some(k => k !== 'id' && k !== 'desc') || typeof s.id !== 'string' || typeof s.desc !== 'boolean') return 'a sort key is { id: string, desc: boolean }';
    if (!shape.sortIds.includes(s.id)) return `sorting by ${s.id} is not supported`;
    if (seen.has(s.id)) return `sorting by ${s.id} twice`;
    seen.add(s.id);
  }
  if (!Array.isArray(filters)) return 'filters must be a list of { id, op, value } conditions';
  return filterMessage(filters, shape);
}

const matchesQ = (rec: Rec, q: string | null): boolean => {
  if (q === null) return true;
  const key = toCodeKey(q);
  if (key === '' && q.trim() === '') return true;
  return rec.key.startsWith(key) || rec.name.toLowerCase().includes(q.trim().toLowerCase());
};

const compare = (a: Sortable, b: Sortable): number => (a === b ? 0 : a < b ? -1 : 1);

/** Stored ids are lowercase; the server compares uuid columns, so uuid filter values match case-insensitively. */
const canonicalFilters = (filters: readonly ColumnFilter[] | undefined): readonly ColumnFilter[] | undefined =>
  filters?.map(f => ((f.op === 'in' || f.op === 'notIn') && f.id !== 'active' ? { ...f, value: f.value.map(v => v.toLowerCase()) } : f));

function page(kind: Kind, params: CatalogPageParams): PageResult<Rec> {
  const shape = SHAPES[kind];
  const { q = null, page: p = 0, pageSize = 50, sorting = [], filters } = params;
  const keys = sorting.length > 0 ? sorting : [{ id: shape.sortIds[0]!, desc: false }];
  const rows = filterRows(shape.rows().filter(r => matchesQ(r, q)), canonicalFilters(filters), (r, id) => shape.cell(r, id), { specs: shape.specs });
  const sorted = [...rows].sort((a, b) => {
    for (const k of keys) { const c = compare(shape.sortValue(a, k.id), shape.sortValue(b, k.id)); if (c !== 0) return k.desc ? -c : c; }
    return compare(a.id, b.id);
  });
  return { rows: sorted.slice(p * pageSize, (p + 1) * pageSize), total: sorted.length };
}

const stamps = (r: Rec) => ({ id: r.id, code: r.code, name: r.name, active: r.active, version: String(r.rowVersion), createdAt: r.createdAt, updatedAt: r.updatedAt });
const read = (kind: Kind, params: CatalogPageParams) => {
  const result = page(kind, params);
  return { total: result.total, rows: result.rows.map(r => {
    if (kind === 'vendor' || kind === 'process') return { ...stamps(r), modelCount: activeChildren(r) };
    if (kind === 'model') return { ...stamps(r), vendorId: r.parentId!, vendorName: byId(r.parentId)!.name, processes: processesOf(r.id), softwareCount: activeChildren(r), latestSoftwareLabel: latestSoftwareLabel(r.id) };
    return { ...stamps(r), modelId: r.parentId!, versionLabel: r.code, releaseOrder: releaseOrderOf(r) };
  }) };
};

const readMock = <T>(spec: Parameters<typeof defineMockEndpoint<CatalogPageParams, PageResult<T>>>[0], kind: Kind) =>
  defineMockEndpoint(spec, {
    mart: false,
    validate: ({ params }) => paramsMessage(params, SHAPES[kind]),
    handle: ({ params }) => read(kind, params) as PageResult<T>,
  });

export const logKnowledgeMock: readonly AnyMockEndpoint[] = [
  readMock(vendorsEndpoint, 'vendor'), readMock(processesEndpoint, 'process'), readMock(modelsEndpoint, 'model'), readMock(softwareVersionsEndpoint, 'software'),
  ...modelReadsMock({ message: params => paramsMessage(params, SHAPES.model), page: params => read('model', params) as unknown as PageResult<ModelRow> }),
  ...specReadsMock,
  ...conceptReadsMock,
  ...subjectItemsMock,
  ...itemReadsMock,
  ...importReadsMock,
];

// ---- writes ----------------------------------------------------------------------------------------------------

const err = (path: readonly string[], code: string): FieldError => ({ path, code });

function textErrors(input: Record<string, unknown>, field: string, max: number, allowBlank = false): FieldError[] {
  const value = input[field];
  if (typeof value !== 'string') return [err([field], 'required')];
  if (unsafeText(value)) return [err([field], 'malformed')];
  if (!allowBlank && value.trim() === '') return [err([field], 'required')];
  return length(value) > max ? [err([field], 'too_long')] : [];
}
const idErrors = (input: Record<string, unknown>, field: string): FieldError[] => {
  const value = input[field];
  if (typeof value !== 'string' || value === '') return [err([field], 'required')];
  return UUID.test(value) ? [] : [err([field], 'malformed')];
};
function processIdsErrors(input: Record<string, unknown>): FieldError[] {
  const value = input.processIds;
  if (!Array.isArray(value)) return [err(['processIds'], 'required')];
  if (value.length > PROCESS_IDS_MAX) return [err(['processIds'], 'too_long')];
  const seen = new Set<string>();
  return value.flatMap((entry: unknown, i): FieldError[] => {
    if (typeof entry !== 'string' || !UUID.test(entry)) return [err(['processIds', String(i)], 'malformed')];
    if (seen.has(entry.toLowerCase())) return [err(['processIds', String(i)], 'duplicate')];
    seen.add(entry.toLowerCase());
    return [];
  });
}

type Op = 'create' | 'update' | 'setActive';
/** Value shape checks (pure), the server's `validateCatalogInput`. */
function valueErrors(kind: Kind, op: Op, input: Record<string, unknown>): FieldError[] {
  if (op === 'setActive') return [...idErrors(input, 'id'), ...(typeof input.active === 'boolean' ? [] : [err(['active'], 'required')])];
  return [
    ...(op === 'update' ? idErrors(input, 'id') : []),
    ...(op === 'create' && kind === 'model' ? idErrors(input, 'vendorId') : []),
    ...(op === 'create' && kind === 'software' ? idErrors(input, 'modelId') : []),
    ...textErrors(input, kind === 'software' ? 'versionLabel' : 'code', CODE_MAX),
    ...textErrors(input, 'name', NAME_MAX, kind === 'software'),
    ...(kind === 'model' ? processIdsErrors(input) : []),
  ];
}

const PARENT: Partial<Record<Kind, { kind: Kind; field: string }>> = { model: { kind: 'vendor', field: 'vendorId' }, software: { kind: 'model', field: 'modelId' } };
const codeField = (kind: Kind) => (kind === 'software' ? 'versionLabel' : 'code');

/** What only the data can judge: unknown or inactive parent, unknown or (newly added) inactive process, duplicate key. */
function stateErrors(kind: Kind, op: Op, input: Record<string, unknown>): FieldError[] {
  const errors: FieldError[] = [];
  const before = op === 'update' ? byId(input.id) : undefined;
  if (op === 'update' && !before) return []; // not_found is the version handler's answer
  const parent = PARENT[kind];
  if (op === 'create' && parent) {
    const row = byId(input[parent.field]);
    if (!row || row.kind !== parent.kind) errors.push(err([parent.field], 'not_found'));
    else if (!row.active) errors.push(err([parent.field], 'inactive'));
  }
  if (kind === 'model') {
    const current = new Set(before ? processIdsOf(before.id) : []);
    (input.processIds as string[]).forEach((id, i) => {
      const row = byId(id);
      if (!row || row.kind !== 'process') errors.push(err(['processIds', String(i)], 'not_found'));
      else if (!row.active && !current.has(row.id)) errors.push(err(['processIds', String(i)], 'inactive'));
    });
  }
  const code = input[codeField(kind)] as string;
  const parentId = before ? before.parentId : parent ? (byId(input[parent.field])?.id ?? null) : null;
  const changed = !before || toCodeKey(code) !== before.key;
  if (changed && (!parent || before || errors.every(e => e.path[0] !== parent.field)) && keyTaken(kind, toCodeKey(code), parentId, before?.id ?? null)) errors.push(err([codeField(kind)], 'duplicate'));
  return errors;
}

const summary = (r: Rec): CatalogSummary => ({ id: r.id, code: r.code, name: r.name, active: r.active, version: String(r.rowVersion) });
const done = (r: Rec) => ({ data: summary(r), version: String(r.rowVersion) });

type Input = Record<string, unknown>;
function writes(kind: Kind, specs: { create: Parameters<typeof defineMockAction>[0]; update: Parameters<typeof defineMockAction>[0]; setActive: Parameters<typeof defineMockAction>[0] }): AnyMockAction[] {
  const parent = PARENT[kind];
  const version = ({ input }: { input: Input }) => { const r = byId(input.id); return r && r.kind === kind ? String(r.rowVersion) : null; };
  const validate = (op: Op) => (input: Input): readonly FieldError[] => {
    const shape = valueErrors(kind, op, input);
    return shape.length > 0 || op === 'setActive' ? shape : stateErrors(kind, op, input);
  };
  return [
    defineMockAction(specs.create as never, {
      validate: validate('create'),
      handle: ({ input }: { input: Input }) => {
        const rec = insert(kind, input[codeField(kind)] as string, input.name as string, parent ? byId(input[parent.field])!.id : null);
        if (kind === 'model') setProcesses(rec.id, input.processIds as string[]);
        return done(rec);
      },
    }),
    defineMockAction(specs.update as never, {
      version, validate: validate('update'),
      handle: ({ input }: { input: Input }) => {
        const rec = touch(byId(input.id)!, { code: input[codeField(kind)] as string, name: input.name as string });
        if (kind === 'model') setProcesses(rec.id, input.processIds as string[]);
        return done(rec);
      },
    }),
    defineMockAction(specs.setActive as never, {
      version, validate: validate('setActive'),
      // Same value: nothing changes and the current version is answered. No cascade either way.
      handle: ({ input }: { input: Input }) => {
        const rec = byId(input.id)!;
        return done(rec.active === input.active ? rec : touch(rec, { active: input.active as boolean }));
      },
    }),
  ] as AnyMockAction[];
}

export const logKnowledgeActionsMock: readonly AnyMockAction[] = [
  ...writes('vendor', { create: vendorCreate, update: vendorUpdate, setActive: vendorSetActive }),
  ...writes('process', { create: processCreate, update: processUpdate, setActive: processSetActive }),
  ...writes('model', { create: modelCreate, update: modelUpdate, setActive: modelSetActive }),
  ...writes('software', { create: softwareCreate, update: softwareUpdate, setActive: softwareSetActive }),
  ...specWritesMock,
  ...conceptActionsMock,
  ...itemActionsMock,
  ...importActionsMock,
];

export { resetCatalog } from './store';
export { resetItems } from './items';
export { resetImports } from './imports';
