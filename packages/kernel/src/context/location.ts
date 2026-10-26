/** Browser boundary. All inputs and non-null reads are base-free app-relative URLs. */
export type PlatformLocation = {
  /** null means the browser pathname is outside this deployment. */
  read: () => string | null;
  push: (url: string) => void;
  replace: (url: string) => void;
  href: (url: string) => string;
  absoluteUrl: (url: string) => string;
};

/** Default boundary preserves the existing pathname/search and history writes byte for byte. */
export function createBrowserLocation(): PlatformLocation {
  return {
    read: () => window.location.pathname + window.location.search,
    push: url => window.history.pushState(null, '', url),
    replace: url => window.history.replaceState(null, '', url),
    href: url => url,
    absoluteUrl: url => window.location.origin + url,
  };
}

/** A deployment prefix belongs only to the browser boundary, never to Registry or stored URLs. */
export function createBasePathLocation(basePath: string): PlatformLocation {
  if (basePath === '/') return createBrowserLocation();
  if (!basePath.startsWith('/') || basePath.startsWith('//') || /[?#\\]/.test(basePath)
    || basePath.includes('//') || /[\u0000-\u0020\u007F]/.test(basePath)
    || basePath.split('/').some(isDotSegment)) {
    throw new Error('basePath must be an absolute deployment pathname');
  }
  const normalized = new URL(basePath, 'http://app.invalid').pathname;
  const base = normalized.endsWith('/') ? normalized : normalized + '/';
  // App-relative URLs resolve at a virtual app root so raw or encoded dot segments can never leave the base.
  const href = (url: string) => {
    const resolved = new URL(url, 'http://app.invalid');
    return base.slice(0, -1) + resolved.pathname + resolved.search;
  };
  return {
    read: () => window.location.pathname.startsWith(base)
      ? '/' + window.location.pathname.slice(base.length) + window.location.search
      : null,
    push: url => window.history.pushState(null, '', href(url)),
    replace: url => window.history.replaceState(null, '', href(url)),
    href,
    absoluteUrl: url => window.location.origin + href(url),
  };
}

/**
 * Raw or percent-encoded '.'/'..' segments (`%2e`, `%2E`, `.%2e`), after one decode: folding them would move a URL
 * boundary. An invalid percent escape counts as a dot segment (fail-closed): this is a security boundary, and a
 * segment that cannot be decoded cannot be shown to stay put.
 */
export function isDotSegment(segment: string): boolean {
  let decoded: string;
  try { decoded = decodeURIComponent(segment); } catch { return true; }
  return decoded === '.' || decoded === '..';
}

/** Any path segment of `pathname` is a dot segment, by the {@link isDotSegment} rule. */
export function hasDotSegment(pathname: string): boolean {
  return pathname.split('/').some(isDotSegment);
}
