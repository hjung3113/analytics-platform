// Normalizes an import row and plans what it would do to the catalog (#1195 a, design v0.6 §6.2 ③). Pure: the
// catalog is passed in as a `CatalogSnapshot`, nothing is read or written here. Keys follow ADR-0107 (`toCodeKey`);
// a model is looked up by `(resolved vendor, code_key)` and a software version by `(resolved model, version_key)`,
// so a code found only under another vendor is `new` — a vendor move is never inferred. An inactive row keeps its
// key: a file naming it is a `conflict`, never a second row.

import { validateCatalogInput } from './catalog-input.js';
import { toCodeKey } from './code-key.js';
import type { ImportEntity } from './import-mapping.js';

export interface RowError {
  field: string;
  code: string;
}

export type PlanState = 'pending' | 'new' | 'unchanged' | 'update' | 'conflict' | 'error';

export interface SimpleNormalized {
  code: string;
  codeKey: string;
  name: string;
}
export interface ModelNormalized extends SimpleNormalized {
  /** The code the maker is looked up by: the `vendor_code` cell, else the maker name (`vendor_name`). */
  vendorCode: string;
  vendorKey: string;
  /** The maker's name cell; non-empty lets the apply create the maker when none exists (#1195 b2). */
  vendorName: string;
  /** `toCodeKey(vendorName)` for the name fallback; '' when no name was given. */
  vendorNameKey: string;
  /** `toCodeKey(name)`: the model's name fallback key. `code`/`codeKey` are the `model_code` cell, else the name. */
  nameKey: string;
  /** Process codes (code column) or process names (name column), as typed; the key list is parallel. */
  processCodes: string[];
  processKeys: string[];
  /** The list came from the name column: a missing process is created, and a name may match an existing name. */
  processCreatable: boolean;
  /** A process column (`process_codes` or `process_names`) is mapped: the cell is the wanted process set (empty = none). */
  processesMapped: boolean;
  /** What the plan would create for this row (see `Creates`); set by the validation, part of the sealed row. */
  creates?: Creates;
}
/** Parents a model row creates when they do not exist at apply time; a parent named on several rows is created once, by the first row applied. */
export interface Creates {
  vendor?: string;
  processes: string[];
}
export interface SoftwareNormalized {
  vendorCode: string;
  vendorKey: string;
  modelCode: string;
  modelKey: string;
  versionLabel: string;
  versionKey: string;
  /** Empty when `version_name` is not mapped or the cell is blank (a software name may be blank). */
  name: string;
  nameMapped: boolean;
}
export type NormalizedRow = SimpleNormalized | ModelNormalized | SoftwareNormalized;

export interface CatalogRef {
  id: string;
  name: string;
  active: boolean;
  rowVersion: number;
}
export interface ModelRef extends CatalogRef {
  processIds: ReadonlySet<string>;
}
/** The workspace's catalog as the plan needs it. Keys: vendor/process `code_key`; model `<vendorId>|<code_key>`; software `<modelId>|<version_key>`. */
export interface CatalogSnapshot {
  vendors: ReadonlyMap<string, CatalogRef>;
  processes: ReadonlyMap<string, CatalogRef>;
  models: ReadonlyMap<string, ModelRef>;
  softwares: ReadonlyMap<string, CatalogRef>;
  /** Name indexes for the name fallback: key `toCodeKey(name)`, models `<vendorId>|<toCodeKey(name)>`. */
  vendorNames?: ReadonlyMap<string, readonly CatalogRef[]>;
  processNames?: ReadonlyMap<string, readonly CatalogRef[]>;
  modelNames?: ReadonlyMap<string, readonly ModelRef[]>;
}

type Lookup<T> = { kind: 'none' } | { kind: 'one'; ref: T } | { kind: 'many' };

/**
 * ADR-0107 decision 2 supplement: the row with this `code_key`, else (when a name key is given) the rows whose
 * `code_key` or `toCodeKey(name)` equals it; two different rows are `many`.
 */
