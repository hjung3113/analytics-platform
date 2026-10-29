// Asia/Seoul wall-clock formatting shared by the bootstrap `defaultRangeTo` (minute) and the Home
// notice expiry comparison (second): one formatter, so the two never drift apart.

const FORMAT = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Seoul',
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/** Asia/Seoul wall-clock `at` at second precision: `YYYY-MM-DDTHH:mm:ss`. */
export function seoulWallClock(at: Date): string {
  const parts = FORMAT.formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`;
}

/** Asia/Seoul wall-clock `at`, truncated to the minute: `YYYY-MM-DDTHH:mm:00`. */
export function seoulWallClockMinute(at: Date): string {
  return `${seoulWallClock(at).slice(0, 17)}00`;
}
