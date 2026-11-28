/** `record[key]` when `key` is the record's own property (a prototype name such as `constructor` never matches), else `undefined`. */
export function ownValue<T>(record: Readonly<Record<string, T>>, key: string): T | undefined {
  return Object.hasOwn(record, key) ? record[key] : undefined;
}
