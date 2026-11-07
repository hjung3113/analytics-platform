/** Host presentation state; never a menu page key or part of an analysis address (ADR-0126). */
export const DETAIL_EXPAND_KEY = 'expand';

/** Remove only the platform key, preserving the encoding/order of every other pair. */
export function stripDetailExpansion(url: string): string {
  const q = url.indexOf('?');
  if (q === -1) return url;
  const hash = url.indexOf('#', q);
  const kept = url.slice(q + 1, hash === -1 ? undefined : hash).split('&').filter(part => {
    const raw = part.split('=')[0];
    try { return decodeURIComponent(raw.replace(/\+/g, ' ')) !== DETAIL_EXPAND_KEY; } catch { return true; }
  });
  return url.slice(0, q) + (kept.length ? `?${kept.join('&')}` : '') + (hash === -1 ? '' : url.slice(hash));
}
export function withDetailExpansion(url: string, expanded: boolean): string {
  const clean = stripDetailExpansion(url);
  if (!expanded) return clean;
  const hash = clean.indexOf('#');
  const address = hash === -1 ? clean : clean.slice(0, hash);
  return address + (address.includes('?') ? '&' : '?') + 'expand=1' + (hash === -1 ? '' : clean.slice(hash));
}
