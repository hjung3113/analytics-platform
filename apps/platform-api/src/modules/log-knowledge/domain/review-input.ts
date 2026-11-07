// Value checks of the knowledge draft review actions (#1198 b). Pure and DB-free. `approvedDigest` is the SHA-256 hex a
// reviewer approved (`proposalDigest`, `draft-input.ts`); `expectedItemVersion` is the target item's `row_version` a revise
// approval was judged against (whether it is required depends on the draft's type, so the handler decides `required` /
// the create-draft `malformed`; here only a present value is checked: a positive integer). The rationale is plain text
// (≤ 2000, no control character); `rejected` and `changes_requested` require it.

import { z } from 'zod';

import { bounded, requiredText, uuid } from '../../../lib/input/fields.js';
import type { FieldError } from '../../menu-dispatch/types.js';
import { fieldErrors } from './item-input.js';

export const REVIEW_RATIONALE_MAX = 2000;

export const REVIEW_INPUT_KEYS = {
  draftApprove: ['id', 'approvedDigest', 'expectedItemVersion', 'rationale'],
  draftReject: ['id', 'rationale'],
  draftRequestChanges: ['id', 'rationale'],
} as const;
export type ReviewOp = keyof typeof REVIEW_INPUT_KEYS;

const digest = z
  .string({ required_error: 'required', invalid_type_error: 'required' })
  .refine((v) => /^[0-9a-f]{64}$/.test(v), { message: 'malformed' });
const itemVersion = z
  .number({ invalid_type_error: 'malformed' })
  .refine((v) => Number.isSafeInteger(v) && v >= 1, { message: 'malformed' })
  // Absent or a positive int only: an explicit null is malformed (review C2), so a create approval cannot send it.
  .optional();
/** Optional approval note: absent, null or blank → null. */
const optionalRationale = bounded(REVIEW_RATIONALE_MAX)
  .nullish()
  .transform((v) => (v === undefined || v === null || v.trim() === '' ? null : v.trim()));

const SCHEMAS = {
  draftApprove: z.object({ id: uuid, approvedDigest: digest, expectedItemVersion: itemVersion, rationale: optionalRationale }),
  draftReject: z.object({ id: uuid, rationale: requiredText(REVIEW_RATIONALE_MAX) }),
  draftRequestChanges: z.object({ id: uuid, rationale: requiredText(REVIEW_RATIONALE_MAX) }),
} as const;

export type ReviewInput<Op extends ReviewOp> = z.infer<(typeof SCHEMAS)[Op]>;
export type ReviewParse<Op extends ReviewOp> = { ok: true; value: ReviewInput<Op> } | { ok: false; errors: FieldError[] };

export function parseReviewInput<Op extends ReviewOp>(op: Op, input: Record<string, unknown>): ReviewParse<Op> {
  const parsed = SCHEMAS[op].safeParse(input);
  return parsed.success ? { ok: true, value: parsed.data as ReviewInput<Op> } : { ok: false, errors: fieldErrors(parsed.error) };
}

export function validateReviewInput(op: ReviewOp, input: Record<string, unknown>): FieldError[] {
  const parsed = parseReviewInput(op, input);
  return parsed.ok ? [] : parsed.errors;
}

/**
 * The `expectedItemVersion` rule against the draft's type: a revise draft needs it (`required`), a create draft refuses it
 * (`malformed`: there is no item yet).
 */
export function itemVersionErrors(proposalType: string, expectedItemVersion: number | undefined): FieldError[] {
  if (proposalType === 'revise') return expectedItemVersion === undefined ? [{ path: ['expectedItemVersion'], code: 'required' }] : [];
  return expectedItemVersion === undefined ? [] : [{ path: ['expectedItemVersion'], code: 'malformed' }];
}

/**
 * How the reviewer authored the draft, from the `author_auth` of the revisions they wrote: through a `token` at all →
 * `token` (a token subject may not approve, owner answer #1198 Q1, so neither may the human behind it approve what their
 * own token wrote); only through the session → `session` (a human may approve their own draft, history marks it);
 * no revision → `none`.
 */
export type ReviewerAuthorship = 'none' | 'session' | 'token';
export function reviewerAuthorship(authorAuths: ReadonlySet<string>): ReviewerAuthorship {
  if (authorAuths.has('token')) return 'token';
  return authorAuths.has('session') ? 'session' : 'none';
}

/** The state of the item a revise approval targets (locked by the caller), judged before anything is written. */
export function reviseTargetError(
  item: { publicationState: string; rowVersion: number } | null,
  expectedItemVersion: number,
): FieldError | null {
  if (item === null) return { path: ['id'], code: 'target_missing' };
  if (item.publicationState === 'archived') return { path: ['id'], code: 'archived' };
  if (item.rowVersion !== expectedItemVersion) return { path: ['expectedItemVersion'], code: 'stale' };
  return null;
}
