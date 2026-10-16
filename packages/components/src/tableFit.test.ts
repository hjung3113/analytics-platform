import { describe, expect, it } from 'vitest';
import { availableRowHeight, ROW_AREA_FLOOR } from './tableFit';

// Coordinates: scroll-content axis, scrolled to the top (see availableRowHeight).
const base = { containerHeight: 900, stickyTop: 80, viewportTopInContent: 300, below: 120 };

describe('availableRowHeight (ADR-0037 R)', () => {
  it('is the container minus everything above (sticky header once) and below the row viewport', () => {
    // 900 − 80 (sticky) − (300 − 80 above the sticky edge) − 120 = 480; the sticky header is not subtracted twice.
    expect(availableRowHeight(base)).toBe(480);
  });

  it('counts the sticky header once even when the viewport sits right under it', () => {
    expect(availableRowHeight({ ...base, viewportTopInContent: 80 })).toBe(700);
  });

  it('subtracts a following sibling and its gap from below', () => {
    const withCaption = availableRowHeight({ ...base, below: 120 + 24 + 16 });
    expect(withCaption).toBe(480 - 40);
    expect(withCaption).toBeLessThan(availableRowHeight(base));
  });

  it('never goes under the 240px floor', () => {
    expect(availableRowHeight({ ...base, containerHeight: 400 })).toBe(ROW_AREA_FLOOR);
    expect(ROW_AREA_FLOOR).toBe(240);
  });

  it('floors fractional pixels', () => {
    expect(availableRowHeight({ ...base, containerHeight: 900.7 })).toBe(480);
  });
});
