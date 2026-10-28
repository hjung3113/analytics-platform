// PUBLIC_ATTACHMENT_ORIGIN validation (issue #402).
//
// The value is interpolated verbatim into the CSP (server.ts img-src and
// connect-src), so anything beyond a strict origin is a header-injection or
// breakage risk. Accepted values:
//   - the quoted literal 'self' (the default; everything same-origin), or
//   - a bare origin `https://host[:port]`, or
//   - outside production only: `http://localhost[:port]` / `http://127.0.0.1[:port]`.
//
// Everything else is rejected at config load: paths (including a bare
// trailing `/`), query, fragment, credentials, wildcards, whitespace and
// CSP separators (`;` `,`), other schemes, malformed strings.
//
// Returns null when the value is acceptable, otherwise a reason message.
// Messages never echo the input value (it may contain credentials).

type OriginIssue =
  | 'empty'
  | 'separator'
  | 'wildcard'
  | 'unparsable'
  | 'credentials'
  | 'non_canonical'
  | 'host'
  | 'local_http_in_production'
  | 'scheme';

// Origin grammar for PUBLIC_ATTACHMENT_ORIGIN. Returns the first failing rule;
// the caller words its own message.
function checkOrigin(value: string, nodeEnv: string): OriginIssue | null {
  if (value.trim().length === 0) return 'empty';
  if (value.trim() !== value || /[\s;,]/.test(value)) return 'separator';
  if (value.includes('*')) return 'wildcard';

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return 'unparsable';
  }
  if (url.username.length > 0 || url.password.length > 0) return 'credentials';
  // Exact-origin equality rejects paths, query, fragment, a bare trailing
  // '/', and any parser normalization (uppercase host, IDN, empty port).
  if (url.origin !== value) return 'non_canonical';
  // URL validity is not CSP host-source validity: reject IPv6 literals and
  // anything outside the letters-digits-hyphen DNS label grammar (IDN hosts
  // arrive already punycoded; underscores are not valid in CSP hosts).
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.?$/.test(url.hostname)) {
    return 'host';
  }
  const isLocalHttp =
    url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
  if (isLocalHttp) return nodeEnv === 'production' ? 'local_http_in_production' : null;
  if (url.protocol !== 'https:') return 'scheme';
  return null;
}

export function validateAttachmentOrigin(value: string, nodeEnv: string): string | null {
  const PREFIX = 'PUBLIC_ATTACHMENT_ORIGIN';
  if (value === "'self'") return null;
  if (value === 'self') {
    return `${PREFIX} must be the quoted literal 'self' (with single quotes)`;
  }
  switch (checkOrigin(value, nodeEnv)) {
    case null:
      return null;
    case 'empty':
      return `${PREFIX} must not be empty; use 'self' (quoted) or an https:// origin like https://cdn.example.com`;
    case 'separator':
      return `${PREFIX} must not contain whitespace, ';', or ',' (they can break the CSP header)`;
    case 'wildcard':
      return `${PREFIX} must not contain wildcards (*)`;
    case 'unparsable':
      return `${PREFIX} must be 'self' (quoted) or an absolute origin like https://cdn.example.com`;
    case 'credentials':
      return `${PREFIX} must not contain credentials (user:password@)`;
    case 'non_canonical':
      return `${PREFIX} must be a bare origin in canonical form (https://host[:port]: lowercase host, no default port, no path, query, fragment, or trailing slash)`;
    case 'host':
      return `${PREFIX} host must be a plain DNS name or IPv4 address usable in a CSP host-source`;
    case 'local_http_in_production':
      return `${PREFIX} may only use http://localhost[:port] or http://127.0.0.1[:port] outside production`;
    case 'scheme':
      return `${PREFIX} must use https (http is allowed only for localhost/127.0.0.1 outside production)`;
  }
}
