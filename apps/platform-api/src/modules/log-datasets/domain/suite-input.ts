// Value checks and normalisation of the regression suite write actions (#1479 D-c, design log-test-datasets §3.5 / §6): suiteCreate,
// suiteUpdate, suiteRun. Pure and DB-free: one zod schema per action, shared by the engine's `validate` and the handler's typed parse.
// What needs the database (datasets, their visibility, revisions, baselines, the run cap) is the handler's. Codes as the other dataset
// actions: `required`, `too_long`, `malformed`, `too_many`, `duplicate`. A suite holds data references only: no field takes code.

import { z } from 'zod';

import { clearableText, requiredText, uuid } from '../../../lib/input/fields.js';
import type { FieldError } from '../../menu-dispatch/types.js';
import { profilePin } from './baseline-input.js';

export const SUITE_NAME_MAX = 200;
export const SUITE_ITEMS_MAX = 20;
export const ENGINE_PROFILE_MAX = 200;
export const IDEMPOTENCY_KEY_MAX = 200;

const NON_TEXT = { required_error: 'required', invalid_type_error: 'malformed' } as const;
const lower = (v: string | undefined) => v?.toLowerCase();

/** One suite item: a dataset, optionally pinned to a revision and a baseline; omissions are resolved (and pinned) at run time. */
const suiteItem = z
  .object({ datasetId: uuid, datasetRevisionId: uuid.optional(), baselineId: uuid.optional() })
  .strict({ message: 'malformed' })
  .transform((v) => ({
    datasetId: v.datasetId.toLowerCase(),
    ...(v.datasetRevisionId === undefined ? {} : { datasetRevisionId: lower(v.datasetRevisionId) as string }),
    ...(v.baselineId === undefined ? {} : { baselineId: lower(v.baselineId) as string }),
  }));
export type SuiteItem = z.infer<typeof suiteItem>;

const items = z
  .array(suiteItem, NON_TEXT)
  .min(1, { message: 'required' })
  .max(SUITE_ITEMS_MAX, { message: 'too_many' })
  // The same dataset twice at the same revision (or twice unpinned) would run the same samples twice.
  .refine((list) => new Set(list.map((i) => `${i.datasetId}/${i.datasetRevisionId ?? ''}`)).size === list.length, { message: 'duplicate' });

const engineProfileRef = clearableText(ENGINE_PROFILE_MAX);

export const SUITE_INPUT_SCHEMAS = {
  suiteCreate: z.object({ name: requiredText(SUITE_NAME_MAX), items, engineProfileRef: engineProfileRef.optional(), requiredPin: profilePin.optional() }),
  suiteUpdate: z.object({ id: uuid, name: requiredText(SUITE_NAME_MAX).optional(), items: items.optional(), engineProfileRef, requiredPin: profilePin.optional() }),
  suiteRun: z.object({ suiteId: uuid, idempotencyKey: requiredText(IDEMPOTENCY_KEY_MAX) }),
} as const;

export type SuiteOp = keyof typeof SUITE_INPUT_SCHEMAS;
export type SuiteInput<Op extends SuiteOp> = z.infer<(typeof SUITE_INPUT_SCHEMAS)[Op]>;

export const SUITE_INPUT_KEYS = {
  suiteCreate: ['name', 'items', 'engineProfileRef', 'requiredPin'],
  suiteUpdate: ['id', 'name', 'items', 'engineProfileRef', 'requiredPin'],
  suiteRun: ['suiteId', 'idempotencyKey'],
} as const satisfies Record<SuiteOp, readonly string[]>;

const KNOWN = ['required', 'too_long', 'malformed', 'too_many', 'duplicate'];
function fieldErrors(error: z.ZodError): FieldError[] {
  const seen = new Set<string>();
  const out: FieldError[] = [];
  for (const issue of error.issues) {
    const path = issue.path.map(String);
    const key = path.join('.');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ path, code: KNOWN.includes(issue.message) ? issue.message : 'required' });
  }
  return out;
}

export type SuiteParse<Op extends SuiteOp> = { ok: true; value: SuiteInput<Op> } | { ok: false; errors: FieldError[] };

export function parseSuiteInput<Op extends SuiteOp>(op: Op, input: Record<string, unknown>): SuiteParse<Op> {
  const parsed = SUITE_INPUT_SCHEMAS[op].safeParse(input);
  return parsed.success ? { ok: true, value: parsed.data as SuiteInput<Op> } : { ok: false, errors: fieldErrors(parsed.error) };
}

export function validateSuiteInput(op: SuiteOp, input: Record<string, unknown>): FieldError[] {
  const parsed = parseSuiteInput(op, input);
  return parsed.ok ? [] : parsed.errors;
}
