import { isDevelopment } from './isDevelopment';

// Kept for consumers that already call it; SDK source compares `process.env.NODE_ENV` inline (#3028).
/**
 * @deprecated Use `!isDevelopment()` (#2951). In a Vite production bundle `meta.env` and `g.process` are absent, so this
 * read alone missed production; it now also reads the statically replaced `process.env.NODE_ENV`. Removed next SDK minor.
 */
export function isProductionEnv(meta: { env?: { PROD?: boolean } }, g: { process?: { env?: { NODE_ENV?: string } } }): boolean {
  if (meta.env?.PROD === true || g.process?.env?.NODE_ENV === 'production') return true;
  try {
    // eslint-disable-next-line no-restricted-syntax -- the deprecated wrapper keeps its documented answer; removal is tracked in .planning/backlog.md (#2951).
    return !isDevelopment();
  } catch (error) {
    // A browser bundle built without NODE_ENV replacement has no global `process` (ReferenceError, or TypeError where it is
    // declared but undefined): keep the old answer, no positive signal. Not a `typeof process` test: a replaced bundle has none either.
    if (error instanceof ReferenceError || error instanceof TypeError) return false;
    throw error;
  }
}
