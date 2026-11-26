import { instantToLocalField, localFieldToInstant, type LocalFieldResult } from '@ap/components';

/** `YYYY-MM-DDTHH:mm`, the `datetime-local` minute; the SDK field is `YYYY-MM-DD HH:mm:ss`. */
const MINUTE_LENGTH = 16;

/**
 * The lifecycle screens' instant-input adapter (host seam `time.input`, #2587) in `timeZone`: the SDK zoned-instant helpers,
 * so a DST gap or fold is refused, never moved or guessed (components §15).
 */
export function timeInputIn(timeZone: string) {
  return {
    toLocal: (instant: string): string | null => instantToLocalField(instant, timeZone)?.replace(' ', 'T').slice(0, MINUTE_LENGTH) ?? null,
    fromLocal: (local: string): LocalFieldResult => localFieldToInstant(`${local.replace('T', ' ')}:00`, timeZone),
  };
}
