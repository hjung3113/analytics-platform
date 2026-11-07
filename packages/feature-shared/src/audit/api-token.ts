// API token audit detail schemas (#1442, ADR-0116). Ids, kind, scope names, prefix and expiry only:
// never the token value, its hash or a secret. A token call's own writes carry `api_token_id` in their detail
// (added centrally by the audit writer, not declared per event).

import { z } from 'zod';

export const API_TOKEN_AUDIT_EVENT_TYPES = [
  'api_token.issue',
  'api_token.revoke',
  'api_token.auth_failed',
  'api_token.session_required_denied',
] as const;

const uuid = z.string().uuid();

export const apiTokenIssueDetailSchema = z
  .object({
    token_id: uuid,
    kind: z.enum(['personal', 'service']),
    prefix: z.string().min(1),
    scopes: z.array(z.string().min(1)),
    expires_at: z.string().nullable(),
    owner_actor_id: uuid,
  })
  .strict();

export const apiTokenRevokeDetailSchema = z
  .object({ token_id: uuid, kind: z.enum(['personal', 'service']), prefix: z.string().min(1) })
  .strict();

/** `prefix` is present only when the presented value parsed as `ap_<prefix>_…`; `reason` is internal, never returned to the client. */
export const apiTokenAuthFailedDetailSchema = z
  .object({ prefix: z.string().nullable(), reason: z.string().min(1) })
  .strict();

export const apiTokenSessionRequiredDeniedDetailSchema = z
  .object({
    token_id: uuid,
    method: z.string().min(1),
    route: z.string().min(1),
    capability: z.string().nullable(),
  })
  .strict();

export const API_TOKEN_AUDIT_EVENT_DETAIL_SCHEMAS = {
  'api_token.issue': apiTokenIssueDetailSchema,
  'api_token.revoke': apiTokenRevokeDetailSchema,
  'api_token.auth_failed': apiTokenAuthFailedDetailSchema,
  'api_token.session_required_denied': apiTokenSessionRequiredDeniedDetailSchema,
} as const;
