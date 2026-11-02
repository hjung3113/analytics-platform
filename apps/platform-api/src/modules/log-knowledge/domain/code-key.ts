// The comparison key of a catalog code (ADR-0107 decision 2). The typed original is stored and shown
// as is; uniqueness and search use this key. NFKC → trim → inner whitespace runs become one space →
// upper case with no locale (`toUpperCase`, never `toLocaleUpperCase`). Never trusted from input.

export function toCodeKey(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toUpperCase();
}

/** Length limits mirrored by the DB CHECKs of migration 0080 (zod-side checks of the write actions). */
export const CODE_MAX = 64;
export const NAME_MAX = 200;
