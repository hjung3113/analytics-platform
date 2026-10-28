import type { CarrySetDef } from '../menu/menu.js';
import type { Pair } from './url.js';

/** `returnTo` is navigation state (the way back), never screen state: stores that replay URLs or page pairs drop it (#760, ADR-0081 UX-10). */
export const RETURN_TO_KEY = 'returnTo';

/** The same page pairs without `returnTo`, for anything that records or replays a screen (last screen, recents, query history, VOC Context). */
export function withoutReturnTo(pairs: readonly Pair[]): Pair[] {
  return pairs.filter(([key]) => key !== RETURN_TO_KEY);
}

/** True when the carry set lists `returnTo`, i.e. it is return-aware (`CarrySetDef.pageKeys`, ADR-0081 UX-10). The list is the only marker. */
export function carriesReturnTo(carrySet: Pick<CarrySetDef, 'pageKeys'> | null | undefined): boolean {
  return (carrySet?.pageKeys ?? []).includes(RETURN_TO_KEY);
}
