// Feature-client parsers for the existing ADR-0116 v0 REST contract. Wire authority: contract-schemas/api-token.
import { z } from 'zod';

export const apiTokenItemSchema = z.object({
  id: z.string().uuid(), kind: z.enum(['personal', 'service']), name: z.string().min(1).max(100),
  prefix: z.string().regex(/^[0-9a-f]{8}$/), scopes: z.array(z.string().min(1).max(100)).max(64),
  expiresAt: z.string().datetime({ offset: true }).nullable(),
  lastUsedAt: z.string().datetime({ offset: true }).nullable(), lastUsedIp: z.string().nullable(),
  revokedAt: z.string().datetime({ offset: true }).nullable(), createdAt: z.string().datetime({ offset: true }),
  createdBy: z.string().uuid(), actorId: z.string().uuid(), unusedWarning: z.boolean(),
}).strict();
export type ApiTokenItem = z.infer<typeof apiTokenItemSchema>;
export const apiTokenPageSchema = z.object({ items: z.array(apiTokenItemSchema), nextCursor: z.string().nullable() }).strict();
export type ApiTokenPage = z.infer<typeof apiTokenPageSchema>;
export const issuedApiTokenSchema = z.object({
  token: z.string().regex(/^ap_[0-9a-f]{8}_[A-Za-z0-9_-]{43,}$/), item: apiTokenItemSchema,
}).strict();
export const revokedApiTokenSchema = z.object({ item: apiTokenItemSchema }).strict();
export interface IssueApiTokenInput { name: string; scopes: string[]; expiresAt: string | null; actorId?: string }
