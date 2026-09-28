/**
 * App-side reader of the FeedbackOps origin env (issue #60 §4). The reader only maps absent/empty to
 * null and passes everything else through unchanged — no trim, no rewrite, no console.error plus a
 * localhost guess. Rejection of invalid origins is the menu helper's job (`feedbackOpsHref` fails
 * closed), so a bad build-time value surfaces as disabled links, not a masked fallback.
 */
export function readFeedbackOpsOrigin(value: string | undefined): string | null {
  if (value === undefined || value === '') return null;
  return value;
}

// No vite/client reference exists in this app, so ImportMeta.env is declared here and only the one
// key this app reads is listed (design §4: augment in this file only).
declare global {
  interface ImportMetaEnv {
    /** FeedbackOps absolute origin (https, or http for loopback). Absent = links render disabled. */
    readonly VITE_FEEDBACKOPS_ORIGIN?: string;
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }
}
