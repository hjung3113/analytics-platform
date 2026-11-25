/** Transient UI state and raw data/engine dumps that must never be saved (21.1). */
const TRANSIENT_KEY = /^(hover|zoom|modal|openModal|draft)/i;
const RAW_KEYS: ReadonlySet<string> = new Set(['rows', 'rawData', 'engineState']);
const DOCK_KEY = /^dock/i;
export const isForbiddenSavedViewKey = (key: string): boolean => TRANSIENT_KEY.test(key) || RAW_KEYS.has(key) || DOCK_KEY.test(key);

export function forbiddenKey(value: unknown, path: string): string | null {
  if (typeof value !== 'object' || value === null) return null;
  for (const [k, v] of Object.entries(value)) {
    if (!Array.isArray(value) && isForbiddenSavedViewKey(k)) return `${path}.${k}`;
    const bad = forbiddenKey(v, `${path}.${k}`);
    if (bad) return bad;
  }
  return null;
}

export function nonSerializable(value: unknown, path: string, ancestors: unknown[], options: { requireDenseArrays?: boolean } = {}): string | null {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? null : `${path}: non-finite number`;
  if (typeof value !== 'object') return `${path}: ${typeof value} is not serializable`;
  if (ancestors.includes(value)) return `${path}: circular reference`;
  if (!Array.isArray(value)) { const proto = Object.getPrototypeOf(value); if (proto !== Object.prototype && proto !== null) return `${path}: not a plain object`; }
  if (options.requireDenseArrays && Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) if (!Object.hasOwn(value, i)) return `${path}.${i}: missing array value`;
  }
  for (const [k, v] of Object.entries(value)) { const bad = nonSerializable(v, `${path}.${k}`, [...ancestors, value], options); if (bad) return bad; }
  return null;
}

const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

/** Text every saved-view path stores: no NUL and no unpaired surrogate (PostgreSQL `text`/`jsonb` cannot hold them). The one rule the server, the HTTP adapter, the mock store and the browser import share (#2991). */
export function isWellFormedText(value: string): boolean {
  return !value.includes('\u0000') && !LONE_SURROGATE.test(value);
}

/** Path of the first string value or object key, at any depth, that is not well-formed text; null when all are. Iterative and cycle-safe. */
export function malformedTextPath(value: unknown, path = 'view'): string | null {
  const pending: [unknown, string][] = [[value, path]];
  const seen = new Set<object>();
  for (let next = pending.pop(); next; next = pending.pop()) {
    const [node, at] = next;
    if (typeof node === 'string') {
      if (!isWellFormedText(node)) return at;
    } else if (typeof node === 'object' && node !== null && !seen.has(node)) {
      seen.add(node);
      // Arrays by index, like JSON: a non-enumerable index is still sent, an extra named property never is.
      // Strings are judged in place and only objects are queued, so a long sparse array costs no allocation per hole.
      if (Array.isArray(node)) for (let i = 0; i < node.length; i += 1) {
        const child: unknown = node[i];
        if (typeof child === 'string') { if (!isWellFormedText(child)) return `${at}.${i}`; }
        else if (typeof child === 'object' && child !== null) pending.push([child, `${at}.${i}`]);
      }
      else for (const [key, child] of Object.entries(node)) {
        if (!isWellFormedText(key)) return `${at} key`;
        pending.push([child, `${at}.${key}`]);
      }
    }
  }
  return null;
}
