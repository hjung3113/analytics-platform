// Value checks of the knowledge item write actions (#1197 w, ADR-0109). One zod schema per action, shared by the
// engine's `validate` (step 6) and the handler (which parses again to get the typed, normalised value) and by the
// tests. Pure and DB-free: what only the database can judge (unknown or inactive owner, unknown source, an
// archived item, an unchanged state) is the handler's. Limits are the CHECKs of migration 0082. Lengths count
// code points, like the DB. Codes: `required` (missing, wrong type or blank), `too_long`, `malformed` (not a uuid,
// an unknown enum value, a control character, a non-integer), `required_one` (owner: exactly one; content:
// observation or expected), `invalid_state` (the state does not belong to the dimension).

import { z } from 'zod';

import { REQUIRED, bounded, requiredText, uuid } from '../../../lib/input/fields.js';
import type { FieldError } from '../../menu-dispatch/types.js';
import { parseSubjects } from './item-subject-input.js';

export const ITEM_TYPE_CODES = ['anomaly', 'needs_check', 'behavior_note', 'guideline'] as const;
export const VERIFICATION_STATES = ['not_checked', 'observed', 'verified', 'disputed'] as const;
export const PROCESSING_STATES = ['open', 'under_investigation', 'resolved'] as const;
export const ASSESSMENT_DIMENSIONS = ['verification', 'processing'] as const;
export const EVIDENCE_SOURCE_KINDS = ['log_file', 'spec', 'image', 'validation_run', 'other'] as const;

export const TITLE_MAX = 200;
export const BODY_MAX = 20000;
export const EVIDENCE_MAX = 20;
export const EVIDENCE_NOTE_MAX = 500;
/** No DB CHECK: a cap so one evidence row cannot carry an unbounded string. */
export const EVIDENCE_FIELD_MAX = 1000;
export const CHANGE_NOTE_MAX = 500;
export const RATIONALE_MAX = 2000;
const REVISION_NO_MAX = 1_000_000;

export const optionalUuid = uuid.nullish();

function oneOf<const T extends readonly [string, ...string[]]>(values: T) {
  return z.enum(values, { errorMap: (_issue, ctx) => ({ message: ctx.data === undefined ? 'required' : 'malformed' }) });
}

/** An optional body text: absent, null or blank → null; otherwise the text as written. */
const bodyText = bounded(BODY_MAX)
  .nullish()
  .transform((v) => (v === undefined || v === null || v.trim() === '' ? null : v));

/** An optional short text of an evidence pointer: absent, null or blank → null; otherwise trimmed. */
const optionalShort = (max: number) =>
  bounded(max)
    .nullish()
    .transform((v) => (v === undefined || v === null || v.trim() === '' ? null : v.trim()));

export const evidencePointerSchema = z.object({
  sourceKind: oneOf(EVIDENCE_SOURCE_KINDS),
  sourceOwner: requiredText(EVIDENCE_FIELD_MAX),
  sourceRef: requiredText(EVIDENCE_FIELD_MAX),
  sourceVersion: optionalShort(EVIDENCE_FIELD_MAX),
  contentHash: optionalShort(EVIDENCE_FIELD_MAX),
  locator: optionalShort(EVIDENCE_FIELD_MAX),
  note: optionalShort(EVIDENCE_NOTE_MAX),
});
export type EvidencePointer = z.infer<typeof evidencePointerSchema>;

export const evidenceList = z
  .array(evidencePointerSchema, REQUIRED)
  .max(EVIDENCE_MAX, { message: 'too_long' })
  .nullish()
  .transform((v) => v ?? []);

/** `subjects` (#1196 f; zod prefixes the field name to the issue paths): omitted = a revise carries the previous revision's subjects; a list (even empty) replaces them. */
export const subjectsField = z.unknown().transform((raw, ctx) => {
  const parsed = parseSubjects(raw);
  if (parsed.ok) return parsed.value;
  for (const e of parsed.errors) ctx.addIssue({ code: 'custom', path: e.path.slice(1), message: e.code });
  return z.NEVER;
});

