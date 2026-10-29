/** The one UUID shape the bridge accepts for feature ids (any version, case-insensitive). No `g` flag, so `test` keeps no state. */
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `UUID_PATTERN` as a predicate. */
export const isUuid = (value: string): boolean => UUID_PATTERN.test(value);
