/**
 * A non-null, non-array object: the shape check before reading named fields off an untrusted value (stored JSON,
 * a server response). It does not check the prototype — a class instance passes. One definition for the platform
 * (#673); `@ap/ui` keeps its sanitizer copy because ui imports no `@ap/*` package.
 */
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
