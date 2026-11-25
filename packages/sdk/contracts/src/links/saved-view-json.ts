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
