/** Human validation records (#1808 N1). Oversized input is refused, never truncated.
 * Single source for the server, the screens and the SQL CHECK docs; `menus/log-dev/log-models/src/mock/issues.ts` keeps a
 * marked copy (menus may not import feature packages) that `__tests__/validation-issue-limits.test.ts` pins to these values. */
export const VALIDATION_ISSUE_LIMITS = {
  title: 200,
  body: 8000,
  comment: 4000,
  evidencePerOccurrence: 20,
  pageDefault: 50,
  pageMax: 100,
} as const;
