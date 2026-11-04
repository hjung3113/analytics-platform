// Value checks and normalisation of the improvement item write actions (#1328 b, design
// docs/design/features/improvement-items.md §1/§3). Pure and DB-free: one zod schema per action, shared by the
// engine's `validate`, the handler (which parses again for the typed value) and the tests. What needs the row or the
// database (status pairs, cumulative rules against the stored item, the assignee, the Q2 last-target rule) is the
// handler's. Codes: `required`, `too_long`, `malformed`, `too_many`, `duplicate`, `not_applicable`.
// An optional key that is ABSENT leaves the field alone; `null` (or a blank text) clears it.

import { z } from 'zod';

import type { FieldError } from '../../menu-dispatch/types.js';
import { unsafeText } from '../../platform-port/text-safety.js';
import { TARGET_KINDS } from './item-filters.js';

export const PROBLEM_MAX = 500;
export const LONG_TEXT_MAX = 2000;
export const SHORT_TEXT_MAX = 200;
export const TARGETS_MAX = 50;
export const ORIGIN_CONTEXT_MAX_BYTES = 8 * 1024;
export const EFFECT_RESULTS = ['effective', 'ineffective', 'inconclusive'] as const;
/** Same shape as the 0093 `improvement_item_effect_compare_link_check`: one leading slash, then neither `/` nor `\`. */
export const COMPARE_LINK = /^\/[^/\\]/;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const length = (value: string): number => [...value].length;
const REQUIRED = { required_error: 'required', invalid_type_error: 'malformed' };

const uuid = z.string(REQUIRED).refine((v) => UUID.test(v), { message: 'malformed' });

const bounded = (max: number) =>
  z.string(REQUIRED).superRefine((value, ctx) => {
    if (unsafeText(value)) ctx.addIssue({ code: 'custom', message: 'malformed' });
    else if (length(value) > max) ctx.addIssue({ code: 'custom', message: 'too_long' });
  });

/** A required, non-blank text. */
const requiredText = (max: number) =>
  bounded(max)
    .refine((v) => v.trim() !== '', { message: 'required' })
    .transform((v) => v.trim());

/** Optional text: absent → undefined (untouched); null or blank → null (cleared). */
const clearableText = (max: number) =>
  bounded(max)
    .nullable()
    .optional()
    .transform((v) => (v === undefined ? undefined : v === null || v.trim() === '' ? null : v.trim()));

function isCalendarDay(value: string): boolean {
  const m = DAY.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}
const day = z.string(REQUIRED).refine(isCalendarDay, { message: 'malformed' });
const clearableDay = day.nullable().optional();

const originSchema = z
  .object({
    menuId: requiredText(SHORT_TEXT_MAX),
    context: z.record(z.unknown(), REQUIRED).refine((v) => new TextEncoder().encode(JSON.stringify(v)).length <= ORIGIN_CONTEXT_MAX_BYTES, {
      message: 'too_long',
    }),
  })
  .strict({ message: 'malformed' });
export type OriginInput = z.infer<typeof originSchema>;

const targetSchema = z
  .object({
    kind: z.enum(TARGET_KINDS, { errorMap: (_i, ctx) => ({ message: ctx.data === undefined ? 'required' : 'malformed' }) }),
    externalKey: requiredText(SHORT_TEXT_MAX),
    displayName: bounded(SHORT_TEXT_MAX).transform((v) => v.trim()),
  })
  .strict({ message: 'malformed' });
export type TargetInput = z.infer<typeof targetSchema>;

const targetsSchema = z.array(targetSchema, REQUIRED).max(TARGETS_MAX, { message: 'too_many' });

const effectSchema = z
  .object({
    result: z.enum(EFFECT_RESULTS, { errorMap: (_i, ctx) => ({ message: ctx.data === undefined ? 'required' : 'malformed' }) }),
    note: clearableText(LONG_TEXT_MAX),
    compareLink: bounded(LONG_TEXT_MAX)
      .nullable()
      .optional()
      .transform((v) => (v === undefined || v === null || v.trim() === '' ? null : v.trim()))
      .refine((v) => v === null || COMPARE_LINK.test(v), { message: 'malformed' }),
  })
  .strict({ message: 'malformed' })
  .transform((v) => ({ result: v.result, note: v.note ?? null, compareLink: v.compareLink }));
export type EffectInput = z.infer<typeof effectSchema>;

const questPair = (v: { questId?: string | null | undefined; questTitle?: string | null | undefined }, ctx: z.RefinementCtx) => {
  const hasId = v.questId !== undefined && v.questId !== null;
  const hasTitle = v.questTitle !== undefined && v.questTitle !== null;
  if (hasId !== hasTitle) ctx.addIssue({ code: 'custom', path: [hasId ? 'questTitle' : 'questId'], message: 'required' });
};

