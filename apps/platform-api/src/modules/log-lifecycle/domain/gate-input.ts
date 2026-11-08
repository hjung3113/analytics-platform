// Value checks of `logLifecycle.gateDecide` (#1446 e, design §5). Pure and DB-free: one zod schema shared by the engine's
// `validate` and the handler's typed parse. What needs the database (round, project, verdict, the accepting actor) is
// the handler's. Codes as the other lifecycle inputs: `required`, `too_long`, `malformed`.

import { z } from 'zod';

import { requiredText, uuid } from '../../../lib/input/fields.js';
import type { FieldError } from '../../menu-dispatch/types.js';
import { GATE_DECISIONS } from './gate-rules.js';
import { REASON_MAX } from './lifecycle-input.js';

export const EXCEPTION_SCOPE_MAX = 500;
export const GATE_TARGET_STAGES = ['kickoff', 'alpha', 'beta', 'completed'] as const;

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
function isCalendarDay(value: string): boolean {
  const m = DAY.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}
const enumOf = <T extends readonly [string, ...string[]]>(values: T) =>
  z.enum(values, { errorMap: (_i, ctx) => ({ message: ctx.data === undefined ? 'required' : 'malformed' }) });

const exceptionSchema = z
  .object(
    {
      riskAcceptedBy: uuid,
      scope: requiredText(EXCEPTION_SCOPE_MAX),
      until: z.string({ invalid_type_error: 'malformed' }).refine(isCalendarDay, { message: 'malformed' }).optional(),
    },
    { required_error: 'required', invalid_type_error: 'required' },
  )
  .strict();

export const GATE_INPUT_KEYS = ['roundId', 'targetStage', 'decision', 'reason', 'exception'] as const;

export const gateInputSchema = z
  .object({
    roundId: uuid,
    targetStage: enumOf(GATE_TARGET_STAGES),
    decision: enumOf(GATE_DECISIONS),
    reason: requiredText(REASON_MAX),
    exception: z.unknown().optional(),
  })
  .superRefine((v, ctx) => {
    // `exception` belongs to the exception decision alone: required there, refused anywhere else.
    if (v.decision === 'exception' && v.exception === undefined) ctx.addIssue({ code: 'custom', path: ['exception'], message: 'required' });
    if (v.decision !== 'exception' && v.exception !== undefined) ctx.addIssue({ code: 'custom', path: ['exception'], message: 'malformed' });
  });

export interface GateException {
  riskAcceptedBy: string;
  scope: string;
  until?: string | undefined;
}
export interface GateInput {
  roundId: string;
  targetStage: (typeof GATE_TARGET_STAGES)[number];
  decision: (typeof GATE_DECISIONS)[number];
  reason: string;
  exception?: GateException;
}

const KNOWN = ['required', 'too_long', 'malformed'];
const toErrors = (error: z.ZodError, prefix: string[] = []): FieldError[] => {
  const seen = new Set<string>();
  const out: FieldError[] = [];
  for (const issue of error.issues) {
    const path = [...prefix, ...issue.path.map(String)];
    const key = path.join('.');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ path, code: KNOWN.includes(issue.message) ? issue.message : 'malformed' });
  }
  return out;
};

export type GateParse = { ok: true; value: GateInput } | { ok: false; errors: FieldError[] };

export function parseGateInput(input: Record<string, unknown>): GateParse {
  const parsed = gateInputSchema.safeParse(input);
  const errors = parsed.success ? [] : toErrors(parsed.error);
  let exception: GateException | undefined;
  if (input.decision === 'exception' && input.exception !== undefined) {
    const ex = exceptionSchema.safeParse(input.exception);
    if (ex.success) exception = ex.data;
    else errors.push(...toErrors(ex.error, ['exception']));
  }
  if (errors.length > 0 || !parsed.success) return { ok: false, errors };
  const base = { roundId: parsed.data.roundId, targetStage: parsed.data.targetStage, decision: parsed.data.decision, reason: parsed.data.reason };
  return { ok: true, value: exception ? { ...base, exception } : base };
}

export const validateGateInput = (input: Record<string, unknown>): FieldError[] => {
  const result = parseGateInput(input);
  return result.ok ? [] : result.errors;
};
