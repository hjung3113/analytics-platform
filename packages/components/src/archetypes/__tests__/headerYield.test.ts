import { describe, expect, it } from 'vitest';
import { type HeaderYieldState, nextHeaderYield, openHeaderYield, YIELD_SLACK } from '../headerYield';

const settle = (width: number, state: HeaderYieldState, overflowAt: (state: HeaderYieldState) => boolean) => {
  let current = state;
  for (let i = 0; i < 6; i++) {
    const next = nextHeaderYield(width, current, overflowAt(current));
    if (JSON.stringify(next) === JSON.stringify(current)) return next;
    current = next;
  }
  throw new Error(`no fixed point at ${width}`);
};
const never = () => false;

describe('nextHeaderYield', () => {
  it.each([
    [1100, [false, false, false]],
    [990, [true, false, false]],
    [830, [true, true, false]],
    [700, [true, true, true]],
  ])('width %i with no overflow follows the fixed widths', (width, [description, trust, badge]) => {
    expect(nextHeaderYield(width, openHeaderYield, false).yielded).toEqual({ description, trust, badge });
  });

  it('closes the next stage in order while the header overflows', () => {
    let state = openHeaderYield;
    const order: string[] = [];
    for (let i = 0; i < 4; i++) {
      state = nextHeaderYield(1024, state, true);
      order.push(`${state.yielded.description}${state.yielded.trust}${state.yielded.badge}`);
    }
    expect(order).toEqual(['truefalsefalse', 'truetruefalse', 'truetruetrue', 'truetruetrue']);
  });

  it('does not reopen a forced stage until the width is the slack above where it overflowed', () => {
    const forcedState = nextHeaderYield(1024, { ...openHeaderYield, yielded: { description: true, trust: false, badge: false }, forced: { description: 1000, trust: 0, badge: 0 } }, true);
    expect(forcedState.yielded.trust).toBe(true);
    const forcedAt = forcedState.forced.trust;
    expect(forcedAt).toBe(1025);
    expect(nextHeaderYield(forcedAt + YIELD_SLACK - 1, forcedState, false).yielded.trust).toBe(true);
    expect(nextHeaderYield(forcedAt + YIELD_SLACK, forcedState, false).yielded.trust).toBe(false);
  });

  it('settles without oscillating when overflow depends on the yielded stages', () => {
    // Overflows at 1024 until the trust summary is compact, fits otherwise: the shape of #398 UX-1.
    const overflowAt = (state: HeaderYieldState) => !state.yielded.trust;
    for (const width of [1024, 1030, 1040, 1056, 1057, 1058, 1100]) {
      const fixed = settle(width, openHeaderYield, overflowAt);
      expect(nextHeaderYield(width, fixed, overflowAt(fixed))).toEqual(fixed);
      // A 1px wobble either way reaches a fixed point (settle throws otherwise) and keeps the stage closed.
      for (const wobble of [1, -1, 1, -1]) {
        expect(settle(width + wobble, fixed, overflowAt).yielded.trust).toBe(true);
      }
    }
  });

  it('keeps scrolling as the last resort once every stage is spent', () => {
    const spent = nextHeaderYield(300, openHeaderYield, true);
    expect(nextHeaderYield(300, spent, true)).toEqual(spent);
  });

  it('leaves a header that fits open', () => {
    expect(settle(1317, openHeaderYield, never)).toEqual(openHeaderYield);
  });
});
