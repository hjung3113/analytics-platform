/** The bare UUID grammar the mock ports share (notices and actions); upload keys keep their own narrower rule. */
const BARE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isBareUuid = (value: unknown): value is string => typeof value === 'string' && BARE_UUID.test(value);
