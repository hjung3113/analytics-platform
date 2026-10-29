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
