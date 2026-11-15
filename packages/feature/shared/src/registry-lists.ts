import { z } from 'zod';

// Envelopes of `GET /managed-systems` and `GET /analytics-areas`. The rows are passed through whole: the pickers and
// admin screens read their own columns, and pinning every column here would reject the partial rows many screens
// already build (some omit `total`, as the old unparsed read allowed). Readers rely on `items` being objects with an `id`.
const registryRowSchema = z.object({ id: z.string() }).passthrough();

export const managedSystemListSchema = z.object({
  items: z.array(registryRowSchema),
  total: z.number().optional(),
});

export const analyticsAreaListSchema = z.object({
  items: z.array(registryRowSchema),
  total: z.number().optional(),
});

// `GET /managed-systems/space-links` (#1289 node j, ADR-0110 decision 5): which business-system space each registry-owned
// Managed System was registered for, plus the workspace's 「플랫폼」 system. Navigation and default-selection metadata only:
// the link never grants permission (platform ADR-0068 decision 1). Strict, so a changed server shape fails the read loudly.
export const spaceLinkSchema = z
  .object({
    space_id: z.string().min(1),
    managed_system_id: z.string().uuid(),
    declared: z.boolean(),
  })
  .strict();

export const spaceLinksResponseSchema = z
  .object({
    items: z.array(spaceLinkSchema),
    platform_managed_system_id: z.string().uuid().nullable(),
  })
  .strict();

export type SpaceLink = z.infer<typeof spaceLinkSchema>;
export type SpaceLinksResponse = z.infer<typeof spaceLinksResponseSchema>;
