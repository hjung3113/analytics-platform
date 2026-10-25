import type { Pair } from '@ap/contracts';

/** `returnTo` is navigation state (the way back), never screen state: stores that replay URLs or page pairs drop it (#760, ADR-0081 UX-10). */
export const RETURN_TO_KEY = 'returnTo';

export function withoutReturnTo(pairs: readonly Pair[]): Pair[] {
  return pairs.filter(([key]) => key !== RETURN_TO_KEY);
}

/** The same app-relative URL without its `returnTo` query pair; other pairs keep their exact encoding and order. */
export function stripReturnToFromUrl(url: string): string {
  const q = url.indexOf('?');
  if (q === -1) return url;
  const hash = url.indexOf('#', q);
  const query = url.slice(q + 1, hash === -1 ? undefined : hash);
  const kept = query.split('&').filter(part => {
    const eq = part.indexOf('=');
    let key = eq === -1 ? part : part.slice(0, eq);
    try { key = decodeURIComponent(key.replace(/\+/g, ' ')); } catch { /* keep raw */ }
    return key !== RETURN_TO_KEY;
  });
  return url.slice(0, q) + (kept.length ? `?${kept.join('&')}` : '') + (hash === -1 ? '' : url.slice(hash));
}
