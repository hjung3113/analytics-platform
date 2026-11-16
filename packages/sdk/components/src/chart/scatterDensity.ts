/** Advisor-reviewed quiet values; category and numeric scatters share the same marks. */
export const QUIET_SCATTER = {
  normalSize: 6,
  normalOpacity: 0.45,
  // Status points stay one step above normal ones: same size, a little more fill and a thin, slightly transparent ring,
  // so several out-of-bound points stacked in one cell do not merge into a solid block.
  statusSize: 6,
  statusOpacity: 0.6,
  ringWidth: 1,
  ringOpacity: 0.75,
} as const;