export const contentFields = {
  typeCode: oneOf(ITEM_TYPE_CODES),
  title: requiredText(TITLE_MAX),
  observation: bodyText,
  expected: bodyText,
  analysisOpinion: bodyText,
  improvement: bodyText,
};

type Content = { observation: string | null; expected: string | null };
export function requireContent(value: Content, ctx: z.RefinementCtx) {
  if (value.observation === null && value.expected === null) {
    ctx.addIssue({ code: 'custom', path: ['observation'], message: 'required_one' });
  }
}

type Owner = { ownerModelId?: string | null | undefined; ownerSoftwareId?: string | null | undefined };
export function requireOneOwner(value: Owner, ctx: z.RefinementCtx) {
  const set = [value.ownerModelId, value.ownerSoftwareId].filter((v) => v !== undefined && v !== null);
  if (set.length !== 1) ctx.addIssue({ code: 'custom', path: ['owner'], message: 'required_one' });
}

export const ITEM_INPUT_SCHEMAS = {
  create: z
    .object({
      ownerModelId: optionalUuid,
      ownerSoftwareId: optionalUuid,
      ...contentFields,
      evidence: evidenceList,
      subjects: subjectsField,
    })
    .superRefine(requireOneOwner)
    .superRefine(requireContent),
  revise: z
    .object({
      id: uuid,
      ...contentFields,
      evidence: evidenceList,
      subjects: subjectsField,
      changeNote: requiredText(CHANGE_NOTE_MAX),
    })
    .superRefine(requireContent),
  assess: z
    .object({
      id: uuid,
      dimension: oneOf(ASSESSMENT_DIMENSIONS),
      newState: z.string(REQUIRED),
      rationale: requiredText(RATIONALE_MAX),
    })
    .superRefine((value, ctx) => {
      const allowed: readonly string[] =
        value.dimension === 'verification' ? VERIFICATION_STATES : PROCESSING_STATES;
      if (!allowed.includes(value.newState)) {
        ctx.addIssue({ code: 'custom', path: ['newState'], message: 'invalid_state' });
      }
    }),
  derive: z
    .object({
      sourceItemId: uuid,
      sourceRevisionNo: z
        .number(REQUIRED)
        .refine((n) => Number.isInteger(n) && n >= 1 && n <= REVISION_NO_MAX, { message: 'malformed' }),
      ownerModelId: optionalUuid,
      ownerSoftwareId: optionalUuid,
      ...contentFields,
    })
    .superRefine(requireOneOwner)
    .superRefine(requireContent),
  setArchived: z.object({ id: uuid, archived: z.boolean(REQUIRED) }),
} as const;

export type ItemOp = keyof typeof ITEM_INPUT_SCHEMAS;
export type ItemInput<Op extends ItemOp> = z.infer<(typeof ITEM_INPUT_SCHEMAS)[Op]>;

/** One error per path (the first); an issue without one of our codes (a wrong type) is `required`. */
export function fieldErrors(error: z.ZodError): FieldError[] {
  const seen = new Set<string>();
  const out: FieldError[] = [];
  for (const issue of error.issues) {
    const path = issue.path.map(String);
    const key = path.join('.');
    if (seen.has(key)) continue;
    seen.add(key);
    // Type errors without our message (e.g. a wrong object shape) are `required`.
    const known = ['required', 'too_long', 'malformed', 'required_one', 'invalid_state', 'duplicate'];
    out.push({ path, code: known.includes(issue.message) ? issue.message : 'required' });
  }
  return out;
}

export function parseItemInput<Op extends ItemOp>(
  op: Op,
  input: Record<string, unknown>,
): { ok: true; value: ItemInput<Op> } | { ok: false; errors: FieldError[] } {
  const parsed = ITEM_INPUT_SCHEMAS[op].safeParse(input);
  return parsed.success
    ? { ok: true, value: parsed.data as ItemInput<Op> }
    : { ok: false, errors: fieldErrors(parsed.error) };
}

export function validateItemInput(op: ItemOp, input: Record<string, unknown>): FieldError[] {
  const parsed = parseItemInput(op, input);
  return parsed.ok ? [] : parsed.errors;
}
