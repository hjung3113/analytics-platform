// The committed `apps/platform-web/platform-systems.json`: the business systems whose spaces declare
// `feedbackTracking` (ADR-0110 decision 5). The web app test generates it from the Registry; the backend parses the
// same shape at startup and registers one Managed System per entry. One schema, two readers.

import { z } from 'zod';

/** A space id as the Registry spells it (`SpaceId` is a branded string; the file carries the plain text). */
const spaceIdSchema = z.string().trim().min(1);

export const platformSystemSchema = z
  .object({
    space_id: spaceIdSchema,
    /** The space's Korean label; becomes the Managed System name. */
    name: z.string().trim().min(1),
  })
  .strict();

export const platformSystemsFileSchema = z
  .object({
    version: z.literal(1),
    systems: z.array(platformSystemSchema),
  })
  .strict()
  .superRefine((file, ctx) => {
    const seen = new Set<string>();
    file.systems.forEach((system, index) => {
      if (seen.has(system.space_id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['systems', index, 'space_id'],
          message: 'duplicate space_id',
        });
      }
      seen.add(system.space_id);
    });
  });

export type PlatformSystem = z.infer<typeof platformSystemSchema>;
export type PlatformSystemsFile = z.infer<typeof platformSystemsFileSchema>;
