import { describe, expect, it } from 'vitest';
import { clampGroupPan, groupPanMax, groupPanKey, revealGroupCell } from '../columnGroupPan';

describe('column group pan math', () => {
  it('has no travel when the content fits and clamps both ends', () => {
    expect(groupPanMax(280, 320)).toBe(0);
    expect(groupPanMax(900, 320)).toBe(580);
    expect(clampGroupPan(-10, 900, 320)).toBe(0);
    expect(clampGroupPan(900, 900, 320)).toBe(580);
    expect(clampGroupPan(120, 900, 320)).toBe(120);
  });
  it('moves by member boundaries and supports Home/End', () => {
    const widths = [150, 200, 250];
    expect(groupPanKey('ArrowRight', 0, widths, 320)).toBe(150);
    expect(groupPanKey('ArrowRight', 150, widths, 320)).toBe(280);
    expect(groupPanKey('ArrowLeft', 200, widths, 320)).toBe(150);
    expect(groupPanKey('ArrowLeft', 150, widths, 320)).toBe(0);
    expect(groupPanKey('Home', 150, widths, 320)).toBe(0);
    expect(groupPanKey('End', 0, widths, 320)).toBe(280);
  });
  it('reveals only the hidden part of a focused cell, including oversized cells', () => {
    expect(revealGroupCell(0, 300, 450, 600, 320)).toBe(130);
    expect(revealGroupCell(200, 100, 250, 600, 320)).toBe(100);
    expect(revealGroupCell(100, 150, 250, 600, 320)).toBe(100);
    expect(revealGroupCell(0, 100, 500, 600, 320)).toBe(100);
  });
});
