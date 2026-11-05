import { z } from 'zod';

// `GET /vocs/create-targets` (#1358, ADR-0113): for every live Managed System, whether the signed-in actor may file a VOC
// there. A pre-check for the submit form only; `POST /vocs` decides again and answers 403 `permission.denied`.
// `reason` appears on a closed target and is always `restricted` (an explicit deny is not told apart on the wire).
export const vocCreateTargetSchema = z
  .object({
    managed_system_id: z.string().uuid(),
    allowed: z.boolean(),
    reason: z.literal('restricted').optional(),
  })
  .strict();

export const vocCreateTargetsSchema = z.object({ items: z.array(vocCreateTargetSchema) }).strict();

export type VocCreateTarget = z.infer<typeof vocCreateTargetSchema>;
export type VocCreateTargets = z.infer<typeof vocCreateTargetsSchema>;
