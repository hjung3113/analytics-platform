import { useInsertionEffect, useRef, type RefObject } from 'react';

/**
 * The latest render's value, for an effect to read without listing it as a dependency. Updated in an insertion effect, so layout and passive
 * effects of the same commit already see it. Stands in for `useEffectEvent`, which needs React 19.2 while the SDK's peer range starts at 19.0 (#2955).
 */
export function useLatestRef<T>(value: T): RefObject<T> {
  const latest = useRef(value);
  useInsertionEffect(() => { latest.current = value; });
  return latest;
}
