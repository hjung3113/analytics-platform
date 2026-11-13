import { z } from 'zod';
import { parseEvidenceRefs } from './evidence-ref-intake.js';
import { looksSecret } from './result-payload.js';
import { VALIDATION_ISSUE_LIMITS as L } from '@ap/feature-shared';
import { ISSUE_STATES } from './validation-issue-states.js';

// Same normalisation as opinion-input: title is one line; prose keeps LF and TAB.
function clean(value: string, oneLine: boolean): string {
  return [...value].filter((c) => {
    const n = c.codePointAt(0) ?? 0;
    return !(n < 32 || (n >= 127 && n <= 159)) || (!oneLine && (n === 9 || n === 10));
  }).join('').trim();
}
function prose(max: number, required: boolean, oneLine = false) {
  return z.string().transform((raw, ctx) => {
    const value = clean(raw, oneLine);
    if (looksSecret(raw) || looksSecret(value)) ctx.addIssue({ code: 'custom', message: 'secret_detected' });
    if ([...value].length > max) ctx.addIssue({ code: 'custom', message: 'too_long' });
    if (required && value.length === 0) ctx.addIssue({ code: 'custom', message: 'required' });
    return value;
  });
}
const id = z.string().uuid();
const optionalBody = prose(L.body, false).nullish().transform(v => v || null);
const comment = { body: prose(L.comment, true), correctsCommentId: id.nullish().transform(v => v ?? null) };
const optionalId = id.nullish().transform(v => v ?? null);
export const VALIDATION_ISSUE_FIELDS = ['title', 'body', 'expected', 'actual', 'repro'] as const;
const evidence = z.array(z.object({ fileRef: z.string(), line: z.number(), fileSha256: z.string() }).strict())
  .min(1).max(L.evidencePerOccurrence).transform((refs, ctx) => {
    const parsed = parseEvidenceRefs(refs.map(ref => ({ ...ref, sourceResolved: true })));
    if (!parsed.ok) {
      for (const e of parsed.errors) ctx.addIssue({ code: 'custom', path: e.path.slice(1), message: e.code });
      return z.NEVER;
    }
    for (const [i, ref] of refs.entries()) {
      if (looksSecret(ref.fileRef)) ctx.addIssue({ code: 'custom', path: [i, 'fileRef'], message: 'secret_detected' });
    }
    return parsed.value.map(({ fileRef, line, fileSha256 }) => ({ fileRef, line, fileSha256 }));
  });
const schemas = {
  create: z.object({ projectId: id, firstRoundId: id, title: prose(L.title, true, true), body: prose(L.body, true), expected: optionalBody, actual: optionalBody, repro: optionalBody }).strict(),
  linkOccurrence: z.object({ issueId: id, roundId: id, attemptId: id.nullish().transform(v => v ?? null), ruleResultId: id.nullish().transform(v => v ?? null) }).strict()
    .refine(v => !v.ruleResultId || !!v.attemptId, { path: ['attemptId'], message: 'required' }),
  linkEvidence: z.object({ occurrenceId: id, refs: evidence }).strict(),
  commentIssue: z.object({ issueId: id, ...comment }).strict(),
  commentRound: z.object({ roundId: id, ...comment }).strict(),
  correctField: z.object({ issueId: id, field: z.enum(VALIDATION_ISSUE_FIELDS), body: z.string(), correctsEventId: id.nullish().transform(v => v ?? null) }).strict()
    .transform((v, ctx) => {
      const parsed = prose(v.field === 'title' ? L.title : L.body, v.field === 'title' || v.field === 'body', v.field === 'title').safeParse(v.body);
      if (!parsed.success) {
        for (const issue of parsed.error.issues) ctx.addIssue({ ...issue, path: ['body'] });
        return z.NEVER;
      }
      return { ...v, body: parsed.data };
    }),
  // #1808 H3: legality and required inputs are judged against the current state by the service (domain/validation-issue-states.ts).
  changeState: z.object({
    issueId: id, toState: z.enum(ISSUE_STATES),
    reason: prose(L.comment, false).nullish().transform(v => v || null),
    assigneeActorId: optionalId, basisCommentId: optionalId, occurrenceId: optionalId, duplicateOfIssueId: optionalId,
  }).strict(),
};
export type ValidationIssueAction = keyof typeof schemas;
export type ValidationIssueInput<A extends ValidationIssueAction> = z.output<(typeof schemas)[A]>;
export function parseValidationIssueInput<A extends ValidationIssueAction>(action: A, raw: unknown): z.SafeParseReturnType<unknown, ValidationIssueInput<A>> {
  return schemas[action].safeParse(raw) as z.SafeParseReturnType<unknown, ValidationIssueInput<A>>;
}
