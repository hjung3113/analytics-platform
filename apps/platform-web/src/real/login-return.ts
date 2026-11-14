/** One pending login per tab; never shared with other tabs or persisted across browser sessions. */
export const LOGIN_RETURN_KEY = 'platform:login-return:v1';
/** Ten minutes allows interactive login but prevents replay of old conditions on a later visit. */
export const LOGIN_RETURN_MAX_AGE_MS = 10 * 60 * 1000;

type LoginReturn = { path: string; search: string; savedAt: number };

/** Mirrors platform-api/modules/auth/return-to.ts, except its transport length cap: local conditions can be longer. */
export function isSafeLoginReturn(value: string): boolean {
  if (!value.startsWith('/') || value.startsWith('//') || /[\s\\]/u.test(value)) return false;
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code <= 31 || (code >= 127 && code <= 159)) return false;
  }
  try {
    const origin = window.location.origin;
    const resolved = new URL(value, origin);
    return resolved.origin === origin && !resolved.pathname.startsWith('//');
  } catch {
    // Malformed URLs cannot be replayed as an app address.
    return false;
  }
}

export function saveLoginReturn(path: string, search: string): boolean {
  try {
    window.sessionStorage.setItem(LOGIN_RETURN_KEY, JSON.stringify({ path, search, savedAt: Date.now() } satisfies LoginReturn));
    return true;
  } catch {
    // Blocked/quota-limited storage retains the existing full return_to fallback.
    return false;
  }
}

/** Called only after authenticated bootstrap, before the host mounts the router. Rejection gets an assembly notice. */
export function restoreLoginReturn(): 'absent' | 'restored' | 'rejected' {
  try {
    const storage = window.sessionStorage;
    let raw: string | null;
    try {
      raw = storage.getItem(LOGIN_RETURN_KEY);
    } finally {
      // Delete before parsing, validation or history access; failed reads are one-time too.
      storage.removeItem(LOGIN_RETURN_KEY);
    }
    // A newer explicit address wins, even over an invalid pending record; it has already been consumed.
    if (raw === null || window.location.search !== '') return 'absent';
    const record: unknown = JSON.parse(raw);
    if (typeof record !== 'object' || record === null) return 'rejected';
    const { path, search, savedAt } = record as Partial<LoginReturn>;
    if (typeof path !== 'string' || typeof search !== 'string' || typeof savedAt !== 'number' || !Number.isFinite(savedAt)) return 'rejected';
    const age = Date.now() - savedAt;
    if (path !== window.location.pathname || age < 0 || age >= LOGIN_RETURN_MAX_AGE_MS) return 'rejected';
    if ((search !== '' && !search.startsWith('?')) || path.includes('?') || path.includes('#') || search.includes('#') || !isSafeLoginReturn(path + search)) return 'rejected';
    window.history.replaceState(window.history.state, '', path + search);
    return 'restored';
  } catch {
    // Unreadable storage/data or unavailable history must surface the loss instead of silently shortening conditions.
    return 'rejected';
  }
}
