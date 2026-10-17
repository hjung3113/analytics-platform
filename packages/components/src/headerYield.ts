// Header's own width, not the viewport (#303, ADR-0035). Collapsing frees no container width, so the
// slack is what stops a width sitting on the boundary from opening and closing on every measure.
// The fixed widths are only a first guess; the left group's minimum is rem-based and grows with the star and
// the yielded description icon, so measured overflow (`overflow`) forces whatever stage the widths missed (#398 UX-1).
const YIELD_AT = { description: 1000, trust: 840, badge: 760 } as const;
export const YIELD_SLACK = 32;

const STAGES = ['description', 'trust', 'badge'] as const;
export type HeaderYield = { description: boolean; trust: boolean; badge: boolean };
/** Header width (+1) at which overflow forced a stage; 0 = never forced. The stage opens again only YIELD_SLACK above it. */
export type HeaderYieldForced = { description: number; trust: number; badge: number };
export type HeaderYieldState = { yielded: HeaderYield; forced: HeaderYieldForced };

export const openHeaderYield: HeaderYieldState = {
  yielded: { description: false, trust: false, badge: false },
  forced: { description: 0, trust: 0, badge: 0 },
};

/**
 * Yield order description → Data Trust summary → provisional badge (ADR-0035). `overflow` is the header's own
 * `scrollWidth > clientWidth` after the previous state rendered: while it is true the next open stage closes.
 * A stage that overflow closed stays closed until the width is `YIELD_SLACK` above where it overflowed, so a
 * width on the boundary cannot flip it on every measure.
 */
export function nextHeaderYield(width: number, prev: HeaderYieldState, overflow: boolean): HeaderYieldState {
  const yielded = { ...prev.yielded };
  const forced = { ...prev.forced };
  for (const stage of STAGES) {
    const at = Math.max(YIELD_AT[stage], prev.forced[stage]);
    yielded[stage] = prev.yielded[stage] ? width < at + YIELD_SLACK : width < at;
  }
  // A later stage never closes while an earlier one is open.
  if (yielded.badge) yielded.trust = true;
  if (yielded.trust) yielded.description = true;
  if (overflow) {
    const stage = STAGES.find(name => !yielded[name]);
    if (stage) {
      yielded[stage] = true;
      forced[stage] = Math.ceil(width) + 1;
    }
  }
  return { yielded, forced };
}
