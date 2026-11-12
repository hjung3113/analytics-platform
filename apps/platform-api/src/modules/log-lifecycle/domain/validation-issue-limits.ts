/** Human validation records (#1808 N1). Oversized input is refused, never truncated. */
export const VALIDATION_ISSUE_LIMITS = {
  title: 200,
  body: 8000,
  comment: 4000,
  evidencePerOccurrence: 20,
  pageDefault: 50,
  pageMax: 100,
} as const;
