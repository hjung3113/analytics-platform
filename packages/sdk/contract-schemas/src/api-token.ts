import { z } from 'zod/v4';

// API token contract, `v0` (ADR-0116, #1442). PROVISIONAL: the header format, the token value layout and the error
// codes below may change without compatibility until a first consumer pins them. Wire:
//   Authorization: Bearer ap_<prefix>_<secret>   prefix = 8 lowercase hex, secret = base64url of 32 random bytes.
// Failure of any kind (unknown, revoked, expired, malformed, inactive owner) is one 401 `auth.token_invalid`.
// A token call to a route that needs a human login session (every route not marked token-callable, including all
// token management) is 403 `permission.session_required`. A session-only or out-of-scope capability reached inside a
// token-callable menu port is that port's normal judged denial instead: HTTP 200 `{ outcome: 'forbidden' }`.
// Runtime-only (not expressible here): scope names must be known, non-session-only capabilities (422 `validation.failed`).

export const API_TOKEN_VERSION = 'v0';
export const API_TOKEN_ERROR_CODES = ['auth.token_invalid', 'permission.session_required'] as const;

export const apiTokenValueSchema = z.string().regex(/^ap_[0-9a-f]{8}_[A-Za-z0-9_-]{43,}$/);
export const apiTokenKindSchema = z.enum(['personal', 'service']);

const name = z.string().min(1).max(100);
const scopes = z.array(z.string().min(1).max(100)).max(64);
const instant = z.iso.datetime({ offset: true });
// The route's identifier rule (any 8-4-4-4-12 hex, as zod v3 `.uuid()` and Postgres `uuid` accept), not v4's RFC
// version/variant check: seeded ids such as `00000000-0000-0000-0000-000000000001` are valid here.
const uuid = z.string().regex(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/);

// Input names are trimmed and must stay non-empty after trimming (the route's rule).
// The pattern carries the non-blank rule into the generated JSON Schema, which cannot express `trim()`.
const inputName = z.string().regex(/\S/).trim().min(1).max(100);
const expiresAt = instant.nullable().optional();

export const issuePersonalApiTokenInputSchema = z.strictObject({ name: inputName, scopes, expiresAt });
export const issueServiceApiTokenInputSchema = z.strictObject({ name: inputName, scopes, expiresAt, actorId: uuid });

export const apiTokenItemSchema = z.strictObject({
  id: uuid,
  kind: apiTokenKindSchema,
  name,
  prefix: z.string().regex(/^[0-9a-f]{8}$/),
  scopes,
  expiresAt: instant.nullable(),
  lastUsedAt: instant.nullable(),
  lastUsedIp: z.string().nullable(),
  revokedAt: instant.nullable(),
  createdAt: instant,
  createdBy: uuid,
  actorId: uuid,
  unusedWarning: z.boolean(),
});

/** The only response that carries the token value; it is never returned again. */
export const issuedApiTokenSchema = z.strictObject({ token: apiTokenValueSchema, item: apiTokenItemSchema });

/** Both list endpoints: keyset pages, `created_at desc, id desc`; `nextCursor` is opaque, null on the last page. */
export const apiTokenPageSchema = z.strictObject({
  items: z.array(apiTokenItemSchema),
  nextCursor: z.string().nullable(),
});
