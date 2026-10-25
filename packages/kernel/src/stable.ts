import { useState } from 'react';

/**
 * Keeps the previous value while `same` says the new one is equal, so a value rebuilt every render keeps one identity
 * (#824). It adjusts state during render, never a ref: React re-runs this component at once when the value really changed.
 */
export function useStable<T>(value: T, same: (held: T, next: T) => boolean): T {
  const [held, setHeld] = useState(value);
  if (held === value || same(held, value)) return held;
  setHeld(value);
  return value;
}

/** Equal when both objects have the same keys with `===` values. */
export function shallowEqual<T extends object>(a: T, b: T): boolean {
  const keys = Object.keys(a) as (keyof T)[];
  return keys.length === Object.keys(b).length && keys.every(key => Object.hasOwn(b, key) && a[key] === b[key]);
}

/** Equal when both arrays have the same length with `===` items. */
export function sameItems<T>(a: readonly T[], b: readonly T[]): boolean {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}
