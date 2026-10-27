import { z } from 'zod';

import { permissionRequestStatusSchema } from './selected-detail.js';

// GET /permission-requests/mine query. Omitted = the caller's open requests (pending, needs_more_info);
// `all` = every status, newest MINE_ALL_LIMIT rows.
export const permissionRequestsMineQuerySchema = z
  .object({ status: z.literal('all').optional() })
  .strict();
export type PermissionRequestsMineQuery = z.infer<typeof permissionRequestsMineQuerySchema>;

export const PERMISSION_REQUESTS_MINE_ALL_LIMIT = 50;

export const minePermissionRequestRowSchema = z.object({
  id: z.string().uuid(),
  requested_capability: z.string().min(1),
  requested_managed_system_id: z.string().uuid().nullable(),
  reason: z.string(),
  requested_object_type: z.string().nullable(),
  requested_object_id: z.string().uuid().nullable(),
  source_object_type: z.string().nullable(),
  source_object_id: z.string().uuid().nullable(),
  source_action_id: z.string().nullable(),
  revision: z.number().int().positive(),
  requested_expiration: z.string().datetime().nullable(),
  updated_at: z.string().datetime(),
  return_route_intent: z.string().nullable(),
  status: permissionRequestStatusSchema,
  created_at: z.string().datetime(),
});
export type MinePermissionRequestRow = z.infer<typeof minePermissionRequestRowSchema>;

export const minePermissionRequestsResponseSchema = z.object({
  requests: z.array(minePermissionRequestRowSchema),
});
export type MinePermissionRequestsResponse = z.infer<typeof minePermissionRequestsResponseSchema>;

// POST /permission-requests 201 body.
// Shape check only: callers show the id as an opaque request identifier.
export const createPermissionRequestResultSchema = z.object({
  id: z.string().min(1),
  status: z.literal('pending'),
  created_at: z.string().min(1),
});
export type CreatePermissionRequestResult = z.infer<typeof createPermissionRequestResultSchema>;
