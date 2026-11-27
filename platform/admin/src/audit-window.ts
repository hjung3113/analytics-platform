/** The viewer's time zone for the audit screen (#305). Tests replace this; the filter editor gets it as an explicit `entry.timeZone`. */
export function viewerTimeZone(): string {
  // eslint-disable-next-line ap/no-direct-locale-format -- reads the viewer's time zone name; formats nothing.
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}
