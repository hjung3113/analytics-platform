// Value checks and normalisation of the baseline write actions (#1478 D-b, design log-test-datasets §3.3 / §6). Pure and DB-free: one zod
// schema per action, shared by the engine's `validate` and the handler's typed parse. What needs the database (the revision, its dataset's
// visibility, locks, evidence locations against the revision's files) is the handler's. Codes as the dataset actions: `required`,
// `too_long`, `malformed`, `too_many`, `duplicate`. A baseline holds data only: expected result names and locations, never code.

import { z } from 'zod';

import { requiredText, uuid } from '../../../lib/input/fields.js';
import type { FieldError } from '../../menu-dispatch/types.js';

/** The expectation vocabulary (design §3.3). Enforced here; the database holds only the JSON shape. */
export const EXPECTATIONS = ['PASS', 'FAIL', 'WARN', 'NOT_APPLICABLE', 'EXPECTED_UNSUPPORTED'] as const;
export type ExpectedResult = (typeof EXPECTATIONS)[number];

export const RULE_ID_MAX = 200;
export const SCOPE_MAX = 1000;
export const EXPECTATIONS_MAX = 1000;
export const EVIDENCE_MAX = 20;
export const EXCEPTION_TEXT_MAX = 500;
export const FILE_REF_MAX = 500;
export const PIN_TEXT_MAX = 200;
export const APPROVE_REASON_MAX = 2000;

const NON_TEXT = { required_error: 'required', invalid_type_error: 'malformed' } as const;
const DIGEST = /^[0-9a-f]{64}$/;
const digest = z.string(NON_TEXT).refine((v) => DIGEST.test(v), { message: 'malformed' });
const ruleId = requiredText(RULE_ID_MAX);
const dedupe = <T>(values: readonly T[], key: (v: T) => string) => new Set(values.map(key)).size === values.length;

const specPin = z
  .object({
    modelId: uuid,
    /** The software version the effective spec was read for; null = the model's published revision as is. */
    softwareId: uuid.nullable(),
    revisionId: uuid,
    changeSetDigest: digest,
  })
  .strict({ message: 'malformed' })
  .transform((v) => ({ ...v, modelId: v.modelId.toLowerCase(), softwareId: v.softwareId?.toLowerCase() ?? null, revisionId: v.revisionId.toLowerCase() }));

/** Known pins only (design §3.3): a key is present or absent, never a guess. */
export const profilePin = z
  .object({
    specPin: specPin.optional(),
    ruleSetRevision: requiredText(PIN_TEXT_MAX).optional(),
    parserVersion: requiredText(PIN_TEXT_MAX).optional(),
    engineProfileRef: requiredText(PIN_TEXT_MAX).optional(),
  })
  .strict({ message: 'malformed' });

const expectedScope = z
  .array(ruleId, NON_TEXT)
  .max(SCOPE_MAX, { message: 'too_many' })
  .refine((ids) => dedupe(ids, (id) => id), { message: 'duplicate' });

const evidence = z
  .object({ fileRef: requiredText(FILE_REF_MAX), line: z.number(NON_TEXT).int({ message: 'malformed' }).min(1, { message: 'malformed' }).max(2_000_000_000, { message: 'malformed' }) })
  .strict({ message: 'malformed' });

const expectation = z
  .object({
    ruleId,
    expected: z.enum(EXPECTATIONS, { errorMap: (_i, ctx) => ({ message: ctx.data === undefined ? 'required' : 'malformed' }) }),
    exception: z
      .object({ reason: requiredText(EXCEPTION_TEXT_MAX), scope: requiredText(EXCEPTION_TEXT_MAX) })
      .strict({ message: 'malformed' })
      .optional(),
    evidence: z.array(evidence, NON_TEXT).max(EVIDENCE_MAX, { message: 'too_many' }).optional(),
  })
  .strict({ message: 'malformed' });

const expectations = z
  .array(expectation, NON_TEXT)
  .max(EXPECTATIONS_MAX, { message: 'too_many' })
  .refine((list) => dedupe(list, (e) => e.ruleId), { message: 'duplicate' });

/** Location + digest of an externally owned golden; its content is never stored. */
const parserGoldenRef = z
  .object({ location: requiredText(FILE_REF_MAX), digest })
  .strict({ message: 'malformed' });

export const BASELINE_INPUT_SCHEMAS = {
  baselineDraftCreate: z.object({ datasetRevisionId: uuid, fromAttemptId: uuid.optional() }),
  baselineUpdateDraft: z.object({
    id: uuid,
    profilePin: profilePin.optional(),
    expectedScope: expectedScope.optional(),
    expectations: expectations.optional(),
    /** `null` clears the reference. */
    parserGoldenRef: parserGoldenRef.nullable().optional(),
  }),
  baselineApprove: z.object({ id: uuid, reason: requiredText(APPROVE_REASON_MAX) }),
} as const;

export type BaselineOp = keyof typeof BASELINE_INPUT_SCHEMAS;
export type BaselineInput<Op extends BaselineOp> = z.infer<(typeof BASELINE_INPUT_SCHEMAS)[Op]>;
export type ProfilePin = z.infer<typeof profilePin>;
export type Expectation = z.infer<typeof expectation>;

export const BASELINE_INPUT_KEYS = {
  baselineDraftCreate: ['datasetRevisionId', 'fromAttemptId'],
  baselineUpdateDraft: ['id', 'profilePin', 'expectedScope', 'expectations', 'parserGoldenRef'],
  baselineApprove: ['id', 'reason'],
} as const satisfies Record<BaselineOp, readonly string[]>;

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

export type BaselineParse<Op extends BaselineOp> = { ok: true; value: BaselineInput<Op> } | { ok: false; errors: FieldError[] };

export function parseBaselineInput<Op extends BaselineOp>(op: Op, input: Record<string, unknown>): BaselineParse<Op> {
  const parsed = BASELINE_INPUT_SCHEMAS[op].safeParse(input);
  return parsed.success ? { ok: true, value: parsed.data as BaselineInput<Op> } : { ok: false, errors: fieldErrors(parsed.error) };
}

export function validateBaselineInput(op: BaselineOp, input: Record<string, unknown>): FieldError[] {
  const parsed = parseBaselineInput(op, input);
  if (!parsed.ok) return parsed.errors;
  // The attempt copy needs a lifecycle read port that does not exist yet (backlog): a request for it is refused, never silently ignored.
  if (op === 'baselineDraftCreate' && (parsed.value as BaselineInput<'baselineDraftCreate'>).fromAttemptId !== undefined) {
    return [{ path: ['fromAttemptId'], code: 'unsupported' }];
  }
  return [];
}

