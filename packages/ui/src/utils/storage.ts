/**
 * `localStorage` access for optional per-browser preferences (collapsed panels, column widths): touching storage can
 * throw (blocked site data, privacy mode, quota), and a preference must never break the screen.
 */

/**
 * Reads `key` and returns `decode(raw)`; `raw` is null when the key is absent. When storage throws, or `decode` throws
 * (bad JSON, an unexpected shape), the result is `fallback` — so `decode` owns the absent-key default and `fallback`
 * only covers failures. Never throws.
 */
export function readLocalStorage<T>(key: string, decode: (raw: string | null) => T, fallback: T): T {
  try {
    return decode(localStorage.getItem(key));
  } catch {
    return fallback;
  }
}

/** Writes `value` under `key`, or removes the key for `null`. Returns false when storage refused (the preference stays in memory). Never throws. */
export function writeLocalStorage(key: string, value: string | null): boolean {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}