/** `(kind, externalKey)` twice in one `targets[]`: the index of the second one (the unique index would refuse it). */
function duplicateTargets(targets: readonly TargetInput[], ctx: z.RefinementCtx) {
  const seen = new Set<string>();
  targets.forEach((t, i) => {
    const key = `${t.kind}\u0000${t.externalKey}`;
    if (seen.has(key)) ctx.addIssue({ code: 'custom', path: ['targets', i], message: 'duplicate' });
    seen.add(key);
  });
}

const questId = requiredText(SHORT_TEXT_MAX);
const questTitle = requiredText(SHORT_TEXT_MAX);

export const ITEM_INPUT_SCHEMAS = {
  itemCreate: z
    .object({
      problem: requiredText(PROBLEM_MAX),
      action: clearableText(LONG_TEXT_MAX),
      actionDate: clearableDay,
      assigneeId: uuid.nullable().optional(),
      questId: questId.nullable().optional(),
      questTitle: questTitle.nullable().optional(),
      origin: originSchema.nullable().optional(),
      targets: targetsSchema.optional(),
    })
    .superRefine((v, ctx) => {
      questPair(v, ctx);
      duplicateTargets(v.targets ?? [], ctx);
    }),
  itemUpdate: z
    .object({
      itemId: uuid,
      problem: requiredText(PROBLEM_MAX).optional(),
      action: clearableText(LONG_TEXT_MAX),
      actionDate: clearableDay,
      origin: originSchema.nullable().optional(),
      targets: targetsSchema.optional(),
    })
    .superRefine((v, ctx) => duplicateTargets(v.targets ?? [], ctx)),
  itemSetStatus: z
    .object({
      itemId: uuid,
      status: z.enum(['in_progress', 'done', 'verified', 'dropped', 'open'], {
        errorMap: (_i, ctx) => ({ message: ctx.data === undefined ? 'required' : 'malformed' }),
      }),
      action: clearableText(LONG_TEXT_MAX),
      actionDate: clearableDay,
      effect: effectSchema.optional(),
      reason: requiredText(LONG_TEXT_MAX).optional(),
    })
    .strict({ message: 'malformed' }),
  itemReopen: z.object({ itemId: uuid, reason: requiredText(LONG_TEXT_MAX) }),
  itemAssign: z.object({ itemId: uuid, assigneeId: uuid.nullable() }),
  itemLinkQuest: z
    .object({ itemId: uuid, questId: questId.nullable(), questTitle: questTitle.nullable() })
    .superRefine(questPair),
} as const;

export type ItemOp = keyof typeof ITEM_INPUT_SCHEMAS;
export type ItemInput<Op extends ItemOp> = z.infer<(typeof ITEM_INPUT_SCHEMAS)[Op]>;

export const ITEM_INPUT_KEYS = {
  itemCreate: ['problem', 'action', 'actionDate', 'assigneeId', 'questId', 'questTitle', 'origin', 'targets'],
  itemUpdate: ['itemId', 'problem', 'action', 'actionDate', 'origin', 'targets'],
  itemSetStatus: ['itemId', 'status', 'action', 'actionDate', 'effect', 'reason'],
  itemReopen: ['itemId', 'reason'],
  itemAssign: ['itemId', 'assigneeId'],
  itemLinkQuest: ['itemId', 'questId', 'questTitle'],
} as const satisfies Record<ItemOp, readonly string[]>;

const KNOWN = ['required', 'too_long', 'malformed', 'too_many', 'duplicate'];
function fieldErrors(error: z.ZodError): FieldError[] {
  const seen = new Set<string>();
  const out: FieldError[] = [];
  for (const issue of error.issues) {
    const path = issue.path.map(String);
    const key = path.join('.');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      path,
      code: KNOWN.includes(issue.message) ? issue.message : issue.code === 'unrecognized_keys' ? 'malformed' : 'required',
    });
  }
  return out;
}

export function parseItemInput<Op extends ItemOp>(
  op: Op,
  input: Record<string, unknown>,
): { ok: true; value: ItemInput<Op> } | { ok: false; errors: FieldError[] } {
  const parsed = ITEM_INPUT_SCHEMAS[op].safeParse(input);
  return parsed.success ? { ok: true, value: parsed.data as ItemInput<Op> } : { ok: false, errors: fieldErrors(parsed.error) };
}

export function validateItemInput(op: ItemOp, input: Record<string, unknown>): FieldError[] {
  const parsed = parseItemInput(op, input);
  return parsed.ok ? [] : parsed.errors;
}
