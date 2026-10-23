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
