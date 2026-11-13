// PLAN-22 D-07 — attachment MIME allowlist.
//
// Closed set of content types accepted by POST /attachments. The set is the
// authority — declared `Content-Type` outside the set returns
// `422 attachment.unsupported_type`. Magic-byte sniffing (true type vs
// declared type) is a defense-in-depth concern handled in C3b.
//
// Adding a new type:
//   1. Update this set.
//   2. Update docs/product/features/12-ui-ux-principles.md if reporter UI needs to
//      announce it.
//   3. Confirm the type is renderable / safe for the download path (C4a).

export const MIME_ALLOWLIST: ReadonlySet<string> = new Set([
  // Images
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  // Documents
  'application/pdf',
  'text/plain',
  // Data files (#1741). The download route always sends `Content-Disposition: attachment` and the server sends
  // `X-Content-Type-Options: nosniff`, so a browser never renders it; API callers rely on the feature client refusing
  // an attachment response as a success body (#2049, attachments/AGENTS.md).
  'application/json',
  // Office (read-only consumption — write side is out of scope)
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]);
