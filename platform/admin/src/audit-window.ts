/** The viewer's time zone for the audit screen (#305). Tests replace this; the filter editor gets it as an explicit `entry.timeZone`. */
export function viewerTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}
