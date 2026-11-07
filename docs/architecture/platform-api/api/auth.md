# Authentication

Index and global rules: [03-api-contracts.md](../03-api-contracts.md). This file is the normative contract for the sections below.

## Authentication

```text
GET /auth/login
GET /auth/callback
GET /auth/mock-login
POST /auth/mock-login
POST /auth/logout
GET /me
```

`GET /auth/login` starts the configured provider's login flow and accepts an
optional `return_to`. `GET /auth/callback` completes the OIDC login flow; it
returns `404 not_found.record` when the configured provider is `mock`.
An existing Actor with `actor_type=system` cannot receive an interactive
session: OIDC callback returns HTTP 403 `permission.denied`, clears the OIDC
transaction cookie, and neither redirects into the app nor issues a session
or updates the Actor profile. Existing sessions belonging to a system Actor
are rejected as unauthenticated (`/me` and `/session-state` return 401).
The OIDC flow keeps its state, nonce and PKCE verifier in a signed,
short-lived transaction cookie named `platform_oidc_tx` (Path=/auth, HttpOnly,
SameSite=Lax, Max-Age 600, Secure in production). The signing-key domain label
is `platform-oidc-tx-v1`. The retired cookie name and label are not accepted:
a login started before the rename must be restarted (ADR-0097).
`GET /auth/mock-login` and `POST /auth/mock-login` return `404 not_found.record`
when `NODE_ENV` is `production` or the configured provider is not `mock`.
`GET /auth/mock-login` accepts the same optional `return_to` query as
`GET /auth/login`. The mock picker sanitizes it (same-origin single-slash path
only; anything else is dropped) and, when it survives, adds it to each actor
form as a hidden `return_to` field.
`POST /auth/mock-login` accepts `{ external_id }` as JSON or
`external_id` (plus an optional `return_to`) as an
`application/x-www-form-urlencoded` form body (the first value wins for a
repeated key) and issues a session cookie. A JSON post returns
`200 { actor, workspace_id }` and ignores `return_to`. A form post returns
`302` to the sanitized `return_to` (`/` when absent or unsafe): the redirect
target is always a same-origin path, never an absolute or protocol-relative URL.
Validation errors keep the `422` envelope for both body types.
`POST /auth/logout` revokes the session from the request cookie when present,
clears the cookie, and returns `204`.

`GET /me` requires a valid session and workspace membership; it returns the
session Actor's identity, `workspace_id` and `platform_return_origins`:
the origins configured in `PLATFORM_RETURN_ORIGINS` (FO ADR-0071), `[]` when
unset. `POST /auth/mock-login` does not return `platform_return_origins`.

## API tokens (ADR-0116; `v0`, provisional — the format and codes may change without compatibility)

Schemas: `@ap/contract-schemas` (`apiTokenValue`, `issuePersonalApiTokenInput`, `issueServiceApiTokenInput`, `apiTokenItem`, `issuedApiToken`).

```text
POST /api-tokens                      personal issue   { name, scopes[], expiresAt? (null = none) } → 201 { token, item }
GET  /api-tokens                      own personal tokens → { items, nextCursor } (?limit= 1–200, default 100; ?cursor=)
POST /api-tokens/:id/revoke           revoke own personal token
POST /api-tokens/service              admin only: { name, scopes[], expiresAt?, actorId } (existing system Actor of the workspace)
GET  /api-tokens/service?noExpiry=    admin only: every token of the workspace → { items, nextCursor } (same paging; noExpiry holds on every page)
POST /api-tokens/service/:id/revoke   admin only: revoke any token of the workspace
```

All six are session-only (cookie): a token call gets `403 permission.session_required`. `token` is returned once, in the issue response (`Cache-Control: no-store`); lists carry `prefix`, never the value or hash. List rows: `id, kind, name, prefix, scopes, expiresAt, lastUsedAt, lastUsedIp (summary), revokedAt, createdAt, createdBy, actorId, unusedWarning` (no use, or none since issue, for `API_TOKEN_UNUSED_WARNING_DAYS` = 30 days; no automatic deactivation). Bad scopes: `422 validation.failed` with `detail.fields`. Lists are keyset pages ordered `created_at desc, id desc`; `nextCursor` is opaque (`null` on the last page) and a bad `limit`/`cursor` is `422 validation.failed`.

**Token call authentication order** (root hooks, before routes):

1. The rate limiter runs first: a Bearer call is keyed `<workspace_id>:token:<token_id>`; a token that authenticates gets that bucket (`POST /api/v1/menu-action` a separate mutation-sized one, 10/min); every rejected authentication (unknown, malformed, revoked, expired, wrong owner, empty credential) counts in the per-IP bucket. The outcome is resolved once and reused by step 2.
2. `Authorization: Bearer …` present (the scheme alone, with an empty or blank credential, counts as present) → the cookie is ignored. Look up by SHA-256 (constant-time compare); the token must exist, be unrevoked and unexpired, belong to this workspace, and its owner must be the issuer (personal, not a system Actor) or a system Actor (service). Any failure is one `401 auth.token_invalid` (unknown, revoked, expired and malformed are indistinguishable) plus an `api_token.auth_failed` audit row.
3. The route must set `config.tokenCallable`, else `403 permission.session_required` (+ `api_token.session_required_denied`). This is the route-level refusal only: a session-only or out-of-scope capability inside a token-callable menu port is the port's judged denial, `200 { outcome: 'forbidden' }`, audited as `api_token.session_required_denied` with `capability`.
4. The request runs with a token auth context; `last_used_at`/`last_used_ip` are stamped at most once a minute. CSRF is not applied to a token call (no ambient credential); cookie requests are unchanged.
5. Capability checks apply scope ∩ the owner's current permissions ([05](../05-permission-policy.md)). The knowledge draft actions (`logKnowledge.draftCreate` / `draftUpdate` / `draftSubmit` / `draftWithdraw`) are token-callable with the scope `knowledge.draft.create` ([log-knowledge.md](log-knowledge.md#agent-and-validator-submission-over-api-tokens-1198-c)).
