import type { JsonValue } from '@ap/contracts';
import { decodeFavorites, decodeRecent, decodeScopeId } from './preferences';

export type LegacyCandidates = {
  /** Server key → converted value, ready to import. Only records that were positively identified and well-formed. */
  values: Record<string, JsonValue>;
  /** An eligible record could not be converted now (no WebCrypto); the import waits so the record is not skipped for good. */
  failed: boolean;
};

/** Raw table keys the Kernel may claim: this reserved namespace is the only positive provenance (ADR-0098 client status). */
export const LEGACY_TABLE_NAMESPACE = 'platform:table:';

const isPlainRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;

/** Strict table shape: exactly sizing / visibility / pinning. Returns the sanitized value, or null when the record is not a table preference. */
export function strictTablePreferences(parsed: unknown): JsonValue | null {
  if (!isPlainRecord(parsed)) return null;
  const keys = Object.keys(parsed);
  if (keys.length !== 3 || !keys.includes('sizing') || !keys.includes('visibility') || !keys.includes('pinning')) return null;
  const { sizing, visibility, pinning } = parsed;
  if (!isPlainRecord(sizing) || !isPlainRecord(visibility) || !isPlainRecord(pinning)) return null;
  if (!Object.values(sizing).every(v => typeof v === 'number' && Number.isFinite(v))) return null;
  if (!Object.values(visibility).every(v => typeof v === 'boolean')) return null;
  const { left, right } = pinning;
  if (!Array.isArray(left) || !Array.isArray(right) || !left.every(v => typeof v === 'string') || !right.every(v => typeof v === 'string')) return null;
  return {
    sizing: Object.fromEntries(Object.entries(sizing).filter(([, v]) => (v as number) >= 60 && (v as number) <= 600)) as Record<string, number>,
    visibility: visibility as Record<string, boolean>,
    // The right pin is derived from the action column, never stored.
    pinning: { left: (left as string[]).filter(id => id !== '_action'), right: [] },
  };
}

function readJson(store: Storage, key: string): unknown {
  try {
    const raw = store.getItem(key);
    return raw === null ? undefined : JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/**
 * The browser records this account may carry to the server once: the exact current-user favorites / recent / lastScope keys,
 * the browser-wide language (ADR-0098 §2) and namespaced table preferences. Nothing is deleted or modified here.
 */
export async function collectLegacyPreferences(store: Storage, userId: string, tableKey: (rawKey: string) => Promise<string | null>): Promise<LegacyCandidates> {
  const values: Record<string, JsonValue> = {};
  let failed = false;
  const favorites = decodeFavorites(readJson(store, `platform:favorites:${userId}`));
  if (favorites !== undefined) values.favorites = favorites;
  const recent = decodeRecent(readJson(store, `platform:recent:${userId}`));
  if (recent !== undefined) values.recents = recent as unknown as JsonValue;
  const scope = decodeScopeId(readJson(store, `platform:lastScope:${userId}`));
  if (typeof scope === 'string') values.lastScope = scope;
  try {
    const lang = store.getItem('platform:lang');
    if (lang === 'en' || lang === 'ko') values.lang = lang;
  } catch { /* unreadable storage: nothing to carry */ }
  const rawKeys: string[] = [];
  try {
    for (let i = 0; i < store.length; i++) {
      const key = store.key(i);
      if (key !== null && key.startsWith(LEGACY_TABLE_NAMESPACE) && key.length > LEGACY_TABLE_NAMESPACE.length) rawKeys.push(key);
    }
  } catch { /* unreadable storage */ }
  for (const rawKey of rawKeys.sort()) {
    const value = strictTablePreferences(readJson(store, rawKey));
    if (value === null) continue;
    const serverKey = await tableKey(rawKey);
    if (serverKey === null) failed = true;
    else values[serverKey] = value;
  }
  return { values, failed };
}
