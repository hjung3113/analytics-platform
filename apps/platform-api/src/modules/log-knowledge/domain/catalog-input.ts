// Value checks of the catalog write actions (#1194 a). Pure and DB-free: the engine runs them at step 6;
// what only the database can judge (duplicate key, unknown or inactive parent) is the handler's.
// Codes: `required` (missing, wrong type or blank), `too_long`, `malformed` (not a uuid, control
// character), `duplicate` (the same id twice in `processIds`). Lengths count code points, like the DB CHECKs.

import { isUuid } from '../../../lib/input/fields.js';
import type { FieldError } from '../../menu-dispatch/types.js';
import { unsafeText } from '../../platform-port/text-safety.js';
import { CODE_MAX, NAME_MAX } from './code-key.js';

export const PROCESS_IDS_MAX = 200;

const length = (value: string): number => [...value].length;

/** A required text: a string with a non-blank value within `max` (`allowBlank` only for a software name). */
function textErrors(
  input: Record<string, unknown>,
  field: string,
  max: number,
  allowBlank = false,
): FieldError[] {
  const value = input[field];
  if (typeof value !== 'string') return [{ path: [field], code: 'required' }];
  if (unsafeText(value)) return [{ path: [field], code: 'malformed' }];
  if (!allowBlank && value.trim() === '') return [{ path: [field], code: 'required' }];
  if (length(value) > max) return [{ path: [field], code: 'too_long' }];
  return [];
}

const idErrors = (input: Record<string, unknown>, field: string): FieldError[] => {
  const value = input[field];
  if (typeof value !== 'string' || value === '') return [{ path: [field], code: 'required' }];
  return isUuid(value) ? [] : [{ path: [field], code: 'malformed' }];
};

function processIdsErrors(input: Record<string, unknown>): FieldError[] {
  const value = input.processIds;
  if (!Array.isArray(value)) return [{ path: ['processIds'], code: 'required' }];
  if (value.length > PROCESS_IDS_MAX) return [{ path: ['processIds'], code: 'too_long' }];
  const errors: FieldError[] = [];
  const seen = new Set<string>();
  value.forEach((entry: unknown, index) => {
    if (typeof entry !== 'string' || !isUuid(entry)) {
      errors.push({ path: ['processIds', String(index)], code: 'malformed' });
    } else if (seen.has(entry.toLowerCase())) {
      errors.push({ path: ['processIds', String(index)], code: 'duplicate' });
    } else seen.add(entry.toLowerCase());
  });
  return errors;
}

export type CatalogOp = 'create' | 'update' | 'setActive';
type Kind = 'vendor' | 'process' | 'model' | 'software';

export interface ValidateOptions {
  /**
   * Create of a vendor, process or model only (the catalog create action): a missing or blank `code` is taken from
   * `name` (ADR-0107 decision 2 supplement). The derived code obeys `CODE_MAX`: an overlong one is `too_long` on
   * `code`, never truncated. The import's own row checks leave this off and keep the strict rule.
   */
  deriveCode?: boolean;
}

const isBlank = (value: unknown): boolean =>
  value === undefined || value === null || (typeof value === 'string' && value.trim() === '');

/** The code a create stores: the given one, else (blank or missing) the name. */
export const createCodeOf = (input: Record<string, unknown>): unknown => (isBlank(input.code) ? input.name : input.code);

export function validateCatalogInput(
  kind: Kind,
  op: CatalogOp,
  input: Record<string, unknown>,
  options?: ValidateOptions,
): FieldError[] {
  if (op === 'setActive') {
    return [
      ...idErrors(input, 'id'),
      ...(typeof input.active === 'boolean' ? [] : [{ path: ['active'], code: 'required' }]),
    ];
  }
  const label = kind === 'software' ? 'versionLabel' : 'code';
  if (options?.deriveCode && op === 'create' && kind !== 'software' && isBlank(input.code)) {
    // The name's own errors (required, malformed, name length) are reported on `name`; only the code limit is new.
    const derivedTooLong = typeof input.name === 'string' && length(input.name) > CODE_MAX;
    return [
      ...(kind === 'model' ? idErrors(input, 'vendorId') : []),
      ...textErrors(input, 'name', NAME_MAX),
      ...(derivedTooLong && length(input.name as string) <= NAME_MAX ? [{ path: ['code'], code: 'too_long' }] : []),
      ...(kind === 'model' ? processIdsErrors(input) : []),
    ];
  }
  return [
    ...(op === 'update' ? idErrors(input, 'id') : []),
    ...(op === 'create' && kind === 'model' ? idErrors(input, 'vendorId') : []),
    ...(op === 'create' && kind === 'software' ? idErrors(input, 'modelId') : []),
    ...textErrors(input, label, CODE_MAX),
    ...textErrors(input, 'name', NAME_MAX, kind === 'software'),
    ...(kind === 'model' ? processIdsErrors(input) : []),
  ];
}