export function lookupByKeyOrName<T extends CatalogRef>(
  byKey: ReadonlyMap<string, T>,
  byName: ReadonlyMap<string, readonly T[]> | undefined,
  key: string,
  nameKey: string | null,
): Lookup<T> {
  const exact = byKey.get(key);
  if (exact) return { kind: 'one', ref: exact };
  if (nameKey === null || nameKey === '') return { kind: 'none' };
  const hits = new Map<string, T>();
  const viaKey = byKey.get(nameKey);
  if (viaKey) hits.set(viaKey.id, viaKey);
  for (const ref of byName?.get(nameKey) ?? []) hits.set(ref.id, ref);
  if (hits.size === 0) return { kind: 'none' };
  if (hits.size > 1) return { kind: 'many' };
  return { kind: 'one', ref: [...hits.values()][0] as T };
}

/** The existing maker a model row names (by code, else by name); null when none or ambiguous. */
export function resolveVendor(catalog: CatalogSnapshot, n: { vendorKey: string; vendorNameKey?: string }): CatalogRef | null {
  const hit = lookupByKeyOrName(catalog.vendors, catalog.vendorNames, n.vendorKey, n.vendorNameKey ?? null);
  return hit.kind === 'one' ? hit.ref : null;
}

/** Conflict reasons a model `map` never resolves (a parent is wrong, not the model): only `skip` clears them. */
export const PARENT_CONFLICT_CODES: readonly string[] = ['ambiguous_parent', 'parent_inactive'];

const PLACEHOLDER_ID = '00000000-0000-4000-8000-000000000000';
const PROCESS_SPLIT = /[;,]/u;
/** Process names are split on `,` only (a name may hold a `;`). */
const NAME_SPLIT = /,/u;
const splitList = (cell: string, separator: RegExp): string[] =>
  cell
    .split(separator)
    .map((c) => c.trim())
    .filter((c) => c !== '');

const FIELD_OF_PATH: Record<ImportEntity, Record<string, string>> = {
  vendor: { code: 'vendor_code', name: 'vendor_name' },
  process: { code: 'process_code', name: 'process_name' },
  model: { code: 'model_code', name: 'model_name' },
  software: { versionLabel: 'version_key', name: 'version_name' },
};

/** Code/name checks of the catalog write actions, reported under the file's field names. */
function codeErrors(kind: 'vendor' | 'process' | 'model' | 'software', input: Record<string, unknown>, entity: ImportEntity): RowError[] {
  const errors: RowError[] = [];
  for (const e of validateCatalogInput(kind, 'create', input)) {
    const head = e.path[0] ?? '';
    if (head === 'vendorId' || head === 'modelId' || head === 'processIds') continue;
    errors.push({ field: FIELD_OF_PATH[entity][head] ?? head, code: e.code });
  }
  return errors;
}

/** A bare reference code (vendor/model/process code of a parent column): the same code rules, reported on `field`. */
function refCodeErrors(value: string, field: string): RowError[] {
  return validateCatalogInput('vendor', 'create', { code: value, name: 'x' })
    .filter((e) => e.path[0] === 'code')
    .map((e) => ({ field, code: e.code }));
}

