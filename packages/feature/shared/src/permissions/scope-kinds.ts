import { z } from 'zod';

export const permissionScopeKindSchema = z.enum(['managed_system', 'site', 'site_room']);
export const permissionScopeFields = {
  scope_kind: permissionScopeKindSchema.optional(),
  scope_site: z.string().min(1).nullable().optional(),
  scope_room: z.string().min(1).nullable().optional(),
};
export const requestedPermissionScopeFields = {
  requested_scope_kind: permissionScopeKindSchema.optional(),
  requested_scope_site: z.string().min(1).nullable().optional(),
  requested_scope_room: z.string().min(1).nullable().optional(),
};
export const grantedPermissionScopeFields = {
  granted_scope_kind: permissionScopeKindSchema.optional(),
  granted_scope_site: z.string().min(1).nullable().optional(),
  granted_scope_room: z.string().min(1).nullable().optional(),
};

/** Only this authenticated request-candidate projection discloses ungranted room names. */
export const permissionScopeCatalogCandidateSchema = z.object({
  site: z.string().min(1),
  label: z.string(),
  rooms: z.array(z.object({ room: z.string().min(1), granted: z.boolean() }).strict()),
  siteGranted: z.boolean(),
}).strict();
export type PermissionScopeCatalogCandidate = z.infer<typeof permissionScopeCatalogCandidateSchema>;
export const permissionScopeCandidatesResponseSchema = z.object({
  sites: z.array(permissionScopeCatalogCandidateSchema),
}).strict();
export const permissionGrantListQuerySchema = z.object({
  scope_kind: permissionScopeKindSchema.optional(),
  scope_site: z.string().min(1).optional(),
}).strict();
export type PermissionGrantListQuery = z.infer<typeof permissionGrantListQuerySchema>;
