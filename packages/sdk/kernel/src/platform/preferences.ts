import { stripDetailExpansion } from '../links/detail-expansion';
import { stripReturnToFromUrl } from '../links/return-to';
import { isAppRelativePath } from '@ap/contracts';
import type { Recent } from './types';

/** A stored preference must pass `decode`: bad JSON or a value `decode` rejects (undefined) reads as `fallback`. Never throws. */
export function readPreference<T>(key: string, decode: (value: unknown) => T | undefined, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return decode(JSON.parse(raw)) ?? fallback;
  } catch {
    return fallback;
  }
}
/** The stored value, or `undefined` when there is none, it does not decode, or storage cannot be read: the caller's own copy is then the newest it has. */
export function readStoredPreference<T>(key: string, decode: (value: unknown) => T | undefined): T | undefined {
  try {
    const raw = localStorage.getItem(key);
    return raw ? decode(JSON.parse(raw)) : undefined;
  } catch {
    return undefined;
  }
}
/** False when the value could not be stored (blocked or full): it then lives in memory only. */
export function writePreference(key: string, value: unknown): boolean {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; /* memory-only */ }
}
/** String entries only; a non-list is rejected. */
export function decodeFavorites(value: unknown): string[] | undefined {
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : undefined;
}
/** Well-formed entries only; a stored URL must stay app-relative because the shell navigates to it. */
export function decodeRecent(value: unknown): Recent[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((entry): entry is Recent => {
    if (entry === null || typeof entry !== 'object') return false;
    const r = entry as Record<string, unknown>;
    return typeof r.menuId === 'string' && typeof r.url === 'string' && isAppRelativePath(r.url)
      && typeof r.at === 'number' && Number.isFinite(r.at);
  }).map(entry => ({ ...entry, url: stripDetailExpansion(entry.url) }));
}
export function decodeScopeId(value: unknown): string | null | undefined {
  return typeof value === 'string' ? value : undefined;
}

export function spaceLastKey(userId: string) {
  return `platform:space-last:${userId}`;
}

/**
 * String entries only. Bad JSON or a non-object starts from {}. Never throws.
 * `migrations` maps a former space id to its current one (the app declares it, ADR-0072): an entry under a former id moves
 * to the current id once, here, unless the current id already has one (that one wins), and the former key is removed.
 */
export function readSpaceLast(userId: string, migrations?: Readonly<Record<string, string>>): Record<string, string> {
  try {
    const raw = sessionStorage.getItem(spaceLastKey(userId));
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'string') out[key] = stripDetailExpansion(value);
    }
    if (migrations === undefined) return out;
    let moved = false;
    for (const [former, current] of Object.entries(migrations)) {
      if (former === current || !(former in parsed)) continue;
      if (typeof out[former] === 'string' && !(current in out)) out[current] = out[former];
      delete out[former];
      moved = true;
    }
    if (moved) {
      try { sessionStorage.setItem(spaceLastKey(userId), JSON.stringify(out)); } catch { /* memory-only: the migrated map is still returned */ }
    }
    return out;
  } catch {
    return {};
  }
}

export function sameParams(a: Record<string, string>, b: Record<string, string>): boolean {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(key => a[key] === b[key]);
}

export function writeSpaceLast(userId: string, spaceId: string, url: string, migrations?: Readonly<Record<string, string>>) {
  try {
    const next = readSpaceLast(userId, migrations);
    next[spaceId] = stripDetailExpansion(stripReturnToFromUrl(url));
    sessionStorage.setItem(spaceLastKey(userId), JSON.stringify(next));
  } catch { /* memory-only */ }
}
