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
