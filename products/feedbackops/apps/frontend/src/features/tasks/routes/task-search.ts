// /tasks search schema — owned by the feature layer and free of the router (voc-search.ts precedent) so the route file, the views and the
// platform bridge's entry import one definition. The route file re-exports `tasksSearchSchema` and `validateTasksSearch` for existing consumers.

import { parseRouteSearch, platformReturnField, returnToField } from '@/lib/host/search-fields';
import { listTasksQuerySchema, taskStatusSchema } from '@fops/shared';
import { z } from 'zod';

export const tasksSearchSchema = z
  .object({
    returnTo: returnToField,
    platformReturn: platformReturnField,
    q: listTasksQuerySchema.shape.q,
    view: z.enum(['requests', 'backlog', 'board', 'my', 'inbox', 'milestones']).optional(),
    param: z.string().optional(),
    managedSystem: z.union([z.string().uuid(), z.literal('all')]).optional(),
    'filter.analytics_area': z.union([z.string().uuid(), z.literal('unset')]).optional(),
    status: taskStatusSchema.optional(),
    status_group: z.literal('in-flight').optional(),
    // TanStack decodes a hand-written ?overdue=true as the boolean true.
    overdue: z.preprocess((value) => (value === 'true' ? true : value), z.literal(true).optional()),
    reporter_update: z.literal('needed').optional(),
    public_update: z.literal('missing').optional(),
    reviewer: z.union([z.string().uuid(), z.literal('me')]).optional(),
    reviewerTeam: z.string().uuid().optional(),
  })
  .strict();

export type TasksSearch = z.infer<typeof tasksSearchSchema>;

export function validateTasksSearch(raw: unknown) {
  return parseRouteSearch(tasksSearchSchema, raw);
}

/**
 * Strict per-field check: whether `value` is one `key` accepts under {@link tasksSearchSchema}. `validateTasksSearch` drops a value that fails and
 * the screen then queries a default; a host that must reject instead (platform ADR-0071 decision 9) asks this before mounting.
 */
export function isTasksSearchValueValid(key: string, value: string): boolean {
  if (!Object.prototype.hasOwnProperty.call(tasksSearchSchema.shape, key)) return false;
  return tasksSearchSchema.shape[key as keyof typeof tasksSearchSchema.shape].safeParse(value)
    .success;
}
