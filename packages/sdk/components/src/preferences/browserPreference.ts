/** Browser-only preferences. Without a session, the explicit `anon` account owns the key. */
export function browserPreferenceKey(kind: string, userId: string | undefined, rest = ''): string {
  return `platform:${kind}:v1:${userId ?? 'anon'}:${rest}`;
}

// Tab-local ownership also survives a refused destination write or legacy deletion.
// Key by Storage so independent browser stores never share a fallback.
const consumedLegacy = new WeakMap<Storage, Map<string, { owner: string; raw: string | null }>>();

function decodePreference<T>(raw: string | null, decode: (raw: string) => T | null, fallback: T): T {
  if (raw === null) return fallback;
  try { return decode(raw) ?? fallback; } catch { return fallback; /* Malformed optional preferences use their declared default. */ }
}

/** Shared legacy sources are consumed once, even if browser storage refuses migration or cleanup. */
export function readBrowserPreference<T>(key: string, options: { legacyKey: string; decode: (raw: string) => T | null; fallback: T; decodeLegacy?: (raw: string) => T | null; migrate?: (value: T) => boolean }): T {
  try {
    const storage = localStorage;
    const current = storage.getItem(key);
    // Section booleans already use an owned key; they are not migration sources.
    if (key === options.legacyKey) return decodePreference(current, options.decode, options.fallback);
    let consumed = consumedLegacy.get(storage);
    if (!consumed) { consumed = new Map(); consumedLegacy.set(storage, consumed); }
    let source = consumed.get(options.legacyKey);
    if (!source) {
      const legacy = storage.getItem(options.legacyKey);
      if (legacy !== null) {
        source = { owner: key, raw: current === null ? legacy : null };
        consumed.set(options.legacyKey, source);
        const value = decodePreference(source.raw, options.decodeLegacy ?? options.decode, null);
        try {
          if (value !== null) {
            if (options.migrate) options.migrate(value);
            else storage.setItem(key, JSON.stringify(value));
          }
        } catch { /* The original owner retains the decoded fallback in this tab. */ }
      }
    }
    // Cleanup is independent of destination precedence and persistence success.
    if (source) {
      try { storage.removeItem(options.legacyKey); } catch { /* The tab-local consumed record prevents another account claiming the source. */ }
    }
    if (current !== null) return decodePreference(current, options.decode, options.fallback);
    const raw = source?.owner === key ? source.raw : null;
    return decodePreference(raw, options.decodeLegacy ?? options.decode, options.fallback);
  } catch {
    // Browser storage can be denied; the hook keeps subsequent choices in memory.
    return options.fallback;
  }
}

export function decodeCollapse(raw: string): boolean | null {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return null;
}

/** Fan an old analysis list out into JSON booleans, preserving already owned section choices. */
export function migrateCollapseSections(key: string, ids: readonly string[]): boolean {
  try {
    for (const id of ids) if (localStorage.getItem(`${key}:${id}`) === null) localStorage.setItem(`${key}:${id}`, 'true');
    return true;
  } catch {
    // The original owner keeps all ids in the tab fallback, even if only some sections could be copied.
    return false;
  }
}
