// Column mapping of a catalog import (#1195 a, design v0.6 §6.2 ②, product reference §15.4): the fields each entity
// takes and the checks of a `{<field>: <header>}` mapping against the file's headers. Pure.

import type { FieldError } from '../../menu-dispatch/types.js';

export type ImportEntity = 'vendor' | 'process' | 'model' | 'software';
export const IMPORT_ENTITIES: readonly ImportEntity[] = ['vendor', 'process', 'model', 'software'];

export interface EntityFields {
  required: readonly string[];
  optional: readonly string[];
}

/** Minimum columns of product reference §15.4; `process_codes` and `version_name` are the optional extras. */
export const ENTITY_FIELDS: Record<ImportEntity, EntityFields> = {
  vendor: { required: ['vendor_code', 'vendor_name'], optional: [] },
  process: { required: ['process_code', 'process_name'], optional: [] },
  model: { required: ['vendor_code', 'model_code', 'model_name'], optional: ['process_codes'] },
  software: { required: ['vendor_code', 'model_code', 'version_key'], optional: ['version_name'] },
};

export const MAPPING_VALUE_MAX = 500;

export const isImportEntity = (value: unknown): value is ImportEntity =>
  typeof value === 'string' && (IMPORT_ENTITIES as readonly string[]).includes(value);

/** Shape of the `mapping` input (the engine's step 6): a plain object of non-empty strings. */
export function mappingShapeErrors(mapping: unknown): FieldError[] {
  if (typeof mapping !== 'object' || mapping === null || Array.isArray(mapping)) {
    return [{ path: ['mapping'], code: 'required' }];
  }
  const entries = Object.entries(mapping as Record<string, unknown>);
  if (entries.length > 60) return [{ path: ['mapping'], code: 'too_long' }];
  const errors: FieldError[] = [];
  for (const [field, header] of entries) {
    if (typeof header !== 'string' || header === '') errors.push({ path: ['mapping', field], code: 'required' });
    else if ([...header].length > MAPPING_VALUE_MAX) errors.push({ path: ['mapping', field], code: 'too_long' });
  }
  return errors;
}

/**
 * Mapping against the entity and the file: unknown field, missing required field, header not in the file, one
 * header mapped to two fields (`duplicate_source`, reported on the later field in the entity's field order).
 */
export function validateMapping(
  entity: ImportEntity,
  headers: readonly string[],
  mapping: Record<string, string>,
): FieldError[] {
  const { required, optional } = ENTITY_FIELDS[entity];
  const known = new Set([...required, ...optional]);
  const errors: FieldError[] = [];
  for (const field of Object.keys(mapping)) {
    if (!known.has(field)) errors.push({ path: ['mapping', field], code: 'unknown_field' });
  }
  for (const field of required) {
    if (!(field in mapping)) errors.push({ path: ['mapping', field], code: 'required' });
  }
  const headerSet = new Set(headers);
  const used = new Map<string, string>();
  for (const field of [...required, ...optional]) {
    const header = mapping[field];
    if (header === undefined) continue;
    if (!headerSet.has(header)) {
      errors.push({ path: ['mapping', field], code: 'unknown_header' });
      continue;
    }
    if (used.has(header)) errors.push({ path: ['mapping', field], code: 'duplicate_source' });
    else used.set(header, field);
  }
  return errors;
}
