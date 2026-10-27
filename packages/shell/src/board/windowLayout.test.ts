import { describe, expect, it } from 'vitest';
import { fillArea, toastBand, windowArea } from './windowLayout';

describe('window area (893d2)', () => {
  it('starts below the page header and leaves the toast strip free', () => {
    expect(windowArea(1200, 900, 50)).toEqual({ left: 0, top: 50, width: 1200, height: 900 - 50 - toastBand('bottom-4') });
  });
  it('without a page header it starts at the top; a tiny box never goes negative', () => {
    expect(windowArea(1200, 900, 0).top).toBe(0);
    expect(windowArea(300, 40, 50).height).toBe(0);
  });
  it('the fill display takes the whole box', () => {
    expect(fillArea(800, 900)).toEqual({ left: 0, top: 0, width: 800, height: 900 });
  });
});
