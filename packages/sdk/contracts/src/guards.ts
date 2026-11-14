/**
 * A non-null, non-array object: the shape check before reading named fields off an untrusted value (stored JSON,
 * a server response). It does not check the prototype — a class instance passes. One definition for the platform
 * (#673); `@ap/ui` keeps its sanitizer copy because ui imports no `@ap/*` package.
 */
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The code point of one character from string iteration (`Array.from`, `for…of`), which never yields an empty string. Internal, not exported from the package entry. */
export function codepoint(char: string): number {
  const point = char.codePointAt(0);
  if (point === undefined) throw new Error('String iteration yielded an empty character');
  return point;
}
