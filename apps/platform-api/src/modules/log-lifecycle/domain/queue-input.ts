// Value checks of the validation request write actions (#1445 d, design §5). Pure and DB-free, same shape as
// `lifecycle-input.ts`: one zod schema per action shared by the engine's `validate` and the handler's typed parse.
// What needs the database (round open, immediate limit, request state) is the handler's.

import { z } from 'zod';

import { bounded, uuid } from '../../../lib/input/fields.js';
import type { FieldError } from '../../menu-dispatch/types.js';
import { MAX_ATTEMPTS_DEFAULT, MAX_ATTEMPTS_LIMIT, PRIORITY_MAX, PRIORITY_MIN } from './request-states.js';
import { REASON_MAX } from './lifecycle-input.js';
import { parseRunWindow } from './run-window.js';

const NON_NUMBER = { required_error: 'required', invalid_type_error: 'malformed' } as const;
const intIn = (min: number, max: number) => z.number(NON_NUMBER).int('malformed').min(min, 'malformed').max(max, 'malformed');
const reasonText = bounded(REASON_MAX).refine((v) => v.trim() !== '', { message: 'required' }).transform((v) => v.trim());

export const QUEUE_INPUT_SCHEMAS = {
  requestCreate: z.object({
    roundId: uuid,
    priority: intIn(PRIORITY_MIN, PRIORITY_MAX),
    immediate: z.boolean({ invalid_type_error: 'malformed' }).optional(),
    engineProfileRef: bounded(200).nullable().optional(),
    maxAttempts: intIn(1, MAX_ATTEMPTS_LIMIT).optional(),
  }),
  requestCancel: z.object({ id: uuid, reason: reasonText }),
  queueSettingsUpdate: z
    .object({
      runWindow: z.unknown().optional(),
      leaseSeconds: intIn(30, 3600).optional(),
      immediateLimit: intIn(0, 50).optional(),
      excerptRetentionDays: intIn(1, 3650).optional(),
    })
    .superRefine((v, ctx) => {
      if (v.runWindow === undefined && v.leaseSeconds === undefined && v.immediateLimit === undefined && v.excerptRetentionDays === undefined) {
        ctx.addIssue({ code: 'custom', path: ['runWindow'], message: 'required' });
      }
      if (v.runWindow !== undefined && parseRunWindow(v.runWindow) === null) ctx.addIssue({ code: 'custom', path: ['runWindow'], message: 'malformed' });
    }),
  excerptAccessSet: z.object({
    sourceOwner: bounded(200).refine((v) => v.trim() !== '', { message: 'required' }).transform((v) => v.trim()),
    actorId: uuid,
    allowed: z.boolean({ required_error: 'required', invalid_type_error: 'malformed' }),
  }),
  // Administrator's immediate erasure of excerpt bodies (ADR-0117 decision 7): scope `round` (id = round) or `attempt` (id = attempt), reason required.
  excerptDelete: z.object({ scope: z.enum(['round', 'attempt'], { errorMap: (_i, ctx) => ({ message: ctx.data === undefined ? 'required' : 'malformed' }) }), id: uuid, reason: reasonText }),
} as const;

export type QueueOp = keyof typeof QUEUE_INPUT_SCHEMAS;
export type QueueInput<Op extends QueueOp> = z.infer<(typeof QUEUE_INPUT_SCHEMAS)[Op]>;

export const QUEUE_INPUT_KEYS = {
  requestCreate: ['roundId', 'priority', 'immediate', 'engineProfileRef', 'maxAttempts'],
  requestCancel: ['id', 'reason'],
  queueSettingsUpdate: ['runWindow', 'leaseSeconds', 'immediateLimit', 'excerptRetentionDays'],
  excerptAccessSet: ['sourceOwner', 'actorId', 'allowed'],
  excerptDelete: ['scope', 'id', 'reason'],
} as const satisfies Record<QueueOp, readonly string[]>;

export const DEFAULT_MAX_ATTEMPTS = MAX_ATTEMPTS_DEFAULT;

const KNOWN = ['required', 'too_long', 'malformed'];
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

export type QueueParse<T> = { ok: true; value: T } | { ok: false; errors: FieldError[] };

export function parseQueueInput<Op extends QueueOp>(op: Op, input: Record<string, unknown>): QueueParse<QueueInput<Op>> {
  const parsed = QUEUE_INPUT_SCHEMAS[op].safeParse(input);
  return parsed.success ? { ok: true, value: parsed.data as QueueInput<Op> } : { ok: false, errors: fieldErrors(parsed.error) };
}

export function validateQueueInput(op: QueueOp, input: Record<string, unknown>): FieldError[] {
  const parsed = parseQueueInput(op, input);
  return parsed.ok ? [] : parsed.errors;
}
