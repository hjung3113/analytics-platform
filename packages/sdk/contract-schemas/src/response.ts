import { z } from 'zod/v4';
import { ASSESSMENT_KINDS, ASSESSMENT_REASONS, ASSESSMENT_STATES, OUTCOME_VALUES } from './vocab.ts';

/** A real point in time (offset ISO, 06 §6.3 — never the wall-clock form of `from`/`to`). */
const instant = z.string().datetime({ offset: true });

export const outcomeSchema = z.enum(OUTCOME_VALUES);
export const assessmentKindSchema = z.enum(ASSESSMENT_KINDS);

export const assessmentSchema = z.object({
  kind: assessmentKindSchema,
  state: z.enum(ASSESSMENT_STATES),
  statusSource: z.string().optional(),
  observedAt: instant.optional(),
  reason: z.enum(ASSESSMENT_REASONS).optional(),
  explainsEmpty: z.boolean().optional(),
  detail: z.string().optional(),
});

/** Present ⇒ non-empty, distinct, non-empty strings; unknown is the field's absence, never `[]` (06 §18). */
const sourceLogicVersions = z
  .array(z.string().min(1))
  .min(1)
  .refine((versions) => new Set(versions).size === versions.length, { message: 'sourceLogicVersions must be distinct' })
  .meta({ uniqueItems: true });

export const trustSchema = z.object({
  updatedAt: instant,
  dataThrough: instant.nullable(),
  coverage: z.number().nullable(),
  metricVersion: z.string().optional(),
  sourceLogicVersions: sourceLogicVersions.optional(),
  provisional: z.boolean(),
  source: z.string(),
});

export const apiResponseSchema = <T extends z.ZodType>(dataSchema: T) =>
  z.object({
    outcome: outcomeSchema,
    data: dataSchema.nullable(),
    assessments: z.array(assessmentSchema),
    trust: trustSchema.nullable(),
    correlationId: z.string(),
    message: z.string().optional(),
  });
