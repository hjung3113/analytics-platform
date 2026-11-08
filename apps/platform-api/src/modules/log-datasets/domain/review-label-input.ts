// Value checks of the review label action (#1480 D-d, design log-test-datasets §3.6 / §6): `reviewLabelAdd`. Pure and DB-free. What needs the
// database (the run, its item, the dataset's visibility, the rule's existence) is the handler's. A label is a human's note on a result: it
// never changes a baseline, a result or a classification.

import { z } from 'zod';

import { requiredText, uuid } from '../../../lib/input/fields.js';
import type { FieldError } from '../../menu-dispatch/types.js';
import { RULE_ID_MAX } from './baseline-input.js';

export const REVIEW_LABELS = ['false_positive', 'false_negative', 'accepted_change', 'needs_review'] as const;
export type ReviewLabel = (typeof REVIEW_LABELS)[number];
export const REVIEW_REASON_MAX = 2000;

const label = z.enum(REVIEW_LABELS, { errorMap: (_i, ctx) => ({ message: ctx.data === undefined ? 'required' : 'malformed' }) });

const schema = z.object({
  suiteRunId: uuid,
  ruleId: requiredText(RULE_ID_MAX),
  datasetRevisionId: uuid,
  label,
  reason: requiredText(REVIEW_REASON_MAX),
});

export type ReviewLabelInput = Omit<z.infer<typeof schema>, 'suiteRunId' | 'datasetRevisionId'> & { suiteRunId: string; datasetRevisionId: string };
export const REVIEW_LABEL_INPUT_KEYS = ['suiteRunId', 'ruleId', 'datasetRevisionId', 'label', 'reason'] as const;

const KNOWN = ['required', 'too_long', 'malformed'];

export function parseReviewLabelInput(input: Record<string, unknown>): { ok: true; value: ReviewLabelInput } | { ok: false; errors: FieldError[] } {
  const parsed = schema.safeParse(input);
  if (parsed.success) {
    const v = parsed.data;
    return { ok: true, value: { ...v, suiteRunId: v.suiteRunId.toLowerCase(), datasetRevisionId: v.datasetRevisionId.toLowerCase() } };
  }
  const seen = new Set<string>();
  const errors: FieldError[] = [];
  for (const issue of parsed.error.issues) {
    const path = issue.path.map(String);
    const key = path.join('.');
    if (seen.has(key)) continue;
    seen.add(key);
    errors.push({ path, code: KNOWN.includes(issue.message) ? issue.message : 'required' });
  }
  return { ok: false, errors };
}

export function validateReviewLabelInput(input: Record<string, unknown>): FieldError[] {
  const parsed = parseReviewLabelInput(input);
  return parsed.ok ? [] : parsed.errors;
}
