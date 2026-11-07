// Log lifecycle audit detail schemas (#1444 c, design docs/design/features/log-lifecycle/README.md §4). Non-sensitive
// and body-free: ids, stage names, counts and the names of the fields a write changed — never a reason, a file location
// or a hash, which live in `log_lifecycle.development_event` / `validation_round` (read through their endpoints).
// Registered into AUDIT_EVENT_DETAIL_SCHEMAS by audit-events.ts.

import { z } from 'zod';

export const LOG_LIFECYCLE_AUDIT_EVENT_TYPES = [
  'lifecycle.project.created',
  'lifecycle.project.updated',
  'lifecycle.project.stage_changed',
  'lifecycle.project.cancelled',
  'lifecycle.project.reopened',
  'lifecycle.round.opened',
  'lifecycle.round.closed',
] as const;

/** Subject id of the project events is the project id; of the round events the round id. */
export const LOG_LIFECYCLE_SUBJECT_TYPES = ['development_project', 'validation_round'] as const;

const STAGE = z.enum(['registered', 'kickoff', 'alpha', 'beta', 'completed', 'cancelled']);
const OPEN_STAGE = z.enum(['registered', 'kickoff', 'alpha', 'beta']);

export const lifecycleProjectCreatedDetailSchema = z
  .object({
    modelId: z.string().uuid(),
    softwareId: z.string().uuid().nullable(),
    kind: z.enum(['new', 'redevelopment']),
    ownerActorId: z.string().uuid(),
  })
  .strict();

export const lifecycleProjectUpdatedDetailSchema = z
  .object({
    /** Names of the fields the call changed (`ownerActorId`, `targetDate`, `softwareId`). */
    changed: z.array(z.string()).min(1),
  })
  .strict();

const stageMove = { from: STAGE, to: STAGE };
export const lifecycleProjectStageChangedDetailSchema = z.object(stageMove).strict();
export const lifecycleProjectCancelledDetailSchema = z.object({ from: OPEN_STAGE }).strict();
export const lifecycleProjectReopenedDetailSchema = z.object(stageMove).strict();

export const lifecycleRoundOpenedDetailSchema = z
  .object({
    projectId: z.string().uuid(),
    seq: z.number().int().min(1),
    stage: OPEN_STAGE,
    fileCount: z.number().int().min(1),
    pinned: z.boolean(),
  })
  .strict();

export const lifecycleRoundClosedDetailSchema = z
  .object({ projectId: z.string().uuid(), seq: z.number().int().min(1) })
  .strict();

export const LOG_LIFECYCLE_AUDIT_EVENT_DETAIL_SCHEMAS = {
  'lifecycle.project.created': lifecycleProjectCreatedDetailSchema,
  'lifecycle.project.updated': lifecycleProjectUpdatedDetailSchema,
  'lifecycle.project.stage_changed': lifecycleProjectStageChangedDetailSchema,
  'lifecycle.project.cancelled': lifecycleProjectCancelledDetailSchema,
  'lifecycle.project.reopened': lifecycleProjectReopenedDetailSchema,
  'lifecycle.round.opened': lifecycleRoundOpenedDetailSchema,
  'lifecycle.round.closed': lifecycleRoundClosedDetailSchema,
} as const satisfies Record<(typeof LOG_LIFECYCLE_AUDIT_EVENT_TYPES)[number], z.ZodTypeAny>;
