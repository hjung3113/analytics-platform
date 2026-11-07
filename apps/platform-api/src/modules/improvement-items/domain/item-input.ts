// Value checks and normalisation of the improvement item write actions (#1328 b, design
// docs/design/features/improvement-items.md §1/§3). Pure and DB-free: one zod schema per action, shared by the
// engine's `validate`, the handler (which parses again for the typed value) and the tests. What needs the row or the
// database (status pairs, cumulative rules against the stored item, the assignee, the Q2 last-target rule) is the
// handler's. Codes: `required` (a missing value or a wrong type, #1411), `too_long`, `malformed`, `too_many`,
// `duplicate`, `not_applicable`. An optional key that is ABSENT leaves the field alone; `null` (or a blank text) clears it.

import { z } from 'zod';

import { bounded, clearableText, requiredText, uuid } from '../../../lib/input/fields.js';
import type { FieldError } from '../../menu-dispatch/types.js';
import { unsafeText } from '../../../lib/text-safety.js';
import { TARGET_KINDS } from './item-filters.js';

export const PROBLEM_MAX = 500;
export const LONG_TEXT_MAX = 2000;
export const SHORT_TEXT_MAX = 200;
export const TARGETS_MAX = 50;
export const ORIGIN_CONTEXT_MAX_BYTES = 8 * 1024;
export const EFFECT_RESULTS = ['effective', 'ineffective', 'inconclusive'] as const;
/** Backend mirror of `isAppRelativePath` (`@ap/contracts` `src/links/url.ts`; exported so the unit test can pin the
 * mirror to the SDK original): an app-relative, same-origin path. The SDK stays test-only for the backend
 * (ADR-0073, boundary rule 11), so the rule is mirrored here. A browser URL parser strips TAB, CR and LF, so
 * without the control-character check `"/\t/evil.example/x"` would normalise into the protocol-relative
 * `//evil.example/x`. Stricter than the merged 0093 CHECK `improvement_item_effect_compare_link_check`, which keeps
 * its looser `^/[^/\\]` shape as the DB backstop; tightening it needs a new migration and is a recorded follow-up. */
export const appRelativePath = (value: string): boolean => {
  if (!value.startsWith('/') || value.startsWith('//')) return false;
  if (value.includes('#') || value.includes('\\') || value.includes('//')) return false;
  if (
    // eslint-disable-next-line no-control-regex -- the guard rejects C0 controls and DEL on purpose (URL parsers strip them)
    /[\u0000-\u001F\u007F]/.test(value)
  ) {
    return false;
  }
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return false;
  }
  if (!decoded.startsWith('/') || decoded.startsWith('//')) return false;
  if (decoded.includes('#') || decoded.includes('\\') || decoded.includes('//')) return false;
  if (
    // eslint-disable-next-line no-control-regex -- same check after percent-decoding, e.g. "/%0A" decodes to LF
    /[\u0000-\u001F\u007F]/.test(decoded)
  ) {
    return false;
  }
  const path = decoded.split('?')[0] ?? '';
  return !path.includes(':');
};

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
function isCalendarDay(value: string): boolean {
  const m = DAY.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}
/** Calendar days, arrays and records keep their pre-kit wrong-type code (`malformed`); only uuid/text fields answer `required` (#1411). */
const NON_TEXT = { required_error: 'required', invalid_type_error: 'malformed' } as const;
const day = z.string(NON_TEXT).refine(isCalendarDay, { message: 'malformed' });
const clearableDay = day.nullable().optional();

/** The `origin.context` snapshot is flat data: the context object itself is level 1, and an array or object found
 * nested deeper than this level is refused as `origin.context:malformed`. JSONB carries deeper trees, but a cap
 * keeps the 8 KiB size cap meaningful and the analysis snapshot surveyable. */
export const ORIGIN_CONTEXT_MAX_DEPTH = 8;

/** Every string in `origin.context` — object keys and values, at any depth — must pass the same `unsafeText` rule as
 * the other texts: PostgreSQL JSONB refuses NUL and lone UTF-16 surrogates exactly like `text` does, and the write
 * would otherwise fail inside the transaction (22P05) and surface as an HTTP 500 instead of a field error. */
const safeJson = (node: unknown, depth: number): boolean => {
  if (depth > ORIGIN_CONTEXT_MAX_DEPTH) return false;
  if (node === null || typeof node === 'number' || typeof node === 'boolean') return true;
  if (typeof node === 'string') return !unsafeText(node);
  if (Array.isArray(node)) return node.every((child) => safeJson(child, depth + 1));
  if (typeof node === 'object') return Object.entries(node).every(([key, child]) => !unsafeText(key) && safeJson(child, depth + 1));
  return false;
};

const originSchema = z
  .object({
    menuId: requiredText(SHORT_TEXT_MAX),
    context: z.record(z.unknown(), NON_TEXT).superRefine((v, ctx) => {
      if (new TextEncoder().encode(JSON.stringify(v)).length > ORIGIN_CONTEXT_MAX_BYTES) {
        ctx.addIssue({ code: 'custom', message: 'too_long' });
        return;
      }
      if (!safeJson(v, 1)) ctx.addIssue({ code: 'custom', message: 'malformed' });
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

const targetsSchema = z.array(targetSchema, NON_TEXT).max(TARGETS_MAX, { message: 'too_many' });

const effectSchema = z
  .object({
    result: z.enum(EFFECT_RESULTS, { errorMap: (_i, ctx) => ({ message: ctx.data === undefined ? 'required' : 'malformed' }) }),
    note: clearableText(LONG_TEXT_MAX),
    compareLink: bounded(LONG_TEXT_MAX)
      .nullable()
      .optional()
      .transform((v) => (v === undefined || v === null || v.trim() === '' ? null : v.trim()))
      .refine((v) => v === null || appRelativePath(v), { message: 'malformed' }),
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