export function normalizeRow(
  entity: ImportEntity,
  raw: Readonly<Record<string, string>>,
  mapping: Readonly<Record<string, string>>,
): { normalized: NormalizedRow; errors: RowError[] } {
  const get = (field: string): string => {
    const header = mapping[field];
    return header === undefined ? '' : (raw[header] ?? '').trim();
  };
  const mapped = (field: string) => mapping[field] !== undefined;

  if (entity === 'vendor' || entity === 'process') {
    const code = get(`${entity}_code`);
    const name = get(`${entity}_name`);
    return {
      normalized: { code, codeKey: toCodeKey(code), name },
      errors: codeErrors(entity, { code, name }, entity),
    };
  }

  if (entity === 'model') {
    const vendorCodeCell = get('vendor_code');
    const vendorName = get('vendor_name');
    const vendorCode = vendorCodeCell || vendorName;
    const codeCell = get('model_code');
    const name = get('model_name');
    const code = codeCell || name;
    const processesMapped = mapped('process_codes') || mapped('process_names');
    const codeList = splitList(get('process_codes'), PROCESS_SPLIT);
    const fromNames = codeList.length === 0;
    const listed = processesMapped ? (fromNames ? splitList(get('process_names'), NAME_SPLIT) : codeList) : [];
    // Repeated names (same key after normalization) are one process; the first spelling stays.
    const processCodes = fromNames ? listed.filter((c, i) => listed.findIndex((o) => toCodeKey(o) === toCodeKey(c)) === i) : listed;
    const processKeys = processCodes.map(toCodeKey);
    const processCreatable = processesMapped && fromNames && processCodes.length > 0;

    const errors: RowError[] = [];
    const push = (field: string, code: string) => {
      if (!errors.some((e) => e.field === field && e.code === code)) errors.push({ field, code });
    };
    // Maker: a derived code (no `vendor_code` cell) is reported on the name column it came from.
    const vendorField = vendorCodeCell !== '' || mapped('vendor_code') || !mapped('vendor_name') ? 'vendor_code' : 'vendor_name';
    for (const e of validateCatalogInput('vendor', 'create', { code: vendorCode, name: vendorName || 'x' })) {
      if (e.path[0] === 'code') push(vendorField, e.code);
      else if (vendorName !== '') push('vendor_name', e.code);
    }
    // Model: same rule; a blank model name is reported on `model_name` whether or not a code column exists.
    for (const e of codeErrors('model', { vendorId: PLACEHOLDER_ID, code, name, processIds: [] }, entity)) {
      push(codeCell === '' && !mapped('model_code') && e.field === 'model_code' ? 'model_name' : e.field, e.code);
    }
    const processField = fromNames ? 'process_names' : 'process_codes';
    for (const c of processCodes) {
      for (const e of validateCatalogInput('process', 'create', { code: c, name: fromNames ? c : 'x' })) {
        if (e.path[0] === 'code' || fromNames) push(processField, e.code);
      }
    }
    if (new Set(processKeys).size !== processKeys.length) push(processField, 'duplicate');
    return {
      normalized: {
        vendorCode, vendorKey: toCodeKey(vendorCode), vendorName, vendorNameKey: vendorName === '' ? '' : toCodeKey(vendorName),
        code, codeKey: toCodeKey(code), name, nameKey: toCodeKey(name),
        processCodes, processKeys, processCreatable, processesMapped,
      },
      errors,
    };
  }

  const vendorCode = get('vendor_code');
  const modelCode = get('model_code');
  const versionLabel = get('version_key');
  const name = get('version_name');
  const errors = [
    ...refCodeErrors(vendorCode, 'vendor_code'),
    ...refCodeErrors(modelCode, 'model_code'),
    ...codeErrors('software', { modelId: PLACEHOLDER_ID, versionLabel, name }, entity),
  ];
  return {
    normalized: {
      vendorCode, vendorKey: toCodeKey(vendorCode), modelCode, modelKey: toCodeKey(modelCode),
      versionLabel, versionKey: toCodeKey(versionLabel), name, nameMapped: mapped('version_name'),
    },
    errors,
  };
}

export interface PlanInput {
  rowNo: number;
  /** `null` is not allowed here: a row without a normalized form is planned by its caller as `error`. */
  normalized: NormalizedRow;
  /** Parse errors plus normalization errors; any entry makes the row `error`. */
  errors: readonly RowError[];
}
export interface PlanResult {
  rowNo: number;
  /** Row errors; a `conflict` row carries its reason here (`ambiguous_name`, `ambiguous_parent`, `parent_inactive`). */
  errors: RowError[];
  planState: PlanState;
  targetId: string | null;
  targetVersion: number | null;
  /** Model rows only: the parents this row would create. */
  creates?: Creates;
}

const sameSet = (a: ReadonlySet<string>, b: ReadonlySet<string>): boolean => a.size === b.size && [...a].every((x) => b.has(x));

