# packages/host/http-adapter — real-server client

`@ap/http-adapter` carries `PlatformAdapter` over HTTP. The wire format (paths, conversion table, bootstrap, polling, CSRF, Correlation ID) is owned by [transport format](../../../docs/integration/http-adapter-contract.md); per-method meaning is owned by [real-server checklist](../../../docs/integration/real-server-checklist.md) §2. This package turns those documents into code and sets no rules of its own.

## Rules

- Never write cookies or tokens to storage (`localStorage` etc.); `csrfToken` lives in memory only. Never send a user id or actor.
- Keep the user-visible `message` to a short code: `client_timeout`, `network_error`, `session_expired`, `http_<status>`, `invalid_response`, `invalid_envelope`. Never put a URL, response body or stack in it.
- Conversion by call group (`src/calls/calls.ts`): envelope calls never reject, writes return `unknown`, non-envelope calls throw `TransportError`, optional ports throw `PortError`.
- Multipart (`uploadFile`): `SendRequest.formData` replaces `body`; the transport then sets no `Content-Type`, so `fetch` writes the boundary. The upload gets its own longer deadline. Everything else stays JSON-only.

## Verification

Tests inject `fetch`; they never use the real network.
