import { describe, expect, it } from 'vitest';
import { clampGeometry, fitsArea, placeGeometry, resizeGeometry, sizeGeometry, stepGeometry, type FloatingArea, type FloatingGeometry } from '../geometry';

const area: FloatingArea = { left: 100, top: 50, width: 1200, height: 800 };
const min = { width: 640, height: 420 };
const g: FloatingGeometry = { x: 100, y: 80, width: 700, height: 500 };

describe('clampGeometry', () => {
  it('keeps a geometry that already fits', () => { expect(clampGeometry(g, area, min)).toEqual(g); });
  it.each([
    ['left/top overflow', { ...g, x: -50, y: -9 }, { ...g, x: 0, y: 0 }],
    ['right/bottom overflow', { ...g, x: 900, y: 700 }, { ...g, x: 500, y: 300 }],
    ['wider than the area', { ...g, width: 5000, height: 5000 }, { x: 0, y: 0, width: 1200, height: 800 }],
    ['smaller than minSize', { ...g, width: 100, height: 100 }, { ...g, width: 640, height: 420 }],
  ])('%s', (_name, input, expected) => { expect(clampGeometry(input, area, min)).toEqual(expected); });
  it('lets the area win when it is smaller than minSize', () => {
    expect(clampGeometry(g, { left: 0, top: 0, width: 500, height: 300 }, min)).toEqual({ x: 0, y: 0, width: 500, height: 300 });
  });
  it('does not mutate its input', () => {
    const input = { ...g, x: -50 };
    clampGeometry(input, area, min);
    expect(input.x).toBe(-50);
  });
});

describe('fitsArea', () => {
  it.each([
    [{ ...area, width: 1200 }, 900, true],
    [{ ...area, width: 899 }, 900, false],
    [{ ...area, width: 700 }, 0, true],
    [{ ...area, width: 639 }, 0, false],
    [{ ...area, height: 419 }, 0, false],
  ])('%j narrowBelow=%i -> %s', (a, narrowBelow, expected) => { expect(fitsArea(a, min, narrowBelow)).toBe(expected); });
});

describe('placeGeometry', () => {
  it.each([
    ['top-left', 0, 0], ['top-right', 500, 0], ['bottom-left', 0, 300], ['bottom-right', 500, 300], ['center', 250, 150],
  ] as const)('%s keeps the size', (preset, x, y) => { expect(placeGeometry(preset, g, area, min)).toEqual({ ...g, x, y }); });
  it('clamps an oversized window before placing it', () => {
    expect(placeGeometry('bottom-right', { ...g, width: 9999, height: 9999 }, area, min)).toEqual({ x: 0, y: 0, width: 1200, height: 800 });
  });
});

describe('sizeGeometry', () => {
  it.each([['small', 640, 440], ['medium', 720, 560], ['large', 1020, 720]] as const)('%s', (preset, width, height) => {
    expect(sizeGeometry(preset, { ...g, x: 0, y: 0 }, area, min)).toEqual({ x: 0, y: 0, width, height });
  });
  it('pulls the window back inside when the new size would overflow', () => {
    expect(sizeGeometry('large', { ...g, x: 600, y: 500 }, area, min)).toEqual({ x: 180, y: 80, width: 1020, height: 720 });
  });
  it('never goes below minSize (small of a 1200 wide area is 540 -> 640)', () => {
    expect(sizeGeometry('small', g, { ...area, width: 800, height: 500 }, min)).toMatchObject({ width: 640, height: 420 });
  });
});

describe('stepGeometry', () => {
  it('moves by 8 and by 48 with the far flag', () => {
    expect(stepGeometry(g, 'ArrowRight', false, false, area, min)).toEqual({ ...g, x: 108 });
    expect(stepGeometry(g, 'ArrowUp', true, false, area, min)).toEqual({ ...g, y: 32 });
  });
  it('resizes with the resize flag, by the same steps', () => {
    expect(stepGeometry(g, 'ArrowRight', false, true, area, min)).toEqual({ ...g, width: 708 });
    expect(stepGeometry(g, 'ArrowDown', true, true, area, min)).toEqual({ ...g, height: 548 });
  });
  it('stays inside the area and above minSize', () => {
    expect(stepGeometry({ ...g, x: 3 }, 'ArrowLeft', false, false, area, min).x).toBe(0);
    expect(stepGeometry({ ...g, x: 500 }, 'ArrowRight', true, false, area, min).x).toBe(500);
    expect(stepGeometry({ ...g, width: 645 }, 'ArrowLeft', false, true, area, min).width).toBe(640);
    expect(stepGeometry({ ...g, x: 560, width: 640 }, 'ArrowRight', false, true, area, min).width).toBe(640);
  });
});

describe('resizeGeometry', () => {
  it('east/south grow and clamp at the area edge', () => {
    expect(resizeGeometry('se', g, 50, 40, area, min)).toEqual({ ...g, width: 750, height: 540 });
    expect(resizeGeometry('se', g, 9999, 9999, area, min)).toEqual({ ...g, width: 1100, height: 720 });
  });
  it('west/north keep the opposite edge and clamp at minSize and the area origin', () => {
    expect(resizeGeometry('nw', g, 30, 20, area, min)).toEqual({ x: 130, y: 100, width: 670, height: 480 });
    expect(resizeGeometry('nw', g, 500, 500, area, min)).toEqual({ x: 160, y: 160, width: 640, height: 420 });
    expect(resizeGeometry('nw', g, -9999, -9999, area, min)).toEqual({ x: 0, y: 0, width: 800, height: 580 });
  });
  it.each(['n', 's', 'e', 'w'] as const)('edge handle %s changes one axis only', (h) => {
    const next = resizeGeometry(h, g, 20, 20, area, min);
    expect((next.width !== g.width) !== (next.height !== g.height)).toBe(true);
  });
});
