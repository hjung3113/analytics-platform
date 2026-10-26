export type Range = readonly [number, number];
export type GlobalContext = Readonly<{ scope: string; indexRange: Range | null }>;
export type PageFilter = { threshold: number };
export type ChartLocalState = { viewport: Range; brush: Range | null; compare: boolean; visibleA: boolean; visibleB: boolean };
export const initialChart = (): ChartLocalState => ({ viewport: [0, 20], brush: null, compare: false, visibleA: true, visibleB: true });
export const validRange = (r: Range): boolean => r.every(Number.isFinite) && r[0] >= 0 && r[0] < r[1] && r[1] <= 20;
export const rangeText = (r: Range | null): string => r ? `${r[0]}–${r[1]}` : '없음';
export const fixture = Array.from({ length: 21 }, (_, x) => ({ x, A: 20 + (x * 7) % 41, B: 15 + (x * 11) % 46 }));
export function zoom(r: Range): Range { const quarter = (r[1] - r[0]) / 4; return [r[0] + quarter, r[1] - quarter]; }
export function pan(r: Range, delta: number): Range { const shift = Math.max(-r[0], Math.min(20 - r[1], delta)); return [r[0] + shift, r[1] + shift]; }
