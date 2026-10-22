/** Same-origin-only sanitizer for post-login redirect targets. Accepts only a
 * single-slash absolute path made of printable, non-whitespace characters:
 * browsers strip tab/CR/LF anywhere in a URL and treat '\\' like '/', so
 * `/<TAB>/evil.example` or `/\\evil.example` would become `//evil.example`
 * (protocol-relative, off-site) after redirect. The resolved URL must also
 * stay on the same origin, which catches encoded and exotic forms. */
const RETURN_TO_SAFE = /^\/[^\s\\\u0000-\u001f\u007f-\u009f]*$/;
export function sanitizeReturnTo(raw: string | undefined): string {
  if (raw === undefined) return '/';
  if (raw.length > 2048 || !RETURN_TO_SAFE.test(raw) || raw.startsWith('//')) return '/';
  try {
    const resolved = new URL(raw, 'http://return-to.invalid');
    if (resolved.origin !== 'http://return-to.invalid' || resolved.pathname.startsWith('//')) {
      return '/';
    }
  } catch {
    return '/';
  }
  return raw;
}