type ResultFn = (planState: PlanState, ref?: CatalogRef, creates?: Creates) => PlanResult;
type ConflictFn = (reason: RowError, ref?: CatalogRef) => PlanResult;

/**
 * A model row. The maker and the processes are looked up by code, else by name; a name that matches nothing is
 * created by the apply (`creates`), a code that matches nothing is an error (`parent_missing`/`process_missing`) as
 * before. A conflict with a parent (`ambiguous_parent`, `parent_inactive`) is cleared by `skip` only; an ambiguous
 * model name (`ambiguous_name`) is cleared by the model `map`/`skip`.
 */
function planModelRow(
  row: PlanInput,
  catalog: CatalogSnapshot,
  seen: Set<string>,
  errors: RowError[],
  result: ResultFn,
  conflictResult: ConflictFn,
): PlanResult {
  const n = row.normalized as ModelNormalized;
  const vendorCreatable = n.vendorName !== '';
  const vendorField = n.vendorName !== '' && n.vendorCode === n.vendorName ? 'vendor_name' : 'vendor_code';
  const creates: Creates = { processes: [] };
  let blocking: RowError | null = null;
  const block = (reason: RowError) => {
    blocking ??= reason;
  };

  const vendorHit = lookupByKeyOrName(catalog.vendors, catalog.vendorNames, n.vendorKey, vendorCreatable ? n.vendorNameKey : null);
  const vendor = vendorHit.kind === 'one' ? vendorHit.ref : null;
  if (vendorHit.kind === 'none') {
    if (!vendorCreatable) {
      errors.push({ field: 'vendor_code', code: 'parent_missing' });
      return result('error');
    }
    creates.vendor = n.vendorName;
  } else if (vendorHit.kind === 'many') {
    block({ field: vendorField, code: 'ambiguous_parent' });
  }

  const modelScope = vendor ? vendor.id : `new:${n.vendorKey}`;
  let found: ModelRef | undefined;
  let foundMany = false;
  if (vendor) {
    const exact = catalog.models.get(`${vendor.id}|${n.codeKey}`);
    if (exact) found = exact;
    else {
      const hits = new Map<string, ModelRef>();
      const viaKey = catalog.models.get(`${vendor.id}|${n.nameKey}`);
      if (viaKey) hits.set(viaKey.id, viaKey);
      for (const m of catalog.modelNames?.get(`${vendor.id}|${n.nameKey}`) ?? []) hits.set(m.id, m);
      if (hits.size === 1) found = [...hits.values()][0];
      else if (hits.size > 1) foundMany = true;
    }
  }
  if (!foundMany && vendorHit.kind !== 'many') {
    const scope = found ? `m:${found.id}` : `${modelScope}|${n.codeKey}`;
    if (seen.has(scope)) {
      errors.push({ field: n.code === n.name ? 'model_name' : 'model_code', code: 'duplicate_in_file' });
      return result('error');
    }
    seen.add(scope);
  }

  const processIds = new Set<string>();
  const processField = n.processCreatable ? 'process_names' : 'process_codes';
  n.processKeys.forEach((key, i) => {
    const hit = lookupByKeyOrName(catalog.processes, catalog.processNames, key, n.processCreatable ? key : null);
    if (hit.kind === 'none') {
      if (n.processCreatable) creates.processes.push(n.processCodes[i] as string);
      else errors.push({ field: processField, code: 'process_missing' });
    } else if (hit.kind === 'many') {
      block({ field: processField, code: 'ambiguous_parent' });
    } else {
      processIds.add(hit.ref.id);
      if (!hit.ref.active && !found?.processIds.has(hit.ref.id)) {
        if (n.processCreatable) block({ field: processField, code: 'parent_inactive' });
        else errors.push({ field: processField, code: 'process_inactive' });
      }
    }
  });

  if (!found) {
    if (foundMany) block({ field: 'model_code', code: 'ambiguous_name' });
    else if (vendor && !vendor.active) {
      if (vendorCreatable) block({ field: vendorField, code: 'parent_inactive' });
      else errors.push({ field: 'vendor_code', code: 'parent_inactive' });
    }
    if (errors.length > 0) return result('error');
    if (blocking) return conflictResult(blocking);
    return result('new', undefined, createsOf(creates));
  }
  if (errors.length > 0) return result('error');
  if (blocking) return conflictResult(blocking, found);
  if (!found.active) return result('conflict', found);
  const needsLinks = creates.processes.length > 0;
  const changed = found.name !== n.name || (n.processesMapped && (needsLinks || !sameSet(processIds, found.processIds)));
  return result(changed ? 'update' : 'unchanged', found, createsOf(creates));
}

