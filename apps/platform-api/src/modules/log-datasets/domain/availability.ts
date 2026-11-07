// Availability of a revision's files (design log-test-datasets §3.2). A display computed at read time from per-file check states, never a
// stored value. Pure. `available` is claimed only when EVERY file was found AND its hash matched; anything the check could not settle
// (no port, unsupported, aborted, found without a hash to compare) is `unverified` and is never shown as confirmed.

/** What one file check answered. `hash_unknown` = the file exists but the port could not tell its hash. */
export const FILE_CHECK_STATES = ['match', 'hash_mismatch', 'hash_unknown', 'absent', 'permission_denied', 'unsupported', 'error'] as const;
export type FileCheckState = (typeof FILE_CHECK_STATES)[number];

export const AVAILABILITIES = ['available', 'unavailable', 'hash_mismatch', 'unverified'] as const;
export type Availability = (typeof AVAILABILITIES)[number];

export interface AvailabilitySummary {
  availability: Availability;
  fileCount: number;
  /** Files per state, only the states that occurred. */
  counts: Partial<Record<FileCheckState, number>>;
}

/**
 * Precedence: `unavailable` (a file is absent or not readable by the caller) > `hash_mismatch` (a file is there but changed) >
 * `unverified` (something could not be settled) > `available`. `null` or an empty list = no check was made = `unverified`.
 */
export function calculateAvailability(states: readonly FileCheckState[] | null): Availability {
  if (states === null || states.length === 0) return 'unverified';
  if (states.some((s) => s === 'absent' || s === 'permission_denied')) return 'unavailable';
  if (states.some((s) => s === 'hash_mismatch')) return 'hash_mismatch';
  if (states.every((s) => s === 'match')) return 'available';
  return 'unverified';
}

export function summarizeAvailability(states: readonly FileCheckState[] | null, fileCount: number): AvailabilitySummary {
  const counts: Partial<Record<FileCheckState, number>> = {};
  for (const state of states ?? []) counts[state] = (counts[state] ?? 0) + 1;
  return { availability: calculateAvailability(states), fileCount, counts };
}
