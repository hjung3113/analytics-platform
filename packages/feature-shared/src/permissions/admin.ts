import { z } from 'zod';
import { permissionScopeFields } from './scope-kinds.js';

import {
  CAPABILITIES,
  DECLARED_CAPABILITY_DISPLAY_NAME_MAX,
  type CapabilityName,
  isCapability,
  isDeclaredCapabilityId,
} from '../enums/capabilities.js';

/**
 * A capability name on the wire: a platform capability or a name under the declared prefix (ADR-0157). Whether the server
 * declares it is the server's judgment; this schema only keeps the grammar. A refusal keeps the closed enum's issue code.
 */
export const capabilityNameSchema = z.string().superRefine((value, ctx): value is CapabilityName => {
  if (isCapability(value) || isDeclaredCapabilityId(value)) return true;
  ctx.addIssue({ code: z.ZodIssueCode.invalid_enum_value, options: [...CAPABILITIES], received: value });
  return false;
});

export const permissionGrantAdminItemSchema = z
  .object({
    id: z.string().uuid(),
    actor_id: z.string().uuid(),
    capability: z.string().min(1),
    managed_system_id: z.string().uuid().nullable(),
    ...permissionScopeFields,
    in_catalog: z.boolean().optional(),
    // ADR-0157 decision 7: present on a declared-prefix row; false when the server's bundle no longer declares it.
    in_declarations: z.boolean().optional(),
    granted_by_actor_id: z.string().uuid(),
    granted_at: z.string().datetime(),
    expires_at: z.string().datetime().nullable(),
  })
  .strict();
export type PermissionGrantAdminItem = z.infer<typeof permissionGrantAdminItemSchema>;

export const permissionDenyAdminItemSchema = z
  .object({
    id: z.string().uuid(),
    actor_id: z.string().uuid(),
    capability: z.string().min(1),
    managed_system_id: z.string().uuid().nullable(),
    reason: z.string().min(1),
    in_declarations: z.boolean().optional(),
    created_by_actor_id: z.string().uuid(),
    created_at: z.string().datetime(),
  })
  .strict();
export type PermissionDenyAdminItem = z.infer<typeof permissionDenyAdminItemSchema>;

export const listPermissionGrantsResponseSchema = z
  .object({ items: z.array(permissionGrantAdminItemSchema) })
  .strict();
export type ListPermissionGrantsResponse = z.infer<typeof listPermissionGrantsResponseSchema>;

export const listPermissionDeniesResponseSchema = z
  .object({ items: z.array(permissionDenyAdminItemSchema) })
  .strict();
export type ListPermissionDeniesResponse = z.infer<typeof listPermissionDeniesResponseSchema>;

export const directPermissionGrantSchema = z
  .object({
    actor_id: z.string().uuid(),
    capability: capabilityNameSchema,
    managed_system_id: z.string().uuid().optional(),
    expires_at: z.string().datetime().optional(),
    reason: z.string().trim().min(1).max(2000),
    ...permissionScopeFields,
    self_approval: z
      .object({
        policy_citation: z.string().trim().min(1),
        peer_reviewer_absence: z.string().trim().min(1),
      })
      .strict()
      .optional(),
  })
  .strict();
export type DirectPermissionGrant = z.infer<typeof directPermissionGrantSchema>;

export const permissionGrantPreflightSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('available') }).strict(),
  z
    .object({
      state: z.literal('request_review'),
      request_id: z.string().uuid(),
      review_route: z.string().min(1),
    })
    .strict(),
  z
    .object({
      state: z.literal('deny_lift'),
      deny_ids: z.array(z.string().uuid()).min(1),
      lift_route: z.string().min(1),
    })
    .strict(),
]);
export type PermissionGrantPreflight = z.infer<typeof permissionGrantPreflightSchema>;

export const permissionGrantPrerequisiteSchema = z
  .object({
    capability: z.literal('voc.read'),
    managed_system_id: z.string().uuid().nullable(),
    state: z.enum(['held', 'missing', 'denied']),
  })
  .strict();
export type PermissionGrantPrerequisite = z.infer<typeof permissionGrantPrerequisiteSchema>;

export const permissionGrantOptionsSchema = z
  .object({
    recipient: z
      .object({
        id: z.string().uuid(),
        display_name: z.string(),
        role_level: z.enum(['admin', 'developer', 'user']),
      })
      .strict(),
    self_policy: z.enum(['allowed', 'forbidden']),
    self_approval_required: z.boolean(),
    candidates: z.array(
      z
        .object({
          capability: capabilityNameSchema,
          managed_system_id: z.string().uuid().nullable(),
          // scope.read advertises supported kinds, never a workspace-wide grant.
          scope_kinds: z.tuple([z.literal('site'), z.literal('site_room')]).optional(),
          governance_required: z.boolean(),
          preflight: permissionGrantPreflightSchema,
          prerequisites: z.array(permissionGrantPrerequisiteSchema).min(1).optional(),
        })
        .strict(),
    ),
  })
  .strict();
export type PermissionGrantOptions = z.infer<typeof permissionGrantOptionsSchema>;

/**
 * ADR-0157 decision 9: the declared capabilities of this server, for every authenticated workspace member. Display only:
 * the server judges the reason requirement, the Role Level and tokens. `requestable` = the reader's current Role Level is
 * on the capability's allow-list. Who holds a grant is never part of this read.
 */
export const declaredCapabilityItemSchema = z
  .object({
    id: z.string().refine((value) => isDeclaredCapabilityId(value), 'not a declared capability id'),
    display_name: z.string().min(1).max(DECLARED_CAPABILITY_DISPLAY_NAME_MAX),
    sensitive: z.boolean(),
    requestable: z.boolean(),
  })
  .strict();
export type DeclaredCapabilityItem = z.infer<typeof declaredCapabilityItemSchema>;

export const listDeclaredCapabilitiesResponseSchema = z
  .object({ items: z.array(declaredCapabilityItemSchema) })
  .strict();
export type ListDeclaredCapabilitiesResponse = z.infer<typeof listDeclaredCapabilitiesResponseSchema>;
