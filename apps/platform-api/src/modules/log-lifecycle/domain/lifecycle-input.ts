// Value checks and normalisation of the log lifecycle write actions (#1444 c, design §5). Pure and DB-free: one zod
// schema per action, shared by the engine's `validate` and the handler's typed parse. What needs the database (model,
// software, owner, stage pair, locks) is the handler's. Codes as the other modules: `required` (missing or wrong type),
// `too_long`, `malformed`; plus `reason: required` when a cancel has no reason.

import { z } from 'zod';

import { clearableText, requiredText, uuid } from '../../../lib/input/fields.js';
import type { FieldError } from '../../menu-dispatch/types.js';
import { type SampleSet, parseSampleSet } from './sample-set.js';
import { STAGES } from './stage-transitions.js';

export const REASON_MAX = 2000;
export const NOTE_MAX = 2000;
/** Attachments one `roundEvidenceAttach` call links (start value, like the other limits of the design's D7). */
export const EVIDENCE_ATTACH_MAX = 20;
export const PROJECT_KINDS = ['new', 'redevelopment'] as const;

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
function isCalendarDay(value: string): boolean {
  const m = DAY.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}
const NON_TEXT = { required_error: 'required', invalid_type_error: 'malformed' } as const;
const clearableDay = z.string(NON_TEXT).refine(isCalendarDay, { message: 'malformed' }).nullable().optional();
const enumOf = <T extends readonly [string, ...string[]]>(values: T) =>
  z.enum(values, { errorMap: (_i, ctx) => ({ message: ctx.data === undefined ? 'required' : 'malformed' }) });

export const LIFECYCLE_INPUT_SCHEMAS = {
  projectCreate: z.object({
    modelId: uuid,
    softwareId: uuid.nullable().optional(),
    kind: enumOf(PROJECT_KINDS),
    ownerActorId: uuid,
    targetDate: clearableDay,
  }),
  projectSetStage: z
    .object({ id: uuid, toStage: enumOf(STAGES), reason: clearableText(REASON_MAX) })
    .superRefine((v, ctx) => {
      if (v.toStage === 'cancelled' && (v.reason === undefined || v.reason === null)) {
        ctx.addIssue({ code: 'custom', path: ['reason'], message: 'required' });
      }
    }),
  projectReopen: z.object({ id: uuid, reason: requiredText(REASON_MAX) }),
  projectUpdate: z.object({
    id: uuid,
    ownerActorId: uuid.optional(),
    targetDate: clearableDay,
    softwareId: uuid.nullable().optional(),
  }),
  roundOpen: z.object({ projectId: uuid, sampleSet: z.unknown(), note: clearableText(NOTE_MAX) }),
  roundClose: z.object({ id: uuid }),
  roundEvidenceAttach: z.object({
    roundId: uuid,
    attachmentIds: z
      .array(uuid, NON_TEXT)
      .min(1, { message: 'required' })
      .max(EVIDENCE_ATTACH_MAX, { message: 'too_many' })
      .refine((ids) => new Set(ids.map((id) => id.toLowerCase())).size === ids.length, { message: 'duplicate' }),
  }),
} as const;

export type LifecycleOp = keyof typeof LIFECYCLE_INPUT_SCHEMAS;
export type LifecycleInput<Op extends LifecycleOp> = z.infer<(typeof LIFECYCLE_INPUT_SCHEMAS)[Op]>;

export const LIFECYCLE_INPUT_KEYS = {
  projectCreate: ['modelId', 'softwareId', 'kind', 'ownerActorId', 'targetDate'],
  projectSetStage: ['id', 'toStage', 'reason'],
  projectReopen: ['id', 'reason'],
  projectUpdate: ['id', 'ownerActorId', 'targetDate', 'softwareId'],
  roundOpen: ['projectId', 'sampleSet', 'note'],
  roundClose: ['id'],
  roundEvidenceAttach: ['roundId', 'attachmentIds'],
} as const satisfies Record<LifecycleOp, readonly string[]>;

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

export type ParseResult<T> = { ok: true; value: T } | { ok: false; errors: FieldError[] };

export function parseLifecycleInput<Op extends Exclude<LifecycleOp, 'roundOpen'>>(
  op: Op,
  input: Record<string, unknown>,
): ParseResult<LifecycleInput<Op>> {
  const parsed = LIFECYCLE_INPUT_SCHEMAS[op].safeParse(input);
  return parsed.success ? { ok: true, value: parsed.data as LifecycleInput<Op> } : { ok: false, errors: fieldErrors(parsed.error) };
}

export type RoundOpenInput = Omit<LifecycleInput<'roundOpen'>, 'sampleSet'> & { sampleSet: SampleSet };

/** `roundOpen`: the zod fields plus the sample set parser (its own paths and codes). */
export function parseRoundOpen(input: Record<string, unknown>): ParseResult<RoundOpenInput> {
  const parsed = LIFECYCLE_INPUT_SCHEMAS.roundOpen.safeParse(input);
  const errors = parsed.success ? [] : fieldErrors(parsed.error).filter((e) => e.path[0] !== 'sampleSet');
  const set = parseSampleSet(input.sampleSet);
  if (!set.ok) errors.push(...set.errors);
  if (errors.length > 0 || !parsed.success || !set.ok) return { ok: false, errors };
  return { ok: true, value: { ...parsed.data, sampleSet: set.value } };
}

export function validateLifecycleInput(op: LifecycleOp, input: Record<string, unknown>): FieldError[] {
  const parsed = op === 'roundOpen' ? parseRoundOpen(input) : parseLifecycleInput(op, input);
  return parsed.ok ? [] : parsed.errors;
}
