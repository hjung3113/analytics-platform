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
  vendorCode: string;
  vendorKey: string;
  processCodes: string[];
  processKeys: string[];
  /** The `process_codes` column is mapped: the cell is the wanted process set (an empty cell = no process). */
  processesMapped: boolean;
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
}

const PLACEHOLDER_ID = '00000000-0000-4000-8000-000000000000';
const PROCESS_SPLIT = /[;,]/u;

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
    const vendorCode = get('vendor_code');
    const code = get('model_code');
    const name = get('model_name');
    const processesMapped = mapped('process_codes');
    const processCodes = processesMapped
      ? get('process_codes')
          .split(PROCESS_SPLIT)
          .map((c) => c.trim())
          .filter((c) => c !== '')
      : [];
    const processKeys = processCodes.map(toCodeKey);
    const errors = [
      ...refCodeErrors(vendorCode, 'vendor_code'),
      ...codeErrors('model', { vendorId: PLACEHOLDER_ID, code, name, processIds: [] }, entity),
    ];
    for (const c of processCodes) errors.push(...refCodeErrors(c, 'process_codes'));
    if (new Set(processKeys).size !== processKeys.length) errors.push({ field: 'process_codes', code: 'duplicate' });
    return {
      normalized: { vendorCode, vendorKey: toCodeKey(vendorCode), code, codeKey: toCodeKey(code), name, processCodes, processKeys, processesMapped },
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
  errors: RowError[];
  planState: PlanState;
  targetId: string | null;
  targetVersion: number | null;
}

const sameSet = (a: ReadonlySet<string>, b: ReadonlySet<string>): boolean => a.size === b.size && [...a].every((x) => b.has(x));

/** Plans every row of a job in file order (the order decides which of two equal keys is the duplicate). */
export function planRows(entity: ImportEntity, rows: readonly PlanInput[], catalog: CatalogSnapshot): PlanResult[] {
  const seen = new Set<string>();
  return rows.map((row) => {
    const errors = [...row.errors];
    const result = (planState: PlanState, ref?: CatalogRef): PlanResult => ({
      rowNo: row.rowNo,
      errors,
      planState: errors.length > 0 ? 'error' : planState,
      targetId: errors.length === 0 && ref ? ref.id : null,
      targetVersion: errors.length === 0 && ref ? ref.rowVersion : null,
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

    if (entity === 'model') {
      const n = row.normalized as ModelNormalized;
      const vendor = catalog.vendors.get(n.vendorKey);
      if (!vendor) {
        errors.push({ field: 'vendor_code', code: 'parent_missing' });
        return result('error');
      }
      const scope = `${vendor.id}|${n.codeKey}`;
      if (seen.has(scope)) {
        errors.push({ field: 'model_code', code: 'duplicate_in_file' });
        return result('error');
      }
      seen.add(scope);
      const found = catalog.models.get(scope);
      const processIds = new Set<string>();
      for (const key of n.processKeys) {
        const process = catalog.processes.get(key);
        if (!process) errors.push({ field: 'process_codes', code: 'process_missing' });
        else {
          processIds.add(process.id);
          if (!process.active && !found?.processIds.has(process.id)) {
            errors.push({ field: 'process_codes', code: 'process_inactive' });
          }
        }
      }
      if (!found) {
        if (!vendor.active) errors.push({ field: 'vendor_code', code: 'parent_inactive' });
        return result('new');
      }
      if (errors.length > 0) return result('error');
      if (!found.active) return result('conflict', found);
      const changed = found.name !== n.name || (n.processesMapped && !sameSet(processIds, found.processIds));
      return result(changed ? 'update' : 'unchanged', found);
    }

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
