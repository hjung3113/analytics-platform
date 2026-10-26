/** Pure geometry of the floating window. Coordinates are relative to the caller-measured `area` (its own left/top only offset the drawing). */
export type FloatingArea = { left: number; top: number; width: number; height: number };
export type FloatingGeometry = { x: number; y: number; width: number; height: number };
export type FloatingSize = { width: number; height: number };
export type FloatingPlacePreset = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';
export type FloatingSizePreset = 'small' | 'medium' | 'large';
export type FloatingHandle = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';

export const FLOATING_MIN_SIZE: FloatingSize = { width: 640, height: 420 };
export const FLOATING_STEP = 8;
export const FLOATING_STEP_FAR = 48;

const clamp = (value: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, value));

/** The displayed geometry: size within [min(minSize, area), area], position inside the area. A display value only; the stored geometry is never rewritten by it. */
export function clampGeometry(geometry: FloatingGeometry, area: FloatingArea, minSize: FloatingSize): FloatingGeometry {
  const width = clamp(geometry.width, Math.min(minSize.width, area.width), area.width);
  const height = clamp(geometry.height, Math.min(minSize.height, area.height), area.height);
  return { width, height, x: clamp(geometry.x, 0, area.width - width), y: clamp(geometry.y, 0, area.height - height) };
}

/** Whether the area can hold the window: at least `minSize` and at least `narrowBelow` wide (the caller picks `fill` when it cannot). */
export function fitsArea(area: FloatingArea, minSize: FloatingSize, narrowBelow = 0): boolean {
  return area.width >= Math.max(minSize.width, narrowBelow) && area.height >= minSize.height;
}

/** Moves the window (keeping its size) to one of five spots in the area. */
export function placeGeometry(preset: FloatingPlacePreset, geometry: FloatingGeometry, area: FloatingArea, minSize: FloatingSize): FloatingGeometry {
  const g = clampGeometry(geometry, area, minSize);
  const right = area.width - g.width;
  const bottom = area.height - g.height;
  const x = preset === 'top-left' || preset === 'bottom-left' ? 0 : preset === 'center' ? right / 2 : right;
  const y = preset === 'top-left' || preset === 'top-right' ? 0 : preset === 'center' ? bottom / 2 : bottom;
  return { ...g, x, y };
}

const SIZE_FRACTION: Record<FloatingSizePreset, readonly [number, number]> = { small: [0.45, 0.55], medium: [0.6, 0.7], large: [0.85, 0.9] };

/** Resizes to a share of the area, keeping the top-left corner where it fits (clamped back into the area). */
export function sizeGeometry(preset: FloatingSizePreset, geometry: FloatingGeometry, area: FloatingArea, minSize: FloatingSize): FloatingGeometry {
  const [fw, fh] = SIZE_FRACTION[preset];
  return clampGeometry({ x: geometry.x, y: geometry.y, width: Math.round(area.width * fw), height: Math.round(area.height * fh) }, area, minSize);
}

/** One arrow-key step: plain arrows move, `resize` (Alt) grows or shrinks from the bottom-right edge. */
export function stepGeometry(geometry: FloatingGeometry, key: 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown', far: boolean, resize: boolean, area: FloatingArea, minSize: FloatingSize): FloatingGeometry {
  const step = far ? FLOATING_STEP_FAR : FLOATING_STEP;
  const dx = key === 'ArrowLeft' ? -step : key === 'ArrowRight' ? step : 0;
  const dy = key === 'ArrowUp' ? -step : key === 'ArrowDown' ? step : 0;
  const g = clampGeometry(geometry, area, minSize);
  return resize ? resizeGeometry('se', g, dx, dy, area, minSize) : clampGeometry({ ...g, x: g.x + dx, y: g.y + dy }, area, minSize);
}

/** Pointer resize from `start` by a pixel delta; the opposite edge stays put, and the window never leaves the area or shrinks below `minSize`. */
export function resizeGeometry(handle: FloatingHandle, start: FloatingGeometry, dx: number, dy: number, area: FloatingArea, minSize: FloatingSize): FloatingGeometry {
  const minW = Math.min(minSize.width, area.width);
  const minH = Math.min(minSize.height, area.height);
  let { x, y, width, height } = start;
  if (handle.includes('e')) width = clamp(start.width + dx, minW, area.width - start.x);
  if (handle.includes('s')) height = clamp(start.height + dy, minH, area.height - start.y);
  if (handle.includes('w')) { width = clamp(start.width - dx, minW, start.x + start.width); x = start.x + start.width - width; }
  if (handle.includes('n')) { height = clamp(start.height - dy, minH, start.y + start.height); y = start.y + start.height - height; }
  return { x, y, width, height };
}
