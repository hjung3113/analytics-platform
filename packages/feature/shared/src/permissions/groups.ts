import { z } from 'zod';

import { capabilityNameSchema, PERMISSION_BATCH_MAX_ITEMS } from './admin.js';

/**
 * Permission groups (ADR-0163, #2408): a named capability set with no system or Site scope. Requests and grants made from
 * a group stay per-capability rows; `permission_group_id` on them is the origin only. Contract:
 * docs/architecture/platform-api/api/permissions.md §Permission groups.
 */
export const PERMISSION_GROUP_KINDS = ['operator', 'personal'] as const;
export type PermissionGroupKind = (typeof PERMISSION_GROUP_KINDS)[number];

export const PERMISSION_GROUP_NAME_MAX = 80;
export const PERMISSION_GROUP_DESCRIPTION_MAX = 500;
export const PERMISSION_GROUP_SHARE_MAX = 50;

const actorRefSchema = z.object({ actor_id: z.string().uuid(), display_name: z.string() }).strict();

export const permissionGroupItemSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().min(1).max(PERMISSION_GROUP_NAME_MAX),
    description: z.string().max(PERMISSION_GROUP_DESCRIPTION_MAX).nullable(),
    kind: z.enum(PERMISSION_GROUP_KINDS),
    owner: actorRefSchema,
    capabilities: z.array(z.string().min(1)).min(1).max(PERMISSION_BATCH_MAX_ITEMS),
    shared_with: z.array(actorRefSchema),
    grant_count: z.number().int().nonnegative().nullable(),
    can_edit: z.boolean(),
    updated_at: z.string().datetime(),
  })
  .strict();
export type PermissionGroupItem = z.infer<typeof permissionGroupItemSchema>;

export const listPermissionGroupsQuerySchema = z
  .object({ kind: z.enum(PERMISSION_GROUP_KINDS).optional(), scope: z.literal('all').optional() })
  .strict();
export type ListPermissionGroupsQuery = z.infer<typeof listPermissionGroupsQuerySchema>;

export const listPermissionGroupsResponseSchema = z.object({ items: z.array(permissionGroupItemSchema) }).strict();
export type ListPermissionGroupsResponse = z.infer<typeof listPermissionGroupsResponseSchema>;

const groupName = z.string().trim().min(1).max(PERMISSION_GROUP_NAME_MAX);
const groupDescription = z.string().trim().max(PERMISSION_GROUP_DESCRIPTION_MAX);
const groupCapabilities = z.array(capabilityNameSchema).min(1).max(PERMISSION_BATCH_MAX_ITEMS);

export const createPermissionGroupSchema = z
  .object({
    name: groupName,
    description: groupDescription.optional(),
    kind: z.enum(PERMISSION_GROUP_KINDS),
    capabilities: groupCapabilities,
  })
  .strict();
export type CreatePermissionGroup = z.infer<typeof createPermissionGroupSchema>;

export const updatePermissionGroupSchema = z
  .object({
    expected_updated_at: z.string().datetime(),
    name: groupName.optional(),
    description: groupDescription.nullable().optional(),
    capabilities: groupCapabilities.optional(),
  })
  .strict();
export type UpdatePermissionGroup = z.infer<typeof updatePermissionGroupSchema>;

export const archivePermissionGroupSchema = z.object({ expected_updated_at: z.string().datetime() }).strict();
export type ArchivePermissionGroup = z.infer<typeof archivePermissionGroupSchema>;

export const archivePermissionGroupResultSchema = z
  .object({ id: z.string().uuid(), archived_at: z.string().datetime() })
  .strict();
export type ArchivePermissionGroupResult = z.infer<typeof archivePermissionGroupResultSchema>;

export const sharePermissionGroupSchema = z
  .object({ actor_ids: z.array(z.string().uuid()).max(PERMISSION_GROUP_SHARE_MAX) })
  .strict();
export type SharePermissionGroup = z.infer<typeof sharePermissionGroupSchema>;

/** Origin carried by request and grant rows made from a group; the name survives archive. */
export const permissionGroupOriginSchema = z.object({ id: z.string().uuid(), name: z.string() }).strict();
export type PermissionGroupOrigin = z.infer<typeof permissionGroupOriginSchema>;

const revisionsSchema = z.record(z.string().uuid(), z.number().int().positive());

/** POST /permissions/requests/batch/:batch_id/decide — one decision over every decidable row of a batch request. */
export const decidePermissionRequestBatchSchema = z
  .object({
    action: z.enum(['approve', 'reject', 'need-more-info']),
    expected_revisions: revisionsSchema,
    approve_ids: z.array(z.string().uuid()).min(1).max(PERMISSION_BATCH_MAX_ITEMS).optional(),
    reason: z.string().max(2000).optional(),
    granted_managed_system_id: z.string().uuid().nullable().optional(),
    expiration: z.string().datetime().nullable().optional(),
    self_approval: z
      .object({ policy_citation: z.string().min(1), peer_reviewer_absence: z.string().min(1) })
      .strict()
      .optional(),
  })
  .strict();
export type DecidePermissionRequestBatch = z.infer<typeof decidePermissionRequestBatchSchema>;

export const decidePermissionRequestBatchResultSchema = z
  .object({
    batch_id: z.string().uuid(),
    items: z
      .array(
        z
          .object({
            id: z.string().uuid(),
            status: z.enum(['approved', 'rejected', 'needs_more_info']),
            grant_id: z.string().uuid().optional(),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();
export type DecidePermissionRequestBatchResult = z.infer<typeof decidePermissionRequestBatchResultSchema>;

/** POST /permission-requests/batch/:batch_id/submit-more-info — the requester answers once for the whole batch. */
export const submitMoreInfoPermissionRequestBatchSchema = z
  .object({ note: z.string().max(2000), expected_revisions: revisionsSchema })
  .strict();
export type SubmitMoreInfoPermissionRequestBatch = z.infer<typeof submitMoreInfoPermissionRequestBatchSchema>;

export const submitMoreInfoPermissionRequestBatchResultSchema = z.object({
  batch_id: z.string().uuid(),
  items: z.array(z.object({
    id: z.string().uuid(), status: z.literal('pending'), revision: z.number().int().positive(),
  }).strict()).min(1),
}).strict();
export type SubmitMoreInfoPermissionRequestBatchResult = z.infer<typeof submitMoreInfoPermissionRequestBatchResultSchema>;
