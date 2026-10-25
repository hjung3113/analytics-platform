import type { SpaceDef } from './menu.js';
import type { Pair } from './url.js';

/** `returnTo` is navigation state (the way back), never screen state: stores that replay URLs or page pairs drop it (#760, ADR-0081 UX-10). */
export const RETURN_TO_KEY = 'returnTo';

/** The same page pairs without `returnTo`, for anything that records or replays a screen (last screen, recents, query history, VOC Context). */
export function withoutReturnTo(pairs: readonly Pair[]): Pair[] {
  return pairs.filter(([key]) => key !== RETURN_TO_KEY);
}

/** True when the space carries `returnTo` between its menus, i.e. it is return-aware (`SpaceDef.carriedPageKeys`, ADR-0081 UX-10). */
export function carriesReturnTo(space: Pick<SpaceDef, 'carriedPageKeys'> | null | undefined): boolean {
  return (space?.carriedPageKeys ?? []).includes(RETURN_TO_KEY);
}
