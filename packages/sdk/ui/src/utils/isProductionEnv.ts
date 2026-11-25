// Kept for consumers that already call it; the SDK itself uses `isDevelopment` (#2951).
/**
 * @deprecated Use `!isDevelopment()` (#2951). In a Vite production bundle `meta.env` and `g.process` are absent, so this
 * read alone missed production; it now also reads the statically replaced `process.env.NODE_ENV`. Removed next SDK minor.
 */
export function isProductionEnv(meta: { env?: { PROD?: boolean } }, g: { process?: { env?: { NODE_ENV?: string } } }): boolean {
  return process.env.NODE_ENV === 'production' || meta.env?.PROD === true || g.process?.env?.NODE_ENV === 'production';
}
