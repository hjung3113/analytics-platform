// Input safety shared by the saved-view module: opaque ids are never cast blindly, and a string PostgreSQL
// cannot store (NUL, lone surrogate) is a documented `invalid`, never a 500.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Lower-cased uuid, or null for any other (opaque, unknown, forged) string. */
export function asUuid(value: string): string | null {
  return UUID.test(value) ? value.toLowerCase() : null;
}

const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

/** A string `text`/`jsonb` can hold: no NUL and no unpaired surrogate. */
export function isPgSafeString(value: string): boolean {
  if (value.includes('\u0000')) return false;
  return !LONE_SURROGATE.test(value);
}

/** Every string and every key, at any depth, is storable. Iterative: depth is already bounded by the wire schema. */
export function isPgSafeDeep(value: unknown): boolean {
  const pending: unknown[] = [value];
  for (let next = pending.pop(); next !== undefined || pending.length > 0; next = pending.pop()) {
    if (typeof next === 'string') {
      if (!isPgSafeString(next)) return false;
    } else if (typeof next === 'object' && next !== null) {
      for (const [key, child] of Object.entries(next)) {
        if (!Array.isArray(next) && !isPgSafeString(key)) return false;
        pending.push(child);
      }
    }
  }
  return true;
}