const createsOf = (c: Creates): Creates | undefined => (c.vendor !== undefined || c.processes.length > 0 ? c : undefined);

/** Plans every row of a job in file order (the order decides which of two equal keys is the duplicate). */
export function planRows(entity: ImportEntity, rows: readonly PlanInput[], catalog: CatalogSnapshot): PlanResult[] {
  const seen = new Set<string>();
  return rows.map((row) => {
    const errors = [...row.errors];
    const result = (planState: PlanState, ref?: CatalogRef, creates?: Creates): PlanResult => ({
      rowNo: row.rowNo,
      errors,
      planState: errors.length > 0 ? 'error' : planState,
      targetId: errors.length === 0 && ref ? ref.id : null,
      targetVersion: errors.length === 0 && ref ? ref.rowVersion : null,
      ...(errors.length === 0 && creates ? { creates } : {}),
    });
    const conflictResult = (reason: RowError, ref?: CatalogRef): PlanResult => ({
      rowNo: row.rowNo,
      errors: [reason],
      planState: 'conflict',
      targetId: ref ? ref.id : null,
      targetVersion: ref ? ref.rowVersion : null,
    });
    if (errors.length > 0) return result('error');

    if (entity === 'vendor' || entity === 'process') {
      const n = row.normalized as SimpleNormalized;
      const field = `${entity}_code`;
      if (seen.has(n.codeKey)) {
        errors.push({ field, code: 'duplicate_in_file' });
        return result('error');
      }
      seen.add(n.codeKey);
      const found = (entity === 'vendor' ? catalog.vendors : catalog.processes).get(n.codeKey);
      if (!found) return result('new');
      if (!found.active) return result('conflict', found);
      return result(found.name === n.name ? 'unchanged' : 'update', found);
    }

    if (entity === 'model') return planModelRow(row, catalog, seen, errors, result, conflictResult);

    const n = row.normalized as SoftwareNormalized;
    const vendor = catalog.vendors.get(n.vendorKey);
    if (!vendor) {
      errors.push({ field: 'vendor_code', code: 'parent_missing' });
      return result('error');
    }
    const model = catalog.models.get(`${vendor.id}|${n.modelKey}`);
    if (!model) {
      errors.push({ field: 'model_code', code: 'parent_missing' });
      return result('error');
    }
    const scope = `${model.id}|${n.versionKey}`;
    if (seen.has(scope)) {
      errors.push({ field: 'version_key', code: 'duplicate_in_file' });
      return result('error');
    }
    seen.add(scope);
    const found = catalog.softwares.get(scope);
    if (!found) {
      if (!model.active) errors.push({ field: 'model_code', code: 'parent_inactive' });
      return result('new');
    }
    if (!found.active) return result('conflict', found);
    return result(n.nameMapped && found.name !== n.name ? 'update' : 'unchanged', found);
  });
}

export const IMPORT_PLAN_STATES: readonly PlanState[] = ['pending', 'new', 'unchanged', 'update', 'conflict', 'error'];

/** Job status after a validation: no `error` and no `conflict` row → `validated`. */
export const statusAfterValidate = (counts: Readonly<Record<PlanState, number>>): 'validated' | 'review_required' =>
  counts.error + counts.conflict === 0 ? 'validated' : 'review_required';
