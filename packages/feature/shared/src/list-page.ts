import { z } from 'zod';

export const listPageSchema = z
  .object({
    has_more: z.boolean(),
    cursor: z.string().optional(),
    total: z.number().int().nonnegative().optional(),
  })
  .strict();
export type ListPage = z.infer<typeof listPageSchema>;

/** Shared `limit` query parameter of the paged list endpoints: absent means 50, never more than 100. */
export const LIST_DEFAULT_LIMIT = 50;
export const LIST_MAX_LIMIT = 100;
export const listLimitSchema = z.coerce
  .number()
  .int()
  .min(1)
  .max(LIST_MAX_LIMIT)
  .default(LIST_DEFAULT_LIMIT);
