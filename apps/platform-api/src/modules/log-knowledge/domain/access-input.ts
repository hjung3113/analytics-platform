// Value checks of the object access actions (#1504 S-a). Pure and DB-free. Ids are accepted in any spelling and handled in the DB's
// lower-case. `validUntil` is an ISO instant with an explicit offset that lies in the future at write time (the handler judges the
// clock, this file only the spelling). Only an Actor can be a grantee (team and role grantees need a Core membership read).

import { z } from 'zod';

import { uuid } from '../../../lib/input/fields.js';
import type { FieldError } from '../../menu-dispatch/types.js';
import { ACCESS_EFFECTS, ACCESS_MODES, ACCESS_TARGET_KINDS } from './access-visibility.js';
import { fieldErrors } from './item-input.js';

export const ACCESS_INPUT_KEYS = {
  accessModeSet: ['targetKind', 'targetId', 'mode'],
  accessRuleAdd: ['targetKind', 'targetId', 'granteeId', 'effect', 'validUntil'],
  accessRuleRevoke: ['ruleId'],
} as const;
export type AccessOp = keyof typeof ACCESS_INPUT_KEYS;

const required = { required_error: 'required', invalid_type_error: 'required' } as const;
const kind = z.enum(ACCESS_TARGET_KINDS, { errorMap: (_i, ctx) => ({ message: ctx.data === undefined ? 'required' : 'malformed' }) });
const mode = z.enum(ACCESS_MODES, { errorMap: (_i, ctx) => ({ message: ctx.data === undefined ? 'required' : 'malformed' }) });
const effect = z.enum(ACCESS_EFFECTS, { errorMap: (_i, ctx) => ({ message: ctx.data === undefined ? 'required' : 'malformed' }) });
/** Absent or null = the rule never expires. */
const validUntil = z
  .string(required)
  .refine((v) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.test(v) && !Number.isNaN(Date.parse(v)), { message: 'malformed' })
  .transform((v) => new Date(v))
  .nullish()
  .transform((v) => v ?? null);

const SCHEMAS = {
  accessModeSet: z.object({ targetKind: kind, targetId: uuid.transform((v) => v.toLowerCase()), mode }),
  accessRuleAdd: z.object({ targetKind: kind, targetId: uuid.transform((v) => v.toLowerCase()), granteeId: uuid.transform((v) => v.toLowerCase()), effect, validUntil }),
  accessRuleRevoke: z.object({ ruleId: uuid.transform((v) => v.toLowerCase()) }),
} as const;

export type AccessInput<Op extends AccessOp> = z.infer<(typeof SCHEMAS)[Op]>;
export type AccessParse<Op extends AccessOp> = { ok: true; value: AccessInput<Op> } | { ok: false; errors: FieldError[] };

export function parseAccessInput<Op extends AccessOp>(op: Op, input: Record<string, unknown>): AccessParse<Op> {
  const parsed = SCHEMAS[op].safeParse(input);
  return parsed.success ? { ok: true, value: parsed.data as AccessInput<Op> } : { ok: false, errors: fieldErrors(parsed.error) };
}

export function validateAccessInput(op: AccessOp, input: Record<string, unknown>): FieldError[] {
  const parsed = parseAccessInput(op, input);
  return parsed.ok ? [] : parsed.errors;
}
