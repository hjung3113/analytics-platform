// Actor role change audit detail schema (#1266 b2).
// `actor_role_changed` records an operator-run role change of one Actor
// (the `set-actor-role` CLI). Imported by audit-events.ts to register into
// AUDIT_EVENT_DETAIL_SCHEMAS. Ids and roles only: no email or display name.

import { z } from 'zod';

export const ACTOR_ROLE_AUDIT_EVENT_TYPES = ['actor_role_changed'] as const;

const actorRoleLevelSchema = z.enum(['admin', 'developer', 'user']);

export const actorRoleChangedDetailSchema = z
  .object({
    before_role: actorRoleLevelSchema,
    after_role: actorRoleLevelSchema,
    reason: z.string().min(1).max(500).optional(),
  })
  .strict()
  .refine((d) => d.before_role !== d.after_role, {
    message: 'before_role and after_role must differ',
  });
export type ActorRoleChangedDetail = z.infer<typeof actorRoleChangedDetailSchema>;

export const ACTOR_ROLE_AUDIT_EVENT_DETAIL_SCHEMAS = {
  actor_role_changed: actorRoleChangedDetailSchema,
} as const satisfies Record<(typeof ACTOR_ROLE_AUDIT_EVENT_TYPES)[number], z.ZodTypeAny>;
