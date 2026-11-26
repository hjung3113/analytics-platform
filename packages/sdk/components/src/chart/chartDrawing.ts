import { useState } from 'react';
import type { EChartsCoreOption } from 'echarts/core';

function isPlain(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** Drawing equality. Two functions count as equal: a rebuild mints new formatters for the same picture. */
export function sameDrawing(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a === 'function' && typeof b === 'function') return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!sameDrawing(a[i], b[i])) return false;
    return true;
  }
  if (!isPlain(a) || !isPlain(b)) return false;
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(b, key) || !sameDrawing(a[key], b[key])) return false;
  }
  return true;
}

/**
 * Inside a declared panel, keep the last equal option so ECharts is not handed a new object.
 * `key` holds what only lives inside formatter closures (the language): a new key drops the held option.
 */
export function useHeldDrawing(next: EChartsCoreOption, hold: boolean, key: string): EChartsCoreOption {
  const [held, setHeld] = useState({ option: next, key });
  if (!hold) return next;
  if (held.key === key && sameDrawing(held.option, next)) return held.option;
  setHeld({ option: next, key });
  return next;
}
