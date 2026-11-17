/** Pure visual travel math; offsets never enter preferences, URLs or transfers. */
export const groupPanMax = (content: number, width: number) => Math.max(0, content - width);
export const clampGroupPan = (offset: number, content: number, width: number) => Math.max(0, Math.min(groupPanMax(content, width), offset));

export function groupPanKey(key: string, offset: number, widths: readonly number[], width: number): number {
  let content = 0;
  const boundaries = [0, ...widths.map(member => { content += member; return content; })];
  const max = groupPanMax(content, width);
  switch (key) {
    case 'Home': return 0;
    case 'End': return max;
    case 'ArrowRight': return Math.min(max, boundaries.find(boundary => boundary > offset) ?? max);
    case 'ArrowLeft': return Math.max(0, [...boundaries].reverse().find(boundary => boundary < offset) ?? 0);
    default: return clampGroupPan(offset, content, width);
  }
}

export function revealGroupCell(offset: number, start: number, end: number, content: number, width: number): number {
  if (start < offset) return clampGroupPan(start, content, width);
  if (end > offset + width) return clampGroupPan(Math.min(start, end - width), content, width);
  return clampGroupPan(offset, content, width);
}

/** Release stop for a drag: the nearest member boundary (or the far end), so a pan never rests on half a column at the group's start. */
export function snapGroupPan(offset: number, widths: readonly number[], width: number): number {
  const content = widths.reduce((sum, member) => sum + member, 0);
  const max = groupPanMax(content, width);
  let start = 0;
  const stops = [...widths.map(member => { const at = start; start += member; return at; }).filter(at => at < max), max];
  return stops.reduce((best, stop) => Math.abs(stop - offset) < Math.abs(best - offset) ? stop : best, stops[0]);
}
