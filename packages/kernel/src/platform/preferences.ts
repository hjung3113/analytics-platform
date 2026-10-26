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
export function writePreference(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* memory-only */ }
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
  });
}
export function decodeScopeId(value: unknown): string | null | undefined {
  return typeof value === 'string' ? value : undefined;
}

export function spaceLastKey(userId: string) {
  return `platform:space-last:${userId}`;
}

/** String entries only. Bad JSON or a non-object starts from {}. Never throws. */
export function readSpaceLast(userId: string): Record<string, string> {
  try {
    const raw = sessionStorage.getItem(spaceLastKey(userId));
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'string') out[key] = value;
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

export function writeSpaceLast(userId: string, spaceId: string, url: string) {
  try {
    const next = readSpaceLast(userId);
    next[spaceId] = stripReturnToFromUrl(url);
    sessionStorage.setItem(spaceLastKey(userId), JSON.stringify(next));
  } catch { /* memory-only */ }
}
