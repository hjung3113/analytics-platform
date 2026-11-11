# packages/adapters/http-adapter — real-server client

`@ap/http-adapter` carries `PlatformAdapter` over HTTP. The wire format (paths, conversion table, bootstrap, polling, CSRF, Correlation ID) is owned by [transport format](../../../docs/integration/http-adapter-contract.md); per-method meaning is owned by [real-server checklist](../../../docs/integration/real-server-checklist.md) §2. This package turns those documents into code and sets no rules of its own.

## Rules

- Depend at runtime only on `@ap/contracts`. Only test files may import the `@ap/contract-schemas/source` devDependency, to check guard/wire-schema equivalence. Do not import React, DOM components, other `@ap/*` packages or feature packages.
- Import this package only from the app's production assembly `apps/platform-web/src/real/**` (boundary lint) and from platform-API real-server conformance tests (devDependency, test code only — ADR-0073).
- Never write cookies or tokens to storage (`localStorage` etc.); `csrfToken` lives in memory only. Never send a user id or actor.
- Keep the user-visible `message` to a short code: `client_timeout`, `network_error`, `session_expired`, `http_<status>`, `invalid_response`, `invalid_envelope`. Never put a URL, response body or stack in it.
- `bootstrapHttpAdapter(options)` never rejects. Its result is `ready` (adapter), `login` (401, 3xx, `opaqueredirect`), `unavailable` (`correlationId`) or `throttled` (429; `correlationId`, `retryAfterSeconds?`).
- Transport (`src/calls/transport.ts`): connect the Kernel `signal` and the internal timer by hand (no `AbortSignal.any`), use `redirect: 'manual'`, `credentials: 'same-origin'` and `X-Correlation-Id`. The internal timeout is not an `AbortError`.
- Conversion by call group (`src/calls/calls.ts`): envelope calls never reject, writes return `unknown`, non-envelope calls throw `TransportError`, optional ports throw `PortError`.
- Multipart (`uploadFile`): `SendRequest.formData` replaces `body`; the transport then sets no `Content-Type`, so `fetch` writes the boundary. The upload gets its own longer deadline. Everything else stays JSON-only.
- Response validation (`src/validate.ts`) ignores unknown keys.
- Saved views (`src/saved-views/`, ADR-0099): `guards.ts` matches command/response wire schemas recursively and rejects unknown keys; `store.ts` sends each of the 16 commands once, with CSRF.
- Session (`src/session/session.ts`): snapshot identity, `subscribe` polling, single-flight re-check with backoff, `onSessionLost`.
- When a port method is added, the table in `src/__tests__/methods.test.ts` reports it as a type error.

## Layout

Put session and bootstrap code in `session/`, call conversion and transport in `calls/`. Keep only the public entry `index.ts`, `adapter` and `validate` at the `src/` root. Tests and the shared helper `test-support.ts` go in `__tests__/` (ADR-0090).

## Verification

Narrow with `pnpm --filter @ap/http-adapter lint|typecheck|test`, then the root checks. Tests inject `fetch`; they never use the real network.
